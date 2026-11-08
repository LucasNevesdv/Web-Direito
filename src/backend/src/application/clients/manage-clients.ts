import type { TokensAcesso } from '../authentication/authentication-contracts.js';
import { Cliente, type TipoPessoaCliente } from '../../domain/clients/client.js';
import { ContatoCliente } from '../../domain/clients/client-contact.js';
import type {
  ClienteDetalheDto,
  ClienteResumoDto,
  ContatoClienteDto,
  DadosCadastroCliente,
  DadosEdicaoCliente,
  DadosMutacaoContatoCliente,
  EventoLinhaTempoClienteDto,
  FiltroClientes,
  IndicioDuplicidadeCliente,
  OperacoesClientes,
  RepositorioClientes,
  VinculosRelacionadosClienteDto,
} from './client-contracts.js';
import { ErroCliente, PoliticaClientes } from './client-policy.js';

export class GestaoClientes {
  constructor(
    private readonly repositorio: RepositorioClientes,
    private readonly tokens: TokensAcesso,
  ) {}

  private async executar<T>(token: string, operacao: (clientes: OperacoesClientes) => Promise<T>): Promise<T> {
    const contexto = await this.tokens.validarTokenDeAcesso(token);
    return this.repositorio.executar(contexto, operacao);
  }

  async listarClientes(token: string, filtro: FiltroClientes): Promise<{
    clientes: ClienteResumoDto[];
    total: number;
    pagina: number;
    tamanhoPagina: number;
  }> {
    return this.executar(token, async (clientes) => {
      PoliticaClientes.exigir(clientes.autor, 'CLIENTE_VISUALIZAR');
      const resultado = await clientes.listarClientes(filtro);
      return {
        ...resultado,
        pagina: filtro.pagina,
        tamanhoPagina: filtro.tamanhoPagina,
      };
    });
  }

  async consultarCliente(token: string, idCliente: string): Promise<ClienteDetalheDto> {
    return this.executar(token, async (clientes) => {
      PoliticaClientes.exigir(clientes.autor, 'CLIENTE_VISUALIZAR');
      const detalhe = await clientes.buscarClientePorId(idCliente);
      if (!PoliticaClientes.podeVisualizarObservacoes(clientes.autor)) {
        return {
          ...detalhe,
          observacoesInternas: null,
        };
      }
      return detalhe;
    });
  }

  async verificarDuplicidades(
    token: string,
    dados: {
      tipoPessoa?: TipoPessoaCliente;
      documento: string;
      nome: string;
      email?: string | null;
      telefone?: string | null;
      ignorarIdCliente?: string;
    },
  ): Promise<{ duplicidades: IndicioDuplicidadeCliente[] }> {
    return this.executar(token, async (clientes) => {
      PoliticaClientes.exigir(clientes.autor, 'CLIENTE_CADASTRAR');
      const duplicidades = await clientes.verificarDuplicidades(dados);
      return { duplicidades };
    });
  }

  async cadastrarCliente(token: string, dados: DadosCadastroCliente): Promise<ClienteDetalheDto> {
    return this.executar(token, async (clientes) => {
      PoliticaClientes.exigir(clientes.autor, 'CLIENTE_CADASTRAR');
      if (dados.observacoesInternas && !PoliticaClientes.podeVisualizarObservacoes(clientes.autor)) {
        PoliticaClientes.exigir(clientes.autor, 'CLIENTE_VISUALIZAR_OBSERVACOES');
      }

      if (dados.idVinculoResponsavel) {
        const resp = await clientes.validarVinculoResponsavelNoEscritorio(dados.idVinculoResponsavel);
        PoliticaClientes.validarPapelResponsavel(resp.papel);
      }

      const cliente = Cliente.criar({
        idEscritorio: clientes.autor.idEscritorio,
        tipoPessoa: dados.tipoPessoa,
        nome: dados.nome,
        nomeSocial: dados.nomeSocial,
        documento: dados.documento,
        email: dados.email,
        telefone: dados.telefone,
        endereco: dados.endereco,
        observacoesInternas: dados.observacoesInternas,
        idVinculoResponsavel: dados.idVinculoResponsavel,
      });

      const contatos = (dados.contatosIniciais ?? []).map((c) =>
        ContatoCliente.criar({
          idEscritorio: clientes.autor.idEscritorio,
          idCliente: cliente.id,
          nome: c.nome,
          cargoOuRelacao: c.cargoOuRelacao,
          email: c.email,
          telefone: c.telefone,
          observacao: c.observacao,
        }),
      );

      const indicioDuplicidades = await clientes.verificarDuplicidades({
        documento: cliente.documento,
        nome: cliente.nome,
        email: cliente.email,
        telefone: cliente.telefone,
      });

      if (indicioDuplicidades.some((d) => d.motivos.includes('DOCUMENTO_IDENTICO'))) {
        throw new ErroCliente('DOCUMENTO_JA_CADASTRADO', 409);
      }

      if (indicioDuplicidades.length > 0 && dados.confirmarDuplicidadePotencial !== true) {
        throw new ErroCliente('POSSIVEL_DUPLICIDADE', 409, { duplicidades: indicioDuplicidades });
      }

      const detalhe = await clientes.criarCliente(cliente, contatos);
      if (!PoliticaClientes.podeVisualizarObservacoes(clientes.autor)) {
        return {
          ...detalhe,
          observacoesInternas: null,
        };
      }
      return detalhe;
    });
  }

  async editarCliente(token: string, idCliente: string, dados: DadosEdicaoCliente): Promise<ClienteDetalheDto> {
    return this.executar(token, async (clientes) => {
      PoliticaClientes.exigir(clientes.autor, 'CLIENTE_EDITAR');
      const anterior = await clientes.buscarClientePorId(idCliente);

      if (anterior.versao !== dados.versao) {
        throw new ErroCliente('CONFLITO', 409);
      }

      if (dados.observacoesInternas !== undefined && dados.observacoesInternas !== anterior.observacoesInternas) {
        PoliticaClientes.exigir(clientes.autor, 'CLIENTE_VISUALIZAR_OBSERVACOES');
      }

      if (dados.idVinculoResponsavel && dados.idVinculoResponsavel !== anterior.idVinculoResponsavel) {
        const resp = await clientes.validarVinculoResponsavelNoEscritorio(dados.idVinculoResponsavel);
        PoliticaClientes.validarPapelResponsavel(resp.papel);
      }

      const podeVerObs = PoliticaClientes.podeVisualizarObservacoes(clientes.autor);
      const observacoesFinais = podeVerObs ? dados.observacoesInternas : anterior.observacoesInternas;

      const atualizado = Cliente.restaurar({
        id: anterior.id,
        idEscritorio: anterior.idEscritorio,
        tipoPessoa: anterior.tipoPessoa,
        nome: dados.nome,
        nomeSocial: dados.nomeSocial,
        documento: dados.documento,
        email: dados.email,
        telefone: dados.telefone,
        endereco: dados.endereco,
        observacoesInternas: observacoesFinais,
        idVinculoResponsavel: dados.idVinculoResponsavel,
        situacao: anterior.situacao,
        versao: anterior.versao,
        criadoEm: anterior.criadoEm,
        atualizadoEm: new Date(),
      });

      if (atualizado.documento !== anterior.documento) {
        const duplicidades = await clientes.verificarDuplicidades({
          documento: atualizado.documento,
          nome: atualizado.nome,
          ignorarIdCliente: idCliente,
        });
        if (duplicidades.some((d) => d.motivos.includes('DOCUMENTO_IDENTICO'))) {
          throw new ErroCliente('DOCUMENTO_JA_CADASTRADO', 409);
        }
      }

      const detalhe = await clientes.atualizarCliente(anterior, atualizado);
      if (!podeVerObs) {
        return {
          ...detalhe,
          observacoesInternas: null,
        };
      }
      return detalhe;
    });
  }

  async definirSituacaoCliente(
    token: string,
    idCliente: string,
    estaAtivo: boolean,
    versao: number,
    motivo?: string | null,
  ): Promise<ClienteDetalheDto> {
    return this.executar(token, async (clientes) => {
      PoliticaClientes.exigir(clientes.autor, 'CLIENTE_ATIVAR_INATIVAR');
      const anterior = await clientes.buscarClientePorId(idCliente);

      if (anterior.versao !== versao) {
        throw new ErroCliente('CONFLITO', 409);
      }

      const novaSituacao = estaAtivo ? 'ATIVO' : 'INATIVO';
      if (anterior.situacao === novaSituacao) {
        throw new ErroCliente('CONFLITO', 409);
      }

      const detalhe = await clientes.definirSituacao(anterior, novaSituacao, motivo);
      if (!PoliticaClientes.podeVisualizarObservacoes(clientes.autor)) {
        return {
          ...detalhe,
          observacoesInternas: null,
        };
      }
      return detalhe;
    });
  }

  async consultarLinhaDoTempo(token: string, idCliente: string): Promise<EventoLinhaTempoClienteDto[]> {
    return this.executar(token, async (clientes) => {
      PoliticaClientes.exigir(clientes.autor, 'CLIENTE_VISUALIZAR');
      await clientes.buscarClientePorId(idCliente);
      const eventos = await clientes.listarLinhaDoTempoCliente(idCliente);
      const podeVerObs = PoliticaClientes.podeVisualizarObservacoes(clientes.autor);

      if (podeVerObs) {
        return eventos;
      }

      // Sanitiza observações internas do histórico caso não tenha permissão (RN-009, ADR-002)
      return eventos.map((e) => {
        const sanitizarPayload = (obj: Record<string, unknown> | null) => {
          if (!obj) return null;
          const copia = { ...obj };
          if ('observacoesInternas' in copia) {
            copia.observacoesInternas = '[RESTRITO]';
          }
          if ('internalNotes' in copia) {
            copia.internalNotes = '[RESTRITO]';
          }
          return copia;
        };

        return {
          ...e,
          anterior: sanitizarPayload(e.anterior),
          atual: sanitizarPayload(e.atual) ?? e.atual,
        };
      });
    });
  }

  async consultarVinculos(token: string, idCliente: string): Promise<VinculosRelacionadosClienteDto> {
    return this.executar(token, async (clientes) => {
      PoliticaClientes.exigir(clientes.autor, 'CLIENTE_VISUALIZAR');
      await clientes.buscarClientePorId(idCliente);
      return clientes.listarVinculosRelacionados(idCliente);
    });
  }

  async adicionarContato(
    token: string,
    idCliente: string,
    dados: DadosMutacaoContatoCliente,
  ): Promise<ContatoClienteDto> {
    return this.executar(token, async (clientes) => {
      PoliticaClientes.exigir(clientes.autor, 'CLIENTE_EDITAR');
      await clientes.buscarClientePorId(idCliente);

      const contato = ContatoCliente.criar({
        idEscritorio: clientes.autor.idEscritorio,
        idCliente,
        nome: dados.nome,
        cargoOuRelacao: dados.cargoOuRelacao,
        email: dados.email,
        telefone: dados.telefone,
        observacao: dados.observacao,
      });

      return clientes.adicionarContatoCliente(contato);
    });
  }

  async editarContato(
    token: string,
    idCliente: string,
    idContato: string,
    dados: DadosMutacaoContatoCliente,
  ): Promise<ContatoClienteDto> {
    return this.executar(token, async (clientes) => {
      PoliticaClientes.exigir(clientes.autor, 'CLIENTE_EDITAR');
      const cliente = await clientes.buscarClientePorId(idCliente);
      const anterior = cliente.contatos.find((c) => c.id === idContato);
      if (!anterior) {
        throw new ErroCliente('NAO_ENCONTRADO', 404);
      }

      const contatoAtualizado = ContatoCliente.restaurar({
        id: anterior.id,
        idEscritorio: anterior.idEscritorio,
        idCliente: anterior.idCliente,
        nome: dados.nome,
        cargoOuRelacao: dados.cargoOuRelacao,
        email: dados.email,
        telefone: dados.telefone,
        observacao: dados.observacao,
        criadoEm: anterior.criadoEm,
        atualizadoEm: new Date(),
      });

      return clientes.atualizarContatoCliente(anterior, contatoAtualizado);
    });
  }

  async removerContato(
    token: string,
    idCliente: string,
    idContato: string,
  ): Promise<void> {
    return this.executar(token, async (clientes) => {
      PoliticaClientes.exigir(clientes.autor, 'CLIENTE_EDITAR');
      const cliente = await clientes.buscarClientePorId(idCliente);
      const anterior = cliente.contatos.find((c) => c.id === idContato);
      if (!anterior) {
        throw new ErroCliente('NAO_ENCONTRADO', 404);
      }

      await clientes.removerContatoCliente(idCliente, idContato);
    });
  }
}

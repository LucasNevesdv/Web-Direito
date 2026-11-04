import { randomUUID } from 'node:crypto';
import type { DadosTokenAcesso } from '../../src/application/authentication/authentication-contracts.js';
import type {
  ClienteDetalheDto,
  ClienteResumoDto,
  ContatoClienteDto,
  FiltroClientes,
  IndicioDuplicidadeCliente,
  OperacoesClientes,
  RepositorioClientes,
  VinculosRelacionadosClienteDto,
} from '../../src/application/clients/client-contracts.js';
import {
  ErroCliente,
  PERMISSOES_CLIENTE,
  type AutorCliente,
} from '../../src/application/clients/client-policy.js';
import type { Cliente, SituacaoCliente } from '../../src/domain/clients/client.js';
import type { ContatoCliente } from '../../src/domain/clients/client-contact.js';
import type { PapelVinculoEscritorio } from '../../src/domain/memberships/membership.js';

interface ClienteArmazenado {
  id: string;
  idEscritorio: string;
  tipoPessoa: 'PESSOA_FISICA' | 'PESSOA_JURIDICA';
  nome: string;
  nomeSocial: string | null;
  documento: string;
  email: string | null;
  telefone: string | null;
  endereco: {
    cep: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
  } | null;
  observacoesInternas: string | null;
  idVinculoResponsavel: string | null;
  situacao: SituacaoCliente;
  versao: number;
  criadoEm: Date;
  atualizadoEm: Date;
}

interface ContatoArmazenado {
  id: string;
  idEscritorio: string;
  idCliente: string;
  nome: string;
  cargoOuRelacao: string | null;
  email: string | null;
  telefone: string | null;
  observacao: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

interface EventoArmazenado {
  id: string;
  idEscritorio: string;
  idCliente: string;
  idAutor: string;
  nomeAutor?: string;
  acao: string;
  anterior: Record<string, unknown> | null;
  atual: Record<string, unknown>;
  criadoEm: Date;
}

interface MembroArmazenado {
  id: string;
  idEscritorio: string;
  nome: string;
  papel: PapelVinculoEscritorio;
  ativo: boolean;
  permissoes?: string[];
}

export class RepositorioClientesEmMemoria implements RepositorioClientes {
  readonly clientes: ClienteArmazenado[] = [];
  readonly contatos: ContatoArmazenado[] = [];
  readonly eventos: EventoArmazenado[] = [];
  readonly membros: MembroArmazenado[] = [];
  readonly documentos: Array<{
    id: string;
    idEscritorio: string;
    idCliente: string;
    nome: string;
    categoria: string;
    ativo: boolean;
    criadoEm: Date;
  }> = [];
  readonly tarefas: Array<{
    id: string;
    idEscritorio: string;
    idCliente: string;
    titulo: string;
    situacao: string;
    prazo?: string | null;
  }> = [];
  readonly compromissos: Array<{
    id: string;
    idEscritorio: string;
    idCliente: string;
    descricao: string;
    data: string;
    situacao: string;
  }> = [];

  adicionarMembro(membro: MembroArmazenado) {
    this.membros.push(membro);
  }

  adicionarDocumento(doc: {
    id: string;
    idEscritorio: string;
    idCliente: string;
    nome: string;
    categoria: string;
    ativo: boolean;
    criadoEm?: Date;
  }) {
    this.documentos.push({
      ...doc,
      criadoEm: doc.criadoEm ?? new Date(),
    });
  }

  adicionarTarefa(tarefa: {
    id: string;
    idEscritorio: string;
    idCliente: string;
    titulo: string;
    situacao: string;
    prazo?: string | null;
  }) {
    this.tarefas.push(tarefa);
  }

  adicionarCompromisso(compromisso: {
    id: string;
    idEscritorio: string;
    idCliente: string;
    descricao: string;
    data: string;
    situacao: string;
  }) {
    this.compromissos.push(compromisso);
  }

  async executar<T>(
    contexto: DadosTokenAcesso,
    operacao: (clientes: OperacoesClientes) => Promise<T>,
  ): Promise<T> {
    const autorMembro = this.membros.find(
      (m) => m.idEscritorio === contexto.idEscritorioAtivo,
    );
    const papel = autorMembro?.papel ?? (contexto.papel as PapelVinculoEscritorio) ?? 'PROPRIETARIO';

    const autor: AutorCliente = {
      idUsuario: contexto.idUsuario,
      idEscritorio: contexto.idEscritorioAtivo,
      papel,
      permissoes: autorMembro?.permissoes ?? (papel === 'PROPRIETARIO' ? [...PERMISSOES_CLIENTE] : ['CLIENTE_VISUALIZAR', 'CLIENTE_CADASTRAR', 'CLIENTE_EDITAR']),
    };

    const buscarClientePorId = async (idCliente: string): Promise<ClienteDetalheDto> => {
      const c = this.clientes.find(
        (cli) => cli.id === idCliente && cli.idEscritorio === contexto.idEscritorioAtivo,
      );
      if (!c) throw new ErroCliente('NAO_ENCONTRADO', 404);

      const contatosCli = this.contatos.filter(
        (con) => con.idCliente === idCliente && con.idEscritorio === contexto.idEscritorioAtivo,
      );
      const resp = this.membros.find((m) => m.id === c.idVinculoResponsavel);

      return {
        ...c,
        nomeResponsavel: resp?.nome ?? null,
        contatos: contatosCli,
      };
    };

    const operacoes: OperacoesClientes = {
      autor,
      buscarClientePorId,

      listarClientes: async (filtro: FiltroClientes) => {
        let filtrados = this.clientes.filter((c) => c.idEscritorio === contexto.idEscritorioAtivo);

        if (filtro.situacao) {
          filtrados = filtrados.filter((c) => c.situacao === filtro.situacao);
        }
        if (filtro.tipoPessoa) {
          filtrados = filtrados.filter((c) => c.tipoPessoa === filtro.tipoPessoa);
        }
        if (filtro.idVinculoResponsavel) {
          filtrados = filtrados.filter((c) => c.idVinculoResponsavel === filtro.idVinculoResponsavel);
        }
        if (filtro.pesquisa && filtro.pesquisa.trim().length > 0) {
          const termo = filtro.pesquisa.trim().toLowerCase();
          const termoDigitos = termo.replace(/\D/g, '');
          filtrados = filtrados.filter(
            (c) =>
              c.nome.toLowerCase().includes(termo) ||
              (c.nomeSocial && c.nomeSocial.toLowerCase().includes(termo)) ||
              (c.email && c.email.toLowerCase().includes(termo)) ||
              (termoDigitos.length > 0 && c.documento.includes(termoDigitos)) ||
              (termoDigitos.length > 0 && c.telefone && c.telefone.includes(termoDigitos)),
          );
        }

        const total = filtrados.length;
        const inicio = (filtro.pagina - 1) * filtro.tamanhoPagina;
        const pagina = filtrados.slice(inicio, inicio + filtro.tamanhoPagina);

        const clientesResumo: ClienteResumoDto[] = pagina.map((c) => {
          const resp = this.membros.find((m) => m.id === c.idVinculoResponsavel);
          return {
            id: c.id,
            idEscritorio: c.idEscritorio,
            tipoPessoa: c.tipoPessoa,
            nome: c.nome,
            nomeSocial: c.nomeSocial,
            documento: c.documento,
            email: c.email,
            telefone: c.telefone,
            situacao: c.situacao,
            idVinculoResponsavel: c.idVinculoResponsavel,
            nomeResponsavel: resp?.nome ?? null,
            versao: c.versao,
            criadoEm: c.criadoEm,
            atualizadoEm: c.atualizadoEm,
          };
        });

        return { clientes: clientesResumo, total };
      },

      verificarDuplicidades: async (entrada) => {
        const digitosDoc = entrada.documento.replace(/\D/g, '');
        const nomeNorm = entrada.nome.trim().toLowerCase();
        const digitosTel = entrada.telefone?.replace(/\D/g, '');

        const candidatos = this.clientes.filter((c) => {
          if (c.idEscritorio !== contexto.idEscritorioAtivo) return false;
          if (entrada.ignorarIdCliente && c.id === entrada.ignorarIdCliente) return false;

          const docIgual = digitosDoc.length > 0 && c.documento === digitosDoc;
          const nomeIgual =
            nomeNorm.length > 0 &&
            (c.nome.toLowerCase() === nomeNorm ||
              (c.nomeSocial && c.nomeSocial.toLowerCase() === nomeNorm));
          const emailIgual = !!(
            entrada.email &&
            c.email &&
            c.email.toLowerCase() === entrada.email.trim().toLowerCase()
          );
          const telIgual = !!(digitosTel && digitosTel.length > 0 && c.telefone && c.telefone === digitosTel);

          return docIgual || nomeIgual || emailIgual || telIgual;
        });

        return candidatos
          .map((c) => {
            const motivos: IndicioDuplicidadeCliente['motivos'] = [];
            if (digitosDoc.length > 0 && c.documento === digitosDoc) motivos.push('DOCUMENTO_IDENTICO');
            if (
              nomeNorm.length > 0 &&
              (c.nome.toLowerCase() === nomeNorm ||
                (c.nomeSocial && c.nomeSocial.toLowerCase() === nomeNorm))
            ) {
              motivos.push('NOME_IDENTICO');
            }
            if (
              entrada.email &&
              c.email &&
              c.email.toLowerCase() === entrada.email.trim().toLowerCase()
            ) {
              motivos.push('EMAIL_IDENTICO');
            }
            if (digitosTel && digitosTel.length > 0 && c.telefone && c.telefone === digitosTel) {
              motivos.push('TELEFONE_IDENTICO');
            }
            return {
              id: c.id,
              nome: c.nome,
              nomeSocial: c.nomeSocial,
              tipoPessoa: c.tipoPessoa,
              documentoMascarado: c.documento.slice(0, 3) + '***',
              email: c.email,
              telefone: c.telefone,
              situacao: c.situacao,
              motivos,
            };
          })
          .filter((c) => c.motivos.length > 0);
      },

      validarVinculoResponsavelNoEscritorio: async (idVinculoResponsavel: string) => {
        const m = this.membros.find(
          (membro) =>
            membro.id === idVinculoResponsavel &&
            membro.idEscritorio === contexto.idEscritorioAtivo &&
            membro.ativo,
        );
        if (!m) throw new ErroCliente('RESPONSAVEL_INVALIDO', 400);
        return { id: m.id, nome: m.nome, papel: m.papel };
      },

      criarCliente: async (cliente: Cliente, contatosIniciais: ContatoCliente[]) => {
        const existente = this.clientes.find(
          (c) => c.idEscritorio === contexto.idEscritorioAtivo && c.documento === cliente.documento,
        );
        if (existente) throw new ErroCliente('DOCUMENTO_JA_CADASTRADO', 409);

        const novo: ClienteArmazenado = {
          id: cliente.id,
          idEscritorio: cliente.idEscritorio,
          tipoPessoa: cliente.tipoPessoa,
          nome: cliente.nome,
          nomeSocial: cliente.nomeSocial,
          documento: cliente.documento,
          email: cliente.email,
          telefone: cliente.telefone,
          endereco: cliente.endereco,
          observacoesInternas: cliente.observacoesInternas,
          idVinculoResponsavel: cliente.idVinculoResponsavel,
          situacao: cliente.situacao,
          versao: cliente.versao,
          criadoEm: cliente.criadoEm,
          atualizadoEm: cliente.atualizadoEm,
        };
        this.clientes.push(novo);

        for (const ct of contatosIniciais) {
          this.contatos.push({
            id: ct.id,
            idEscritorio: ct.idEscritorio,
            idCliente: ct.idCliente,
            nome: ct.nome,
            cargoOuRelacao: ct.cargoOuRelacao,
            email: ct.email,
            telefone: ct.telefone,
            observacao: ct.observacao,
            criadoEm: ct.criadoEm,
            atualizadoEm: ct.atualizadoEm,
          });
        }

        this.eventos.push({
          id: randomUUID(),
          idEscritorio: contexto.idEscritorioAtivo,
          idCliente: cliente.id,
          idAutor: contexto.idUsuario,
          acao: 'CLIENTE_CRIADO',
          anterior: null,
          atual: { id: cliente.id, nome: cliente.nome },
          criadoEm: new Date(),
        });

        return buscarClientePorId(cliente.id);
      },

      atualizarCliente: async (anterior: ClienteDetalheDto, atualizado: Cliente) => {
        const idx = this.clientes.findIndex(
          (c) =>
            c.id === anterior.id &&
            c.idEscritorio === contexto.idEscritorioAtivo &&
            c.versao === anterior.versao,
        );
        if (idx === -1) throw new ErroCliente('CONFLITO', 409);

        const atualizadoArmazenado: ClienteArmazenado = {
          ...this.clientes[idx]!,
          nome: atualizado.nome,
          nomeSocial: atualizado.nomeSocial,
          documento: atualizado.documento,
          email: atualizado.email,
          telefone: atualizado.telefone,
          endereco: atualizado.endereco,
          observacoesInternas: atualizado.observacoesInternas,
          idVinculoResponsavel: atualizado.idVinculoResponsavel,
          versao: anterior.versao + 1,
          atualizadoEm: new Date(),
        };
        this.clientes[idx] = atualizadoArmazenado;

        this.eventos.push({
          id: randomUUID(),
          idEscritorio: contexto.idEscritorioAtivo,
          idCliente: atualizado.id,
          idAutor: contexto.idUsuario,
          acao: 'CLIENTE_ATUALIZADO',
          anterior: { ...anterior },
          atual: { ...atualizadoArmazenado },
          criadoEm: new Date(),
        });

        return buscarClientePorId(atualizado.id);
      },

      definirSituacao: async (
        anterior: ClienteDetalheDto,
        novaSituacao: SituacaoCliente,
        motivo?: string | null,
      ) => {
        const idx = this.clientes.findIndex(
          (c) =>
            c.id === anterior.id &&
            c.idEscritorio === contexto.idEscritorioAtivo &&
            c.versao === anterior.versao,
        );
        if (idx === -1) throw new ErroCliente('CONFLITO', 409);

        this.clientes[idx]!.situacao = novaSituacao;
        this.clientes[idx]!.versao += 1;
        this.clientes[idx]!.atualizadoEm = new Date();

        this.eventos.push({
          id: randomUUID(),
          idEscritorio: contexto.idEscritorioAtivo,
          idCliente: anterior.id,
          idAutor: contexto.idUsuario,
          acao: novaSituacao === 'ATIVO' ? 'CLIENTE_REATIVADO' : 'CLIENTE_INATIVADO',
          anterior: { situacao: anterior.situacao },
          atual: { situacao: novaSituacao, motivo: motivo ?? null },
          criadoEm: new Date(),
        });

        return buscarClientePorId(anterior.id);
      },

      adicionarContatoCliente: async (contato: ContatoCliente) => {
        const cliente = this.clientes.find(
          (c) => c.id === contato.idCliente && c.idEscritorio === contexto.idEscritorioAtivo,
        );
        if (!cliente) throw new ErroCliente('NAO_ENCONTRADO', 404);

        const novoContato: ContatoArmazenado = {
          id: contato.id,
          idEscritorio: contexto.idEscritorioAtivo,
          idCliente: contato.idCliente,
          nome: contato.nome,
          cargoOuRelacao: contato.cargoOuRelacao,
          email: contato.email,
          telefone: contato.telefone,
          observacao: contato.observacao,
          criadoEm: contato.criadoEm,
          atualizadoEm: contato.atualizadoEm,
        };
        this.contatos.push(novoContato);

        this.eventos.push({
          id: randomUUID(),
          idEscritorio: contexto.idEscritorioAtivo,
          idCliente: contato.idCliente,
          idAutor: contexto.idUsuario,
          acao: 'CONTATO_ADICIONADO',
          anterior: null,
          atual: {
            id: contato.id,
            nome: contato.nome,
            cargoOuRelacao: contato.cargoOuRelacao,
            email: contato.email,
            telefone: contato.telefone,
            observacao: contato.observacao,
          },
          criadoEm: new Date(),
        });

        return { ...novoContato };
      },

      atualizarContatoCliente: async (anterior: ContatoClienteDto, atualizado: ContatoCliente) => {
        const cliente = this.clientes.find(
          (c) => c.id === atualizado.idCliente && c.idEscritorio === contexto.idEscritorioAtivo,
        );
        if (!cliente) throw new ErroCliente('NAO_ENCONTRADO', 404);

        const idx = this.contatos.findIndex(
          (ct) =>
            ct.id === atualizado.id &&
            ct.idCliente === atualizado.idCliente &&
            ct.idEscritorio === contexto.idEscritorioAtivo,
        );
        if (idx === -1) throw new ErroCliente('NAO_ENCONTRADO', 404);

        const ctAtualizado: ContatoArmazenado = {
          ...this.contatos[idx]!,
          nome: atualizado.nome,
          cargoOuRelacao: atualizado.cargoOuRelacao,
          email: atualizado.email,
          telefone: atualizado.telefone,
          observacao: atualizado.observacao,
          atualizadoEm: new Date(),
        };
        this.contatos[idx] = ctAtualizado;

        this.eventos.push({
          id: randomUUID(),
          idEscritorio: contexto.idEscritorioAtivo,
          idCliente: atualizado.idCliente,
          idAutor: contexto.idUsuario,
          acao: 'CONTATO_ATUALIZADO',
          anterior: {
            id: anterior.id,
            nome: anterior.nome,
            cargoOuRelacao: anterior.cargoOuRelacao,
            email: anterior.email,
            telefone: anterior.telefone,
            observacao: anterior.observacao,
          },
          atual: {
            id: atualizado.id,
            nome: atualizado.nome,
            cargoOuRelacao: atualizado.cargoOuRelacao,
            email: atualizado.email,
            telefone: atualizado.telefone,
            observacao: atualizado.observacao,
          },
          criadoEm: new Date(),
        });

        return { ...ctAtualizado };
      },

      removerContatoCliente: async (idCliente: string, idContato: string) => {
        const cliente = this.clientes.find(
          (c) => c.id === idCliente && c.idEscritorio === contexto.idEscritorioAtivo,
        );
        if (!cliente) throw new ErroCliente('NAO_ENCONTRADO', 404);

        const idx = this.contatos.findIndex(
          (ct) =>
            ct.id === idContato &&
            ct.idCliente === idCliente &&
            ct.idEscritorio === contexto.idEscritorioAtivo,
        );
        if (idx === -1) throw new ErroCliente('NAO_ENCONTRADO', 404);

        const removido = this.contatos.splice(idx, 1)[0]!;

        this.eventos.push({
          id: randomUUID(),
          idEscritorio: contexto.idEscritorioAtivo,
          idCliente,
          idAutor: contexto.idUsuario,
          acao: 'CONTATO_REMOVIDO',
          anterior: {
            id: removido.id,
            nome: removido.nome,
            cargoOuRelacao: removido.cargoOuRelacao,
            email: removido.email,
            telefone: removido.telefone,
            observacao: removido.observacao,
          },
          atual: {
            id: removido.id,
            nome: removido.nome,
            removido: true,
          },
          criadoEm: new Date(),
        });
      },

      listarLinhaDoTempoCliente: async (idCliente: string) => {
        const evs = this.eventos.filter(
          (e) => e.idCliente === idCliente && e.idEscritorio === contexto.idEscritorioAtivo,
        );
        return evs.map((e) => ({
          id: e.id,
          idEscritorio: e.idEscritorio,
          idCliente: e.idCliente,
          idAutor: e.idAutor,
          nomeAutor: e.nomeAutor,
          acao: e.acao,
          motivo: (e.atual.motivo as string) ?? null,
          anterior: e.anterior,
          atual: e.atual,
          criadoEm: e.criadoEm,
        }));
      },

      listarVinculosRelacionados: async (idCliente: string): Promise<VinculosRelacionadosClienteDto> => {
        const cliente = this.clientes.find(
          (c) => c.id === idCliente && c.idEscritorio === contexto.idEscritorioAtivo,
        );
        if (!cliente) throw new ErroCliente('NAO_ENCONTRADO', 404);

        const docs = this.documentos
          .filter((d) => d.idCliente === idCliente && d.idEscritorio === contexto.idEscritorioAtivo && d.ativo)
          .map((d) => ({
            id: d.id,
            nome: d.nome,
            categoria: d.categoria,
            criadoEm: d.criadoEm,
          }));

        const tarefas = this.tarefas
          .filter((t) => t.idCliente === idCliente && t.idEscritorio === contexto.idEscritorioAtivo)
          .map((t) => ({
            id: t.id,
            titulo: t.titulo,
            situacao: t.situacao,
            prazo: t.prazo ?? null,
          }));

        const compromissos = this.compromissos
          .filter((c) => c.idCliente === idCliente && c.idEscritorio === contexto.idEscritorioAtivo)
          .map((c) => ({
            id: c.id,
            descricao: c.descricao,
            situacao: c.situacao,
            data: c.data,
          }));

        return {
          casos: [],
          processos: [],
          documentos: docs,
          tarefas,
          compromissos,
        };
      },
    };

    return operacao(operacoes);
  }
}

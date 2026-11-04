import type { TokensAcesso } from '../authentication/authentication-contracts.js';
import { Caso } from '../../domain/cases/legal-case.js';
import { ParteEnvolvidaCaso } from '../../domain/cases/case-party.js';
import type {
  CasoDetalheDto,
  CasoResumoDto,
  DadosCadastroCaso,
  DadosCadastroParteInicial,
  DadosEdicaoCaso,
  EventoLinhaTempoCasoDto,
  FiltroCasos,
  OperacoesCasosProcessos,
  ParteEnvolvidaDto,
  RepositorioCasosProcessos,
} from './case-contracts.js';
import { ErroCasoProcesso, PoliticaCasosProcessos } from './case-policy.js';

export class GestaoCasosProcessos {
  constructor(
    private readonly repositorio: RepositorioCasosProcessos,
    private readonly tokens: TokensAcesso,
  ) {}

  private async executar<T>(
    token: string,
    operacao: (casos: OperacoesCasosProcessos) => Promise<T>,
  ): Promise<T> {
    const contexto = await this.tokens.validarTokenDeAcesso(token);
    return this.repositorio.executar(contexto, operacao);
  }

  async listarCasos(
    token: string,
    filtro: FiltroCasos,
  ): Promise<{
    casos: CasoResumoDto[];
    total: number;
    pagina: number;
    tamanhoPagina: number;
  }> {
    return this.executar(token, async (casos) => {
      PoliticaCasosProcessos.exigir(casos.autor, 'CASO_VISUALIZAR');
      const pagina = Math.max(1, filtro.pagina || 1);
      const tamanhoPagina = Math.min(Math.max(1, filtro.tamanhoPagina || 20), 50);
      const resultado = await casos.listarCasos({
        ...filtro,
        pagina,
        tamanhoPagina,
      });
      return {
        ...resultado,
        pagina,
        tamanhoPagina,
      };
    });
  }

  async consultarCasoPorId(token: string, idCaso: string): Promise<CasoDetalheDto> {
    return this.executar(token, async (casos) => {
      PoliticaCasosProcessos.exigir(casos.autor, 'CASO_VISUALIZAR');
      return casos.buscarCasoPorId(idCaso);
    });
  }

  async cadastrarCaso(token: string, dados: DadosCadastroCaso): Promise<CasoDetalheDto> {
    return this.executar(token, async (casos) => {
      PoliticaCasosProcessos.exigir(casos.autor, 'CASO_CADASTRAR');

      if (!dados.idsClientes || dados.idsClientes.length === 0) {
        throw new ErroCasoProcesso('DADOS_INVALIDOS', 400, 'Ao menos um cliente deve ser vinculado.');
      }

      // Validar clientes no mesmo escritório
      const clientes = await casos.validarClientesNoEscritorio(dados.idsClientes);
      if (clientes.length !== new Set(dados.idsClientes.map((id) => id.toLowerCase())).size) {
        throw new ErroCasoProcesso('CLIENTE_INVALIDO', 400);
      }
      if (clientes.some((c) => c.status !== 'ACTIVE')) {
        throw new ErroCasoProcesso('CLIENTE_INVALIDO', 400, 'Cliente inativo.');
      }

      // Validar responsável se informado
      if (dados.idVinculoResponsavel) {
        const resp = await casos.validarVinculoEquipeNoEscritorio(dados.idVinculoResponsavel);
        if (!resp || !resp.ativo) {
          throw new ErroCasoProcesso('MEMBRO_EQUIPE_INVALIDO', 400);
        }
        PoliticaCasosProcessos.validarPapelResponsavel(resp.papel);
      }

      // Validar membros da equipe
      if (dados.idsVinculosEquipe && dados.idsVinculosEquipe.length > 0) {
        for (const idMembro of dados.idsVinculosEquipe) {
          const membro = await casos.validarVinculoEquipeNoEscritorio(idMembro);
          if (!membro || !membro.ativo) {
            throw new ErroCasoProcesso('MEMBRO_EQUIPE_INVALIDO', 400);
          }
        }
      }

      const caso = Caso.criar({
        idEscritorio: casos.autor.idEscritorio,
        titulo: dados.titulo,
        descricao: dados.descricao,
        natureza: dados.natureza,
        areaJuridica: dados.areaJuridica,
        prioridade: dados.prioridade,
        idVinculoResponsavel: dados.idVinculoResponsavel,
        valorCausaCentavos: dados.valorCausaCentavos,
        valorEnvolvidoCentavos: dados.valorEnvolvidoCentavos,
        idsClientes: dados.idsClientes,
        idsVinculosEquipe: dados.idsVinculosEquipe,
      });

      const partesIniciais = (dados.partesIniciais ?? []).map((p) =>
        ParteEnvolvidaCaso.criar({
          idEscritorio: caso.idEscritorio,
          idCaso: caso.id,
          tipoParticipacao: p.tipoParticipacao,
          nome: p.nome,
          documento: p.documento,
          oab: p.oab,
          contato: p.contato,
          observacao: p.observacao,
        }),
      );

      return casos.criarCaso(caso, partesIniciais);
    });
  }

  async editarCaso(token: string, idCaso: string, dados: DadosEdicaoCaso): Promise<CasoDetalheDto> {
    return this.executar(token, async (casos) => {
      PoliticaCasosProcessos.exigir(casos.autor, 'CASO_EDITAR');

      const anterior = await casos.buscarCasoPorId(idCaso);
      if (anterior.versao !== dados.versao) {
        throw new ErroCasoProcesso('CONFLITO', 409);
      }
      if (anterior.situacao === 'ARQUIVADO') {
        throw new ErroCasoProcesso('CASO_ARQUIVADO_SOMENTE_LEITURA', 409);
      }

      if (dados.idsClientes) {
        if (dados.idsClientes.length === 0) {
          throw new ErroCasoProcesso('DADOS_INVALIDOS', 400, 'Ao menos um cliente deve ser vinculado.');
        }
        const clientes = await casos.validarClientesNoEscritorio(dados.idsClientes);
        if (clientes.length !== new Set(dados.idsClientes.map((id) => id.toLowerCase())).size) {
          throw new ErroCasoProcesso('CLIENTE_INVALIDO', 400);
        }
        if (clientes.some((c) => c.status !== 'ACTIVE')) {
          throw new ErroCasoProcesso('CLIENTE_INVALIDO', 400, 'Cliente inativo.');
        }
      }

      if (dados.idVinculoResponsavel !== undefined && dados.idVinculoResponsavel !== null) {
        const resp = await casos.validarVinculoEquipeNoEscritorio(dados.idVinculoResponsavel);
        if (!resp || !resp.ativo) {
          throw new ErroCasoProcesso('MEMBRO_EQUIPE_INVALIDO', 400);
        }
        PoliticaCasosProcessos.validarPapelResponsavel(resp.papel);
      }

      if (dados.idsVinculosEquipe && dados.idsVinculosEquipe.length > 0) {
        for (const idMembro of dados.idsVinculosEquipe) {
          const membro = await casos.validarVinculoEquipeNoEscritorio(idMembro);
          if (!membro || !membro.ativo) {
            throw new ErroCasoProcesso('MEMBRO_EQUIPE_INVALIDO', 400);
          }
        }
      }

      const casoAtual = Caso.restaurar({
        id: anterior.id,
        idEscritorio: anterior.idEscritorio,
        titulo: anterior.titulo,
        descricao: anterior.descricao,
        natureza: anterior.natureza,
        areaJuridica: anterior.areaJuridica,
        prioridade: anterior.prioridade,
        situacao: anterior.situacao,
        idVinculoResponsavel: anterior.idVinculoResponsavel,
        valorCausaCentavos: anterior.valorCausaCentavos,
        valorEnvolvidoCentavos: anterior.valorEnvolvidoCentavos,
        idsClientes: anterior.clientes.map((c) => c.id),
        idsVinculosEquipe: anterior.equipe.map((m) => m.id),
        versao: anterior.versao,
        ultimaAtividadeEm: anterior.ultimaAtividadeEm,
        criadoEm: anterior.criadoEm,
        atualizadoEm: anterior.atualizadoEm,
      });

      const atualizado = casoAtual.editar({
        titulo: dados.titulo,
        descricao: dados.descricao,
        natureza: dados.natureza,
        areaJuridica: dados.areaJuridica,
        prioridade: dados.prioridade,
        situacao: dados.situacao,
        idVinculoResponsavel: dados.idVinculoResponsavel,
        valorCausaCentavos: dados.valorCausaCentavos,
        valorEnvolvidoCentavos: dados.valorEnvolvidoCentavos,
        idsClientes: dados.idsClientes,
        idsVinculosEquipe: dados.idsVinculosEquipe,
      });

      const evento = {
        acao: 'CASO_ATUALIZADO',
        anterior: {
          titulo: anterior.titulo,
          natureza: anterior.natureza,
          areaJuridica: anterior.areaJuridica,
          prioridade: anterior.prioridade,
          situacao: anterior.situacao,
          idVinculoResponsavel: anterior.idVinculoResponsavel,
          valorCausaCentavos: anterior.valorCausaCentavos,
          valorEnvolvidoCentavos: anterior.valorEnvolvidoCentavos,
        },
        atual: {
          titulo: atualizado.titulo,
          natureza: atualizado.natureza,
          areaJuridica: atualizado.areaJuridica,
          prioridade: atualizado.prioridade,
          situacao: atualizado.situacao,
          idVinculoResponsavel: atualizado.idVinculoResponsavel,
          valorCausaCentavos: atualizado.valorCausaCentavos,
          valorEnvolvidoCentavos: atualizado.valorEnvolvidoCentavos,
        },
      };

      return casos.atualizarCaso(anterior, atualizado, evento);
    });
  }

  async arquivarCaso(
    token: string,
    idCaso: string,
    dados: { versao: number; motivo?: string },
  ): Promise<CasoDetalheDto> {
    return this.executar(token, async (casos) => {
      PoliticaCasosProcessos.exigir(casos.autor, 'CASO_ARQUIVAR_REABRIR');

      const anterior = await casos.buscarCasoPorId(idCaso);
      if (anterior.versao !== dados.versao) {
        throw new ErroCasoProcesso('CONFLITO', 409);
      }
      if (anterior.situacao === 'ARQUIVADO') {
        throw new ErroCasoProcesso('DADOS_INVALIDOS', 400, 'Caso já está arquivado.');
      }

      return casos.arquivarCaso(anterior, dados.versao, dados.motivo);
    });
  }

  async reabrirCaso(
    token: string,
    idCaso: string,
    dados: { versao: number; motivo?: string },
  ): Promise<CasoDetalheDto> {
    return this.executar(token, async (casos) => {
      PoliticaCasosProcessos.exigir(casos.autor, 'CASO_ARQUIVAR_REABRIR');

      const anterior = await casos.buscarCasoPorId(idCaso);
      if (anterior.versao !== dados.versao) {
        throw new ErroCasoProcesso('CONFLITO', 409);
      }
      if (anterior.situacao !== 'ARQUIVADO' && anterior.situacao !== 'ENCERRADO') {
        throw new ErroCasoProcesso('DADOS_INVALIDOS', 400, 'Caso não está arquivado nem encerrado.');
      }

      return casos.reabrirCaso(anterior, dados.versao, dados.motivo);
    });
  }

  async adicionarParte(
    token: string,
    idCaso: string,
    dados: DadosCadastroParteInicial,
  ): Promise<ParteEnvolvidaDto> {
    return this.executar(token, async (casos) => {
      PoliticaCasosProcessos.exigir(casos.autor, 'CASO_EDITAR');

      const caso = await casos.buscarCasoPorId(idCaso);
      if (caso.situacao === 'ARQUIVADO') {
        throw new ErroCasoProcesso('CASO_ARQUIVADO_SOMENTE_LEITURA', 409);
      }

      const parte = ParteEnvolvidaCaso.criar({
        idEscritorio: caso.idEscritorio,
        idCaso: caso.id,
        tipoParticipacao: dados.tipoParticipacao,
        nome: dados.nome,
        documento: dados.documento,
        oab: dados.oab,
        contato: dados.contato,
        observacao: dados.observacao,
      });

      return casos.adicionarParte(parte);
    });
  }

  async editarParte(
    token: string,
    idCaso: string,
    idParte: string,
    dados: Partial<DadosCadastroParteInicial>,
  ): Promise<ParteEnvolvidaDto> {
    return this.executar(token, async (casos) => {
      PoliticaCasosProcessos.exigir(casos.autor, 'CASO_EDITAR');

      const caso = await casos.buscarCasoPorId(idCaso);
      if (caso.situacao === 'ARQUIVADO') {
        throw new ErroCasoProcesso('CASO_ARQUIVADO_SOMENTE_LEITURA', 409);
      }

      const anteriorParte = caso.partes.find((p) => p.id === idParte);
      if (!anteriorParte) {
        throw new ErroCasoProcesso('NAO_ENCONTRADO', 404);
      }

      const parteAtual = ParteEnvolvidaCaso.restaurar({
        id: anteriorParte.id,
        idEscritorio: anteriorParte.idEscritorio,
        idCaso: anteriorParte.idCaso,
        tipoParticipacao: anteriorParte.tipoParticipacao,
        nome: anteriorParte.nome,
        documento: anteriorParte.documento,
        oab: anteriorParte.oab,
        contato: anteriorParte.contato,
        observacao: anteriorParte.observacao,
        criadoEm: anteriorParte.criadoEm,
        atualizadoEm: anteriorParte.atualizadoEm,
      });

      const atualizada = parteAtual.atualizar(dados);
      return casos.atualizarParte(anteriorParte, atualizada);
    });
  }

  async removerParte(token: string, idCaso: string, idParte: string): Promise<void> {
    return this.executar(token, async (casos) => {
      PoliticaCasosProcessos.exigir(casos.autor, 'CASO_EDITAR');

      const caso = await casos.buscarCasoPorId(idCaso);
      if (caso.situacao === 'ARQUIVADO') {
        throw new ErroCasoProcesso('CASO_ARQUIVADO_SOMENTE_LEITURA', 409);
      }

      const parte = caso.partes.find((p) => p.id === idParte);
      if (!parte) {
        throw new ErroCasoProcesso('NAO_ENCONTRADO', 404);
      }

      await casos.removerParte(idCaso, idParte);
    });
  }

  async consultarLinhaDoTempo(
    token: string,
    idCaso: string,
    filtro?: { idProcesso?: string },
  ): Promise<EventoLinhaTempoCasoDto[]> {
    return this.executar(token, async (casos) => {
      PoliticaCasosProcessos.exigir(casos.autor, 'CASO_VISUALIZAR');
      await casos.buscarCasoPorId(idCaso);
      return casos.listarLinhaDoTempoCaso(idCaso, filtro);
    });
  }
}

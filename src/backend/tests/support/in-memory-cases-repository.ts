import { randomUUID } from 'node:crypto';
import type { DadosTokenAcesso } from '../../src/application/authentication/authentication-contracts.js';
import type {
  CasoDetalheDto,
  CasoResumoDto,
  EventoLinhaTempoCasoDto,
  FiltroCasos,
  MovimentacaoProcessoDto,
  OperacoesCasosProcessos,
  ParteEnvolvidaDto,
  ProcessoDetalheDto,
  RepositorioCasosProcessos,
} from '../../src/application/cases/case-contracts.js';
import { ErroCasoProcesso, PERMISSOES_CASO, type AutorCaso } from '../../src/application/cases/case-policy.js';
import type { Caso } from '../../src/domain/cases/legal-case.js';
import type { ParteEnvolvidaCaso } from '../../src/domain/cases/case-party.js';
import { Processo } from '../../src/domain/cases/legal-process.js';
import type { MovimentacaoProcesso } from '../../src/domain/cases/process-movement.js';
import type { PapelVinculoEscritorio } from '../../src/domain/memberships/membership.js';

export interface ClienteArmazenadoCaso {
  id: string;
  idEscritorio: string;
  nome: string;
  documento: string;
  tipoPessoa: string;
  status: string;
}

export interface MembroArmazenadoCaso {
  id: string;
  idEscritorio: string;
  idUsuario: string;
  nome: string;
  papel: PapelVinculoEscritorio;
  ativo: boolean;
  permissoes?: string[];
}

function clonarCasoDetalhe(caso: CasoDetalheDto): CasoDetalheDto {
  return {
    ...caso,
    clientes: caso.clientes.map((c) => ({ ...c })),
    equipe: caso.equipe.map((e) => ({ ...e })),
    partes: caso.partes.map((p) => ({
      ...p,
      criadoEm: new Date(p.criadoEm.getTime()),
      atualizadoEm: new Date(p.atualizadoEm.getTime()),
    })),
    processos: caso.processos.map((p) => ({ ...p })),
    criadoEm: new Date(caso.criadoEm.getTime()),
    atualizadoEm: new Date(caso.atualizadoEm.getTime()),
    ultimaAtividadeEm: new Date(caso.ultimaAtividadeEm.getTime()),
  };
}

function clonarParte(parte: ParteEnvolvidaDto): ParteEnvolvidaDto {
  return {
    ...parte,
    criadoEm: new Date(parte.criadoEm.getTime()),
    atualizadoEm: new Date(parte.atualizadoEm.getTime()),
  };
}

function clonarProcessoDetalhe(p: ProcessoDetalheDto): ProcessoDetalheDto {
  return {
    ...p,
    criadoEm: new Date(p.criadoEm.getTime()),
    atualizadoEm: new Date(p.atualizadoEm.getTime()),
  };
}

export class RepositorioCasosEmMemoria implements RepositorioCasosProcessos {
  readonly casos: CasoDetalheDto[] = [];
  readonly partes: ParteEnvolvidaDto[] = [];
  readonly processos: ProcessoDetalheDto[] = [];
  readonly movimentacoes: MovimentacaoProcessoDto[] = [];
  readonly linhaTempoCasos: EventoLinhaTempoCasoDto[] = [];
  readonly linhaTempoClientes: Array<{
    id: string;
    idEscritorio: string;
    clientId: string;
    actorId: string;
    action: string;
    current: unknown;
    createdAt: Date;
  }> = [];

  readonly clientes: ClienteArmazenadoCaso[] = [];
  readonly membros: MembroArmazenadoCaso[] = [];

  async executar<T>(
    contexto: DadosTokenAcesso,
    operacao: (casos: OperacoesCasosProcessos) => Promise<T>,
  ): Promise<T> {
    const membroAtual = this.membros.find(
      (m) =>
        m.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase() &&
        m.idUsuario.toLowerCase() === contexto.idUsuario.toLowerCase(),
    );

    const papel = membroAtual?.papel ?? (contexto.papel as PapelVinculoEscritorio) ?? 'PROPRIETARIO';
    const autor: AutorCaso = {
      idUsuario: contexto.idUsuario,
      idEscritorio: contexto.idEscritorioAtivo,
      papel,
      permissoes:
        membroAtual?.permissoes ??
        (papel === 'PROPRIETARIO'
          ? [...PERMISSOES_CASO]
          : ['CASO_VISUALIZAR', 'CASO_CADASTRAR', 'CASO_EDITAR']),
    };

    const operacoes: OperacoesCasosProcessos = {
      autor,

      listarCasos: async (filtro: FiltroCasos): Promise<{ casos: CasoResumoDto[]; total: number }> => {
        let filtrados = this.casos.filter(
          (c) => c.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
        );

        if (filtro.situacao) {
          filtrados = filtrados.filter((c) => c.situacao === filtro.situacao);
        }
        if (filtro.natureza) {
          filtrados = filtrados.filter((c) => c.natureza === filtro.natureza);
        }
        if (filtro.prioridade) {
          filtrados = filtrados.filter((c) => c.prioridade === filtro.prioridade);
        }
        if (filtro.areaJuridica) {
          filtrados = filtrados.filter(
            (c) => c.areaJuridica.toLowerCase() === filtro.areaJuridica!.trim().toLowerCase(),
          );
        }
        if (filtro.idVinculoResponsavel) {
          filtrados = filtrados.filter((c) => c.idVinculoResponsavel === filtro.idVinculoResponsavel);
        }
        if (filtro.idCliente) {
          filtrados = filtrados.filter((c) => c.clientes.some((cli) => cli.id === filtro.idCliente));
        }
        if (filtro.numeroCnj && filtro.numeroCnj.trim().length > 0) {
          const buscaDigitos = filtro.numeroCnj.replace(/\D/g, '');
          filtrados = filtrados.filter((c) =>
            this.processos.some(
              (p) =>
                p.idCaso.toLowerCase() === c.id.toLowerCase() &&
                p.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase() &&
                (buscaDigitos.length > 0 ? p.numeroCnj.includes(buscaDigitos) : p.numeroCnj.includes(filtro.numeroCnj!)),
            ),
          );
        }
        if (filtro.semResponsavel === true) {
          filtrados = filtrados.filter((c) => c.situacao === 'ATIVO' && !c.idVinculoResponsavel);
        }
        if (filtro.semAtividadeDesdeDias && filtro.semAtividadeDesdeDias > 0) {
          const limite = new Date(Date.now() - filtro.semAtividadeDesdeDias * 24 * 60 * 60 * 1000);
          filtrados = filtrados.filter((c) => c.situacao === 'ATIVO' && c.ultimaAtividadeEm <= limite);
        }
        if (filtro.pesquisa && filtro.pesquisa.trim().length > 0) {
          const busca = filtro.pesquisa.trim().toLowerCase();
          const buscaDigitos = busca.replace(/\D/g, '');
          filtrados = filtrados.filter(
            (c) =>
              c.titulo.toLowerCase().includes(busca) ||
              (c.descricao && c.descricao.toLowerCase().includes(busca)) ||
              c.clientes.some(
                (cli) =>
                  cli.nome.toLowerCase().includes(busca) ||
                  (buscaDigitos.length > 0 && cli.documento.includes(buscaDigitos)),
              ) ||
              this.processos.some(
                (p) =>
                  p.idCaso.toLowerCase() === c.id.toLowerCase() &&
                  p.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase() &&
                  buscaDigitos.length > 0 &&
                  p.numeroCnj.includes(buscaDigitos),
              ),
          );
        }

        filtrados.sort((a, b) => b.ultimaAtividadeEm.getTime() - a.ultimaAtividadeEm.getTime());
        const total = filtrados.length;
        const inicio = (filtro.pagina - 1) * filtro.tamanhoPagina;
        const paginados = filtrados.slice(inicio, inicio + filtro.tamanhoPagina);

        return {
          casos: paginados.map((c) => ({
            id: c.id,
            idEscritorio: c.idEscritorio,
            titulo: c.titulo,
            natureza: c.natureza,
            areaJuridica: c.areaJuridica,
            prioridade: c.prioridade,
            situacao: c.situacao,
            idVinculoResponsavel: c.idVinculoResponsavel,
            nomeResponsavel: c.nomeResponsavel,
            valorCausaCentavos: c.valorCausaCentavos,
            valorEnvolvidoCentavos: c.valorEnvolvidoCentavos,
            clientes: c.clientes,
            quantidadeProcessos: this.processos.filter(
              (p) =>
                p.idCaso.toLowerCase() === c.id.toLowerCase() &&
                p.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
            ).length,
            versao: c.versao,
            ultimaAtividadeEm: c.ultimaAtividadeEm,
            criadoEm: c.criadoEm,
            atualizadoEm: c.atualizadoEm,
          })),
          total,
        };
      },

      buscarCasoPorId: async (idCaso: string): Promise<CasoDetalheDto> => {
        const caso = this.casos.find(
          (c) =>
            c.id.toLowerCase() === idCaso.toLowerCase() &&
            c.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
        );
        if (!caso) {
          throw new ErroCasoProcesso('NAO_ENCONTRADO', 404);
        }
        const processosVinculados = this.processos
          .filter(
            (p) =>
              p.idCaso.toLowerCase() === caso.id.toLowerCase() &&
              p.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
          )
          .map((p) => ({
            id: p.id,
            numeroCnj: p.numeroCnj,
            numeroCnjFormatado: p.numeroCnjFormatado,
            relacaoComCaso: p.relacaoComCaso,
            tribunal: p.tribunal,
            comarca: p.comarca,
            vara: p.vara,
            instancia: p.instancia,
            faseProcessual: p.faseProcessual,
            versao: p.versao,
          }));
        const detalhe = clonarCasoDetalhe(caso);
        detalhe.processos = processosVinculados;
        detalhe.quantidadeProcessos = processosVinculados.length;
        return detalhe;
      },

      validarClientesNoEscritorio: async (idsClientes: string[]) => {
        const setIds = new Set(idsClientes.map((id) => id.toLowerCase()));
        return this.clientes
          .filter(
            (c) =>
              c.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase() &&
              setIds.has(c.id.toLowerCase()),
          )
          .map((c) => ({
            id: c.id,
            nome: c.nome,
            documento: c.documento,
            tipoPessoa: c.tipoPessoa,
            status: c.status,
          }));
      },

      validarVinculoEquipeNoEscritorio: async (idVinculo: string) => {
        const membro = this.membros.find(
          (m) =>
            m.id.toLowerCase() === idVinculo.toLowerCase() &&
            m.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
        );
        if (!membro) {
          return null;
        }
        return {
          id: membro.id,
          idUsuario: membro.idUsuario,
          nome: membro.nome,
          papel: membro.papel,
          ativo: membro.ativo,
        };
      },

      criarCaso: async (caso: Caso, partesIniciais: ParteEnvolvidaCaso[]): Promise<CasoDetalheDto> => {
        const clientesDoCaso = this.clientes
          .filter((c) => caso.idsClientes.includes(c.id.toLowerCase()))
          .map((c) => ({
            id: c.id,
            nome: c.nome,
            documento: c.documento,
            tipoPessoa: c.tipoPessoa,
          }));

        const responsavel = caso.idVinculoResponsavel
          ? this.membros.find((m) => m.id.toLowerCase() === caso.idVinculoResponsavel!.toLowerCase())
          : null;

        const equipe = this.membros
          .filter((m) => caso.idsVinculosEquipe.includes(m.id.toLowerCase()))
          .map((m) => ({
            id: m.id,
            idUsuario: m.idUsuario,
            nome: m.nome,
            papel: m.papel,
          }));

        const partesDto: ParteEnvolvidaDto[] = partesIniciais.map((p) => ({
          id: p.id,
          idEscritorio: p.idEscritorio,
          idCaso: p.idCaso,
          tipoParticipacao: p.tipoParticipacao,
          nome: p.nome,
          documento: p.documento,
          oab: p.oab,
          contato: p.contato,
          observacao: p.observacao,
          criadoEm: p.criadoEm,
          atualizadoEm: p.atualizadoEm,
        }));

        this.partes.push(...partesDto);

        const novoDetalhe: CasoDetalheDto = {
          id: caso.id,
          idEscritorio: caso.idEscritorio,
          titulo: caso.titulo,
          descricao: caso.descricao,
          natureza: caso.natureza,
          areaJuridica: caso.areaJuridica,
          prioridade: caso.prioridade,
          situacao: caso.situacao,
          idVinculoResponsavel: caso.idVinculoResponsavel,
          nomeResponsavel: responsavel?.nome ?? null,
          valorCausaCentavos: caso.valorCausaCentavos,
          valorEnvolvidoCentavos: caso.valorEnvolvidoCentavos,
          clientes: clientesDoCaso,
          equipe,
          partes: partesDto,
          processos: [],
          quantidadeProcessos: 0,
          versao: caso.versao,
          ultimaAtividadeEm: caso.ultimaAtividadeEm,
          criadoEm: caso.criadoEm,
          atualizadoEm: caso.atualizadoEm,
        };

        this.casos.push(novoDetalhe);

        // Timeline do caso
        this.linhaTempoCasos.push({
          id: randomUUID(),
          idEscritorio: caso.idEscritorio,
          idCaso: caso.id,
          idProcesso: null,
          idAutor: contexto.idUsuario,
          acao: 'CASO_CRIADO',
          anterior: null,
          atual: {
            titulo: caso.titulo,
            natureza: caso.natureza,
            areaJuridica: caso.areaJuridica,
            prioridade: caso.prioridade,
            situacao: caso.situacao,
          },
          criadoEm: caso.criadoEm,
        });

        // Sincronização atômica com linha do tempo de cada cliente
        for (const clientId of caso.idsClientes) {
          this.linhaTempoClientes.push({
            id: randomUUID(),
            idEscritorio: caso.idEscritorio,
            clientId,
            actorId: contexto.idUsuario,
            action: 'CASO_VINCULADO',
            current: {
              idCaso: caso.id,
              tituloCaso: caso.titulo,
            },
            createdAt: caso.criadoEm,
          });
        }

        return clonarCasoDetalhe(novoDetalhe);
      },

      atualizarCaso: async (
        anterior: CasoDetalheDto,
        atualizado: Caso,
        evento?: { acao: string; anterior?: Record<string, unknown> | null; atual: Record<string, unknown> },
      ): Promise<CasoDetalheDto> => {
        const index = this.casos.findIndex(
          (c) =>
            c.id.toLowerCase() === atualizado.id.toLowerCase() &&
            c.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
        );
        if (index === -1) {
          throw new ErroCasoProcesso('NAO_ENCONTRADO', 404);
        }
        if (this.casos[index]!.versao !== anterior.versao) {
          throw new ErroCasoProcesso('CONFLITO', 409);
        }

        const clientesDoCaso = this.clientes
          .filter((c) => atualizado.idsClientes.includes(c.id.toLowerCase()))
          .map((c) => ({
            id: c.id,
            nome: c.nome,
            documento: c.documento,
            tipoPessoa: c.tipoPessoa,
          }));

        const responsavel = atualizado.idVinculoResponsavel
          ? this.membros.find((m) => m.id.toLowerCase() === atualizado.idVinculoResponsavel!.toLowerCase())
          : null;

        const equipe = this.membros
          .filter((m) => atualizado.idsVinculosEquipe.includes(m.id.toLowerCase()))
          .map((m) => ({
            id: m.id,
            idUsuario: m.idUsuario,
            nome: m.nome,
            papel: m.papel,
          }));

        // Sincronizar clientes na timeline
        const idsAntigos = new Set(anterior.clientes.map((c) => c.id.toLowerCase()));
        const idsNovos = new Set(atualizado.idsClientes.map((id) => id.toLowerCase()));

        for (const novoId of atualizado.idsClientes) {
          if (!idsAntigos.has(novoId.toLowerCase())) {
            this.linhaTempoClientes.push({
              id: randomUUID(),
              idEscritorio: atualizado.idEscritorio,
              clientId: novoId,
              actorId: contexto.idUsuario,
              action: 'CASO_VINCULADO',
              current: { idCaso: atualizado.id, tituloCaso: atualizado.titulo },
              createdAt: atualizado.atualizadoEm,
            });
          }
        }

        for (const antigo of anterior.clientes) {
          if (!idsNovos.has(antigo.id.toLowerCase())) {
            this.linhaTempoClientes.push({
              id: randomUUID(),
              idEscritorio: atualizado.idEscritorio,
              clientId: antigo.id,
              actorId: contexto.idUsuario,
              action: 'CASO_DESVINCULADO',
              current: { idCaso: atualizado.id, tituloCaso: atualizado.titulo },
              createdAt: atualizado.atualizadoEm,
            });
          }
        }

        const casoAtualizadoDto: CasoDetalheDto = {
          ...this.casos[index]!,
          titulo: atualizado.titulo,
          descricao: atualizado.descricao,
          natureza: atualizado.natureza,
          areaJuridica: atualizado.areaJuridica,
          prioridade: atualizado.prioridade,
          situacao: atualizado.situacao,
          idVinculoResponsavel: atualizado.idVinculoResponsavel,
          nomeResponsavel: responsavel?.nome ?? null,
          valorCausaCentavos: atualizado.valorCausaCentavos,
          valorEnvolvidoCentavos: atualizado.valorEnvolvidoCentavos,
          clientes: clientesDoCaso,
          equipe,
          versao: atualizado.versao,
          ultimaAtividadeEm: atualizado.ultimaAtividadeEm,
          atualizadoEm: atualizado.atualizadoEm,
        };

        this.casos[index] = casoAtualizadoDto;

        this.linhaTempoCasos.push({
          id: randomUUID(),
          idEscritorio: atualizado.idEscritorio,
          idCaso: atualizado.id,
          idProcesso: null,
          idAutor: contexto.idUsuario,
          acao: evento?.acao ?? 'CASO_ATUALIZADO',
          anterior: evento?.anterior ?? null,
          atual: evento?.atual ?? {},
          criadoEm: atualizado.atualizadoEm,
        });

        return clonarCasoDetalhe(casoAtualizadoDto);
      },

      arquivarCaso: async (
        anterior: CasoDetalheDto,
        versao: number,
        motivo?: string,
      ): Promise<CasoDetalheDto> => {
        const index = this.casos.findIndex(
          (c) =>
            c.id.toLowerCase() === anterior.id.toLowerCase() &&
            c.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
        );
        if (index === -1) {
          throw new ErroCasoProcesso('NAO_ENCONTRADO', 404);
        }
        if (this.casos[index]!.versao !== versao) {
          throw new ErroCasoProcesso('CONFLITO', 409);
        }

        const agora = new Date();
        const atualizadoDto: CasoDetalheDto = {
          ...this.casos[index]!,
          situacao: 'ARQUIVADO',
          versao: versao + 1,
          ultimaAtividadeEm: agora,
          atualizadoEm: agora,
        };

        this.casos[index] = atualizadoDto;

        this.linhaTempoCasos.push({
          id: randomUUID(),
          idEscritorio: anterior.idEscritorio,
          idCaso: anterior.id,
          idProcesso: null,
          idAutor: contexto.idUsuario,
          acao: 'CASO_ARQUIVADO',
          anterior: { situacao: anterior.situacao },
          atual: { situacao: 'ARQUIVADO', motivo: motivo ?? null },
          criadoEm: agora,
        });

        return clonarCasoDetalhe(atualizadoDto);
      },

      reabrirCaso: async (
        anterior: CasoDetalheDto,
        versao: number,
        motivo?: string,
      ): Promise<CasoDetalheDto> => {
        const index = this.casos.findIndex(
          (c) =>
            c.id.toLowerCase() === anterior.id.toLowerCase() &&
            c.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
        );
        if (index === -1) {
          throw new ErroCasoProcesso('NAO_ENCONTRADO', 404);
        }
        if (this.casos[index]!.versao !== versao) {
          throw new ErroCasoProcesso('CONFLITO', 409);
        }

        const agora = new Date();
        const atualizadoDto: CasoDetalheDto = {
          ...this.casos[index]!,
          situacao: 'ATIVO',
          versao: versao + 1,
          ultimaAtividadeEm: agora,
          atualizadoEm: agora,
        };

        this.casos[index] = atualizadoDto;

        this.linhaTempoCasos.push({
          id: randomUUID(),
          idEscritorio: anterior.idEscritorio,
          idCaso: anterior.id,
          idProcesso: null,
          idAutor: contexto.idUsuario,
          acao: 'CASO_REABERTO',
          anterior: { situacao: anterior.situacao },
          atual: { situacao: 'ATIVO', motivo: motivo ?? null },
          criadoEm: agora,
        });

        return clonarCasoDetalhe(atualizadoDto);
      },

      adicionarParte: async (parte: ParteEnvolvidaCaso): Promise<ParteEnvolvidaDto> => {
        const parteDto: ParteEnvolvidaDto = {
          id: parte.id,
          idEscritorio: parte.idEscritorio,
          idCaso: parte.idCaso,
          tipoParticipacao: parte.tipoParticipacao,
          nome: parte.nome,
          documento: parte.documento,
          oab: parte.oab,
          contato: parte.contato,
          observacao: parte.observacao,
          criadoEm: parte.criadoEm,
          atualizadoEm: parte.atualizadoEm,
        };

        this.partes.push(parteDto);

        const caso = this.casos.find((c) => c.id.toLowerCase() === parte.idCaso.toLowerCase());
        if (caso) {
          caso.partes.push(parteDto);
          caso.ultimaAtividadeEm = parte.atualizadoEm;
          caso.atualizadoEm = parte.atualizadoEm;
        }

        this.linhaTempoCasos.push({
          id: randomUUID(),
          idEscritorio: parte.idEscritorio,
          idCaso: parte.idCaso,
          idProcesso: null,
          idAutor: contexto.idUsuario,
          acao: 'PARTE_ADICIONADA',
          anterior: null,
          atual: { id: parte.id, nome: parte.nome, tipoParticipacao: parte.tipoParticipacao },
          criadoEm: parte.atualizadoEm,
        });

        return clonarParte(parteDto);
      },

      atualizarParte: async (
        anterior: ParteEnvolvidaDto,
        atualizada: ParteEnvolvidaCaso,
      ): Promise<ParteEnvolvidaDto> => {
        const idx = this.partes.findIndex((p) => p.id.toLowerCase() === atualizada.id.toLowerCase());
        if (idx === -1) {
          throw new ErroCasoProcesso('NAO_ENCONTRADO', 404);
        }

        const atualizadaDto: ParteEnvolvidaDto = {
          ...this.partes[idx]!,
          tipoParticipacao: atualizada.tipoParticipacao,
          nome: atualizada.nome,
          documento: atualizada.documento,
          oab: atualizada.oab,
          contato: atualizada.contato,
          observacao: atualizada.observacao,
          atualizadoEm: atualizada.atualizadoEm,
        };

        this.partes[idx] = atualizadaDto;

        const caso = this.casos.find((c) => c.id.toLowerCase() === atualizada.idCaso.toLowerCase());
        if (caso) {
          const pIdx = caso.partes.findIndex((p) => p.id.toLowerCase() === atualizada.id.toLowerCase());
          if (pIdx !== -1) caso.partes[pIdx] = atualizadaDto;
          caso.ultimaAtividadeEm = atualizada.atualizadoEm;
          caso.atualizadoEm = atualizada.atualizadoEm;
        }

        this.linhaTempoCasos.push({
          id: randomUUID(),
          idEscritorio: atualizada.idEscritorio,
          idCaso: atualizada.idCaso,
          idProcesso: null,
          idAutor: contexto.idUsuario,
          acao: 'PARTE_ATUALIZADA',
          anterior: { nome: anterior.nome, tipoParticipacao: anterior.tipoParticipacao },
          atual: { nome: atualizada.nome, tipoParticipacao: atualizada.tipoParticipacao },
          criadoEm: atualizada.atualizadoEm,
        });

        return clonarParte(atualizadaDto);
      },

      removerParte: async (idCaso: string, idParte: string): Promise<void> => {
        const idx = this.partes.findIndex((p) => p.id.toLowerCase() === idParte.toLowerCase());
        if (idx !== -1) {
          this.partes.splice(idx, 1);
        }

        const caso = this.casos.find((c) => c.id.toLowerCase() === idCaso.toLowerCase());
        const agora = new Date();
        if (caso) {
          caso.partes = caso.partes.filter((p) => p.id.toLowerCase() !== idParte.toLowerCase());
          caso.ultimaAtividadeEm = agora;
          caso.atualizadoEm = agora;
        }

        this.linhaTempoCasos.push({
          id: randomUUID(),
          idEscritorio: contexto.idEscritorioAtivo,
          idCaso,
          idProcesso: null,
          idAutor: contexto.idUsuario,
          acao: 'PARTE_REMOVIDA',
          anterior: null,
          atual: { idParte },
          criadoEm: agora,
        });
      },

      listarLinhaDoTempoCaso: async (
        idCaso: string,
        filtro?: { idProcesso?: string },
      ): Promise<EventoLinhaTempoCasoDto[]> => {
        return this.linhaTempoCasos
          .filter(
            (e) =>
              e.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase() &&
              e.idCaso.toLowerCase() === idCaso.toLowerCase() &&
              (!filtro?.idProcesso || e.idProcesso === filtro.idProcesso),
          )
          .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());
      },

      buscarProcessoPorId: async (idProcesso: string): Promise<ProcessoDetalheDto | null> => {
        const proc = this.processos.find(
          (p) =>
            p.id.toLowerCase() === idProcesso.toLowerCase() &&
            p.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
        );
        return proc ? clonarProcessoDetalhe(proc) : null;
      },

      buscarProcessoPorCnjNoCaso: async (
        idCaso: string,
        numeroCnj: string,
      ): Promise<ProcessoDetalheDto | null> => {
        const proc = this.processos.find(
          (p) =>
            p.idCaso.toLowerCase() === idCaso.toLowerCase() &&
            p.numeroCnj === numeroCnj &&
            p.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
        );
        return proc ? clonarProcessoDetalhe(proc) : null;
      },

      cadastrarProcesso: async (processo: Processo): Promise<ProcessoDetalheDto> => {
        const agora = new Date();
        const dto: ProcessoDetalheDto = {
          id: processo.id,
          idEscritorio: processo.idEscritorio,
          idCaso: processo.idCaso,
          numeroCnj: processo.numeroCnj,
          numeroCnjFormatado: processo.obterNumeroFormatado(),
          relacaoComCaso: processo.relacaoComCaso,
          tribunal: processo.tribunal,
          comarca: processo.comarca,
          vara: processo.vara,
          instancia: processo.instancia,
          faseProcessual: processo.faseProcessual,
          versao: processo.versao,
          criadoEm: processo.criadoEm,
          atualizadoEm: processo.atualizadoEm,
        };

        this.processos.push(dto);

        const caso = this.casos.find((c) => c.id.toLowerCase() === processo.idCaso.toLowerCase());
        if (caso) {
          caso.ultimaAtividadeEm = agora;
          caso.atualizadoEm = agora;
        }

        this.linhaTempoCasos.push({
          id: randomUUID(),
          idEscritorio: processo.idEscritorio,
          idCaso: processo.idCaso,
          idProcesso: processo.id,
          idAutor: contexto.idUsuario,
          acao: 'PROCESSO_CADASTRADO',
          anterior: null,
          atual: {
            idProcesso: processo.id,
            numeroCnj: processo.numeroCnj,
            numeroCnjFormatado: processo.obterNumeroFormatado(),
            relacaoComCaso: processo.relacaoComCaso,
            tribunal: processo.tribunal,
            comarca: processo.comarca,
            vara: processo.vara,
            instancia: processo.instancia,
            faseProcessual: processo.faseProcessual,
          },
          criadoEm: agora,
        });

        return clonarProcessoDetalhe(dto);
      },

      atualizarProcesso: async (
        anterior: ProcessoDetalheDto,
        atualizado: Processo,
        evento?: { acao: string; anterior?: Record<string, unknown> | null; atual: Record<string, unknown> },
      ): Promise<ProcessoDetalheDto> => {
        const proc = this.processos.find(
          (p) =>
            p.id.toLowerCase() === atualizado.id.toLowerCase() &&
            p.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
        );

        if (!proc || proc.versao !== anterior.versao) {
          throw new ErroCasoProcesso('CONFLITO', 409);
        }

        proc.relacaoComCaso = atualizado.relacaoComCaso;
        proc.tribunal = atualizado.tribunal;
        proc.comarca = atualizado.comarca;
        proc.vara = atualizado.vara;
        proc.instancia = atualizado.instancia;
        proc.faseProcessual = atualizado.faseProcessual;
        proc.versao = atualizado.versao;
        proc.atualizadoEm = atualizado.atualizadoEm;

        const agora = new Date();
        const caso = this.casos.find((c) => c.id.toLowerCase() === atualizado.idCaso.toLowerCase());
        if (caso) {
          caso.ultimaAtividadeEm = agora;
          caso.atualizadoEm = agora;
        }

        if (evento) {
          this.linhaTempoCasos.push({
            id: randomUUID(),
            idEscritorio: atualizado.idEscritorio,
            idCaso: atualizado.idCaso,
            idProcesso: atualizado.id,
            idAutor: contexto.idUsuario,
            acao: evento.acao,
            anterior: evento.anterior ?? null,
            atual: evento.atual,
            criadoEm: agora,
          });
        }

        return clonarProcessoDetalhe(proc);
      },

      registrarMovimentacao: async (
        movimentacao: MovimentacaoProcesso,
      ): Promise<MovimentacaoProcessoDto> => {
        const agora = new Date();
        const membro = this.membros.find(
          (m) =>
            m.idUsuario.toLowerCase() === movimentacao.idAutor.toLowerCase() &&
            m.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
        );

        const dto: MovimentacaoProcessoDto = {
          id: movimentacao.id,
          idEscritorio: movimentacao.idEscritorio,
          idCaso: movimentacao.idCaso,
          idProcesso: movimentacao.idProcesso,
          idAutor: movimentacao.idAutor,
          nomeAutor: membro?.nome,
          ocorridaEm: movimentacao.ocorridaEm,
          descricao: movimentacao.descricao,
          criadoEm: movimentacao.criadoEm,
        };

        this.movimentacoes.push(dto);

        const caso = this.casos.find((c) => c.id.toLowerCase() === movimentacao.idCaso.toLowerCase());
        if (caso) {
          caso.ultimaAtividadeEm = agora;
          caso.atualizadoEm = agora;
        }

        this.linhaTempoCasos.push({
          id: randomUUID(),
          idEscritorio: movimentacao.idEscritorio,
          idCaso: movimentacao.idCaso,
          idProcesso: movimentacao.idProcesso,
          idAutor: contexto.idUsuario,
          acao: 'MOVIMENTACAO_REGISTRADA',
          anterior: null,
          atual: {
            idMovimentacao: movimentacao.id,
            ocorridaEm: movimentacao.ocorridaEm.toISOString(),
            descricao: movimentacao.descricao,
          },
          criadoEm: agora,
        });

        return dto;
      },

      listarMovimentacoesProcesso: async (
        idProcesso: string,
        paginacao?: { pagina: number; tamanhoPagina: number },
      ): Promise<{ movimentacoes: MovimentacaoProcessoDto[]; total: number }> => {
        const filtradas = this.movimentacoes
          .filter(
            (m) =>
              m.idProcesso.toLowerCase() === idProcesso.toLowerCase() &&
              m.idEscritorio.toLowerCase() === contexto.idEscritorioAtivo.toLowerCase(),
          )
          .sort((a, b) => b.ocorridaEm.getTime() - a.ocorridaEm.getTime());

        const pagina = Math.max(1, paginacao?.pagina || 1);
        const tamanhoPagina = Math.min(Math.max(1, paginacao?.tamanhoPagina || 20), 50);
        const total = filtradas.length;
        const inicio = (pagina - 1) * tamanhoPagina;
        const paginadas = filtradas.slice(inicio, inicio + tamanhoPagina);

        return {
          movimentacoes: paginadas,
          total,
        };
      },
    };

    return operacao(operacoes);
  }
}

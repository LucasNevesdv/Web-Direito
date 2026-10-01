import { randomUUID } from 'node:crypto';

export interface EstadoSessao {
  estaRestrita?: boolean;
  id: string;
  idUsuario: string;
  idEscritorioAtivo: string;
  hashTokenRenovacao: string;
  expiraEm: Date;
  revogadaEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
  ultimoUsoEm: Date | null;
}

export class ErroSessaoInvalida extends Error {
  readonly codigo = 'SESSAO_INVALIDA';
  constructor(readonly campo: keyof EstadoSessao) {
    super(`Invalid session field: ${campo}`);
    this.name = 'ErroSessaoInvalida';
  }
}

export class Sessao {
  readonly #estado: EstadoSessao;

  private constructor(estado: EstadoSessao) {
    if (estado.estaRestrita !== undefined && typeof estado.estaRestrita !== 'boolean') throw new ErroSessaoInvalida('estaRestrita');
    for (const campo of ['id', 'idUsuario', 'idEscritorioAtivo'] as const) {
      if (typeof estado[campo] !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(estado[campo])) {
        throw new ErroSessaoInvalida(campo);
      }
    }
    if (typeof estado.hashTokenRenovacao !== 'string' || !/^[a-f\d]{64}$/.test(estado.hashTokenRenovacao)) {
      throw new ErroSessaoInvalida('hashTokenRenovacao');
    }
    for (const campo of ['criadoEm', 'atualizadoEm', 'expiraEm', 'revogadaEm', 'ultimoUsoEm'] as const) {
      const dataDoEstado = estado[campo];
      if ((campo === 'revogadaEm' || campo === 'ultimoUsoEm') && dataDoEstado === null) continue;
      if (!(dataDoEstado instanceof Date) || !Number.isFinite(dataDoEstado.getTime())) throw new ErroSessaoInvalida(campo);
      if (campo !== 'criadoEm' && dataDoEstado < estado.criadoEm) throw new ErroSessaoInvalida(campo);
    }
    if (estado.expiraEm <= estado.criadoEm) throw new ErroSessaoInvalida('expiraEm');
    this.#estado = structuredClone({
      ...(estado.estaRestrita ? { estaRestrita: true } : {}),
      id: estado.id, idUsuario: estado.idUsuario, idEscritorioAtivo: estado.idEscritorioAtivo,
      hashTokenRenovacao: estado.hashTokenRenovacao, expiraEm: estado.expiraEm,
      criadoEm: estado.criadoEm, atualizadoEm: estado.atualizadoEm,
      revogadaEm: estado.revogadaEm, ultimoUsoEm: estado.ultimoUsoEm,
    });
  }

  static criar(entrada: { id?: string; idUsuario: string; idEscritorioAtivo: string; hashTokenRenovacao: string; expiraEm: Date; agora?: Date; estaRestrita?: boolean }): Sessao {
    const agora = entrada.agora ?? new Date();
    return new Sessao({
      id: entrada.id ?? randomUUID(), idUsuario: entrada.idUsuario, idEscritorioAtivo: entrada.idEscritorioAtivo,
      hashTokenRenovacao: entrada.hashTokenRenovacao, expiraEm: entrada.expiraEm,
      criadoEm: agora, atualizadoEm: agora, revogadaEm: null, ultimoUsoEm: null,
      estaRestrita: entrada.estaRestrita,
    });
  }

  static restaurar(estado: EstadoSessao): Sessao { return new Sessao(estado); }
  get id(): string { return this.#estado.id; }
  get estaRestrita(): boolean { return this.#estado.estaRestrita ?? false; }
  get idUsuario(): string { return this.#estado.idUsuario; }
  get idEscritorioAtivo(): string { return this.#estado.idEscritorioAtivo; }
  get expiraEm(): Date { return new Date(this.#estado.expiraEm); }
  estaAtiva(agora: Date): boolean { return this.#estado.revogadaEm === null && this.#estado.expiraEm > agora; }
  obterEstadoAtualDaSessao(): EstadoSessao { return structuredClone(this.#estado); }
}

import { randomUUID } from 'node:crypto';

export interface EstadoRecuperacaoDeSenha {
  id: string; idUsuario: string; hashToken: string; criadoEm: Date; expiraEm: Date;
  utilizadoEm: Date | null; invalidadoEm: Date | null;
}

export class RecuperacaoDeSenha {
  private constructor(private readonly estado: EstadoRecuperacaoDeSenha) {}

  static criar(idUsuario: string, hashToken: string, agora = new Date()): RecuperacaoDeSenha {
    return this.restaurar({ id: randomUUID(), idUsuario, hashToken, criadoEm: agora,
      expiraEm: new Date(agora.getTime() + 30 * 60 * 1000), utilizadoEm: null, invalidadoEm: null });
  }

  static restaurar(estado: EstadoRecuperacaoDeSenha): RecuperacaoDeSenha {
    const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
    if (!uuid.test(estado.id) || !uuid.test(estado.idUsuario) || !/^[a-f\d]{64}$/.test(estado.hashToken) ||
      ![estado.criadoEm, estado.expiraEm, ...[estado.utilizadoEm, estado.invalidadoEm].filter((data) => data !== null)]
        .every((data) => data instanceof Date && Number.isFinite(data.getTime())) || estado.expiraEm <= estado.criadoEm) {
      throw new Error('Recuperação de senha inválida.');
    }
    return new RecuperacaoDeSenha(structuredClone(estado));
  }

  estaUtilizavel(agora: Date): boolean {
    return !this.estado.utilizadoEm && !this.estado.invalidadoEm && this.estado.expiraEm > agora;
  }

  obterEstadoDaRecuperacao(): EstadoRecuperacaoDeSenha { return structuredClone(this.estado); }
}

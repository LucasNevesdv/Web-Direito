import type { VinculoEscritorio } from '../../domain/memberships/membership.js';
import type { Escritorio } from '../../domain/offices/office.js';
import type { Usuario } from '../../domain/users/user.js';

export interface EntidadesDoCadastroDeEscritorio {
  escritorio: Escritorio;
  usuario: Usuario;
  vinculo: VinculoEscritorio;
}

export interface RepositorioCadastroEscritorio {
  possuiUsuarioComEmail(email: string): Promise<boolean>;
  /** Persist all three entities atomically, or leave all of them unpersisted. */
  salvarCadastroCompleto(dados: EntidadesDoCadastroDeEscritorio): Promise<void>;
}

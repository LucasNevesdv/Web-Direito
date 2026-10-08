import type { DadosTokenAcesso } from './authentication-contracts.js';
import { ErroTokenAcessoInvalido } from './authentication-errors.js';

// Identificadores verificados pelo JWT ainda precisam ser revalidados no PostgreSQL.
export type ContextoDoEscritorio = Pick<DadosTokenAcesso, 'idUsuario' | 'idSessao' | 'idEscritorioAtivo' | 'papel'>;
export function validarContextoDoEscritorio(contexto: ContextoDoEscritorio): void {
  const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  if (!contexto || ![contexto.idUsuario, contexto.idSessao, contexto.idEscritorioAtivo].every(valor => typeof valor === 'string' && uuid.test(valor))) throw new ErroTokenAcessoInvalido();
}

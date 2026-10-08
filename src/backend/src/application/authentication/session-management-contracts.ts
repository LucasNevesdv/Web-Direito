import type { Sessao } from '../../domain/sessions/session.js';
import type { MetadadosSessao } from '../../domain/sessions/session.js';
export type { MetadadosSessao } from '../../domain/sessions/session.js';
import type { DadosTokenAcesso, UsuarioComVinculos } from './authentication-contracts.js';

export interface SessaoPublica extends MetadadosSessao {
  id: string; escritorio: { id: string; nome: string }; atual: boolean;
  criadoEm: Date; ultimaAtividadeEm: Date; expiraEm: Date; situacao: 'ATIVA' | 'REVOGADA' | 'EXPIRADA';
}
export interface AutorizacaoSelecao {
  idUsuario: string; hash: string; criadoEm: Date; expiraEm: Date;
}
export interface TokensSelecao { gerar(): { token: string; hash: string }; calcularHash(token: string): string }
export interface RepositorioGestaoSessoes {
  emitirSelecao(autorizacao: AutorizacaoSelecao, hashSenhaEsperado: string): Promise<void>;
  invalidarSelecao(hash: string, agora: Date): Promise<void>;
  selecionar(hash: string, idEscritorio: string, agora: Date, criar: (usuario: UsuarioComVinculos) => Promise<Sessao>): Promise<void>;
  trocar(contexto: DadosTokenAcesso, idEscritorio: string, agora: Date, criar: (usuario: UsuarioComVinculos) => Promise<Sessao>): Promise<void>;
  listar(contexto: DadosTokenAcesso, agora: Date): Promise<SessaoPublica[]>;
  encerrar(contexto: DadosTokenAcesso, alvo: string | 'outras', agora: Date): Promise<void>;
}
export class ErroGestaoSessao extends Error {
  constructor(readonly codigo: 'SELECAO_INVALIDA' | 'SELECAO_ENCERRADA' | 'VINCULO_PROIBIDO' | 'NAO_ENCONTRADO' | 'CONFLITO', readonly situacao: 401 | 403 | 404 | 409 | 410) { super(codigo); }
}
export class SelecaoEscritorioNecessaria extends Error {
  constructor(readonly resposta: { selecaoNecessaria: true; autorizacaoSelecao: string; expiraEm: string; escritorios: { id: string; nome: string; papel: string }[] }) { super('Selecione um escritório.'); }
}

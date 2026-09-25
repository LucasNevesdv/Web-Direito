import type { IdentidadeAutenticada } from './auth-client';

export interface SessaoCompartilhada {
  id: string;
  instante: number;
  idSessao: string | null;
  motivo: 'entrar' | 'renovar' | 'sair' | 'invalido';
  credenciais: { tokenAcesso: string; identidade: IdentidadeAutenticada; expiraEm: number } | null;
}

// Application code depends on this contract, never on browser coordination APIs.
export interface CoordenadorSessao {
  readonly podeRenovar: boolean;
  obterSessaoCompartilhada(): SessaoCompartilhada | null;
  sincronizarSessaoEntreAbas(): Promise<void>;
  executarOperacaoExclusiva<T>(aoObterExclusividade: (sinal?: AbortSignal) => Promise<T>): Promise<T>;
  compartilharCredenciaisDaSessao(tokenAcesso: string, identidade: IdentidadeAutenticada, motivo: 'entrar' | 'renovar'): void;
  propagarInvalidacaoDaSessao(motivo: 'sair' | 'invalido'): void;
  observarMudancasDaSessao(aoAlterarSessao: (estado: SessaoCompartilhada) => void): () => void;
  registrarAoExpirarSessao(aoExpirarSessao: () => void): void;
  encerrarCoordenacao(): void;
}

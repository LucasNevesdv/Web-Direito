import type { Sessao } from '../../domain/sessions/session.js';
import type { Usuario } from '../../domain/users/user.js';

export interface UsuarioComVinculos {
  usuario: Usuario;
  vinculos: { escritorio: { id: string; nome: string; situacao: 'ATIVO' | 'INATIVO' }; papel: 'PROPRIETARIO' }[];
}

export interface RepositorioAutenticacao {
  buscarUsuarioComVinculosPorEmail(email: string): Promise<UsuarioComVinculos | null>;
  salvarSessao(sessao: Sessao): Promise<void>;
  buscarSessaoComUsuarioPorId(id: string): Promise<{ sessao: Sessao; usuarioComVinculos: UsuarioComVinculos } | null>;
  substituirHashDeRenovacao(entrada: { id: string; hashAtual: string; proximoHash: string; agora: Date }): Promise<boolean>;
  revogarSessao(id: string, agora: Date): Promise<void>;
}

export interface DadosTokenAcesso {
  idUsuario: string;
  idSessao: string;
  idEscritorioAtivo: string;
  papel: 'PROPRIETARIO';
}

export interface TokensAcesso {
  criarTokenDeAcesso(dadosToken: DadosTokenAcesso): Promise<string>;
  validarTokenDeAcesso(token: string): Promise<DadosTokenAcesso>;
}

export interface TokensRenovacao {
  gerarTokenDeRenovacao(idSessao?: string): { idSessao: string; token: string; hash: string };
  interpretarTokenDeRenovacao(token: string): { idSessao: string; hash: string } | null;
  compararHashesDeRenovacao(hashRecebido: string, hashArmazenado: string): boolean;
}

export interface IdentidadePublica {
  usuario: { id: string; nome: string; email: string };
  escritorio: { id: string; nome: string; papel: 'PROPRIETARIO' };
}

export function extrairIdentidadePublicaDoVinculo(usuarioComVinculos: UsuarioComVinculos, idEscritorio: string): IdentidadePublica {
  const vinculo = usuarioComVinculos.vinculos.find((vinculoDoUsuario) => vinculoDoUsuario.escritorio.id === idEscritorio)!;
  return {
    usuario: { id: usuarioComVinculos.usuario.id, nome: usuarioComVinculos.usuario.nome, email: usuarioComVinculos.usuario.email },
    escritorio: { id: vinculo.escritorio.id, nome: vinculo.escritorio.nome, papel: vinculo.papel },
  };
}

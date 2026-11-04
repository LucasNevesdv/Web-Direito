import type { MetadadosSessao, Sessao } from '../../domain/sessions/session.js';
import type { Usuario } from '../../domain/users/user.js';
import type { PapelVinculoEscritorio } from '../../domain/memberships/membership.js';

export interface UsuarioComVinculos {
  usuario: Usuario;
  vinculos: { escritorio: { id: string; nome: string; situacao: 'ATIVO' | 'INATIVO' }; papel: PapelVinculoEscritorio; estaAtivo?: boolean }[];
}

export interface RepositorioAutenticacao {
  buscarUsuarioComVinculosPorEmail(email: string): Promise<UsuarioComVinculos | null>;
  salvarSessao(sessao: Sessao, hashSenhaEsperado: string): Promise<void>;
  buscarSessaoComUsuarioPorId(id: string): Promise<{ sessao: Sessao; usuarioComVinculos: UsuarioComVinculos } | null>;
  substituirHashDeRenovacao(entrada: { id: string; hashAtual: string; proximoHash: string; agora: Date }): Promise<boolean>;
  revogarSessao(id: string, agora: Date): Promise<void>;
}

export interface DadosTokenAcesso {
  idUsuario: string;
  idSessao: string;
  idEscritorioAtivo: string;
  papel: PapelVinculoEscritorio;
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
  deveAlterarSenha?: boolean;
  usuario: { id: string; nome: string; email: string };
  escritorio: { id: string; nome: string; papel: PapelVinculoEscritorio };
}

export function extrairIdentidadePublicaDoVinculo(usuarioComVinculos: UsuarioComVinculos, idEscritorio: string): IdentidadePublica {
  const vinculo = usuarioComVinculos.vinculos.find((vinculoDoUsuario) => vinculoDoUsuario.escritorio.id === idEscritorio)!;
  return {
    ...(usuarioComVinculos.usuario.deveAlterarSenha ? { deveAlterarSenha: true } : {}),
    usuario: { id: usuarioComVinculos.usuario.id, nome: usuarioComVinculos.usuario.nome, email: usuarioComVinculos.usuario.email },
    escritorio: { id: vinculo.escritorio.id, nome: vinculo.escritorio.nome, papel: vinculo.papel },
  };
}

export type MotivoFalhaLogin = 'CREDENCIAIS_INVALIDAS' | 'USUARIO_INATIVO' | 'ESCRITORIO_INATIVO';
// Registra tentativas recusadas sem gravar o e-mail ou a senha informados.
export interface AuditoriaAutenticacao {
  registrarFalhaDeLogin(falha: { idUsuario: string | null; motivo: MotivoFalhaLogin; metadados?: MetadadosSessao }): Promise<void>;
}

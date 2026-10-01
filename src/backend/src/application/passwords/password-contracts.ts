import type { RecuperacaoDeSenha } from '../../domain/password-recovery/password-recovery.js';

export interface UsuarioParaTrocaDeSenha { id: string; email: string; hashSenha: string; estaAtivo: boolean }
export interface TrocaDeSenha { idUsuario: string; hashSenhaAnterior: string; novoHashSenha: string; agora: Date; primeiroAcesso?: boolean }
export interface RepositorioSenhas {
  buscarUsuarioPorEmail(email: string): Promise<UsuarioParaTrocaDeSenha | null>;
  buscarUsuarioPorId(idUsuario: string): Promise<UsuarioParaTrocaDeSenha | null>;
  criarRecuperacao(recuperacao: RecuperacaoDeSenha, hashSenhaEsperado: string): Promise<boolean>;
  buscarRecuperacaoPorHash(hashToken: string): Promise<{ recuperacao: RecuperacaoDeSenha; usuario: UsuarioParaTrocaDeSenha } | null>;
  invalidarRecuperacao(id: string, agora: Date): Promise<void>;
  redefinirSenha(dados: TrocaDeSenha & { idRecuperacao: string }): Promise<boolean>;
  alterarSenha(dados: TrocaDeSenha & { idSessao: string }): Promise<boolean>;
  removerRecuperacoesExpiradas(): Promise<number>;
}
export interface TokensRecuperacao {
  gerarToken(): { token: string; hash: string };
  calcularHash(token: string): string;
}
export interface MensagemEmail { destinatario: string; assunto: string; texto: string; html: string }
export interface EnvioEmail { enviarEmail(mensagem: MensagemEmail, sinal?: AbortSignal): Promise<void> }

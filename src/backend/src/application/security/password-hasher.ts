export interface ProtecaoDeSenhas {
  gerarHashDaSenha(senha: string): Promise<string>;
  compararSenhaComHash(hash: string, senha: string): Promise<boolean>;
}

export interface VerificadorSaudeBanco {
  verificarConexaoComBanco(): Promise<void>;
}

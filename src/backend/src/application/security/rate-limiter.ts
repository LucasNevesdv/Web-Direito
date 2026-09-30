export type EscopoLimiteRequisicoes = 'onboarding-ip' | 'login-ip' | 'login-identity' | 'refresh-ip'
  | 'recovery-ip' | 'recovery-email' | 'reset-ip' | 'reset-token' | 'password-change-ip' | 'password-change-user';
export interface DecisaoLimiteRequisicoes { podeProsseguir: boolean; tentarAposSegundos: number }
export interface PoliticaLimiteRequisicoes { limite: number; janelaSegundos: number }
export interface ArmazenamentoLimiteRequisicoes {
  incrementarContadorDaJanela(escopo: EscopoLimiteRequisicoes, hashChave: string, politica: PoliticaLimiteRequisicoes): Promise<DecisaoLimiteRequisicoes>;
  removerLimitesExpirados(): Promise<number>;
}
export interface ChavesLimiteRequisicoes {
  gerarHashDaChave(escopo: EscopoLimiteRequisicoes, ip: string, email?: string): string;
}
export interface LimitadorRequisicoes {
  registrarTentativaDeRequisicao(escopo: EscopoLimiteRequisicoes, ip: string, email?: string): Promise<DecisaoLimiteRequisicoes>;
}

export class LimitadorRequisicoesCompartilhado implements LimitadorRequisicoes {
  constructor(private readonly armazenamento: ArmazenamentoLimiteRequisicoes, private readonly chaves: ChavesLimiteRequisicoes,
    private readonly politicasPorEscopo: Partial<Record<EscopoLimiteRequisicoes, PoliticaLimiteRequisicoes>>) {}

  registrarTentativaDeRequisicao(escopo: EscopoLimiteRequisicoes, ip: string, email?: string): Promise<DecisaoLimiteRequisicoes> {
    const politica = this.politicasPorEscopo[escopo];
    if (!politica) return Promise.reject(new Error('Rate limiter unavailable'));
    return this.armazenamento.incrementarContadorDaJanela(escopo, this.chaves.gerarHashDaChave(escopo, ip, email), politica);
  }
}

// Missing composition must never silently disable protection.
export const LIMITADOR_REQUISICOES_INDISPONIVEL: LimitadorRequisicoes = {
  async registrarTentativaDeRequisicao() { throw new Error('Rate limiter unavailable'); },
};

export type EscopoLimiteRequisicoes = 'onboarding-ip' | 'login-ip' | 'login-identity' | 'refresh-ip';
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
    private readonly politicasPorEscopo: Record<EscopoLimiteRequisicoes, PoliticaLimiteRequisicoes>) {}

  registrarTentativaDeRequisicao(escopo: EscopoLimiteRequisicoes, ip: string, email?: string): Promise<DecisaoLimiteRequisicoes> {
    return this.armazenamento.incrementarContadorDaJanela(escopo, this.chaves.gerarHashDaChave(escopo, ip, email), this.politicasPorEscopo[escopo]);
  }
}

// Missing composition must never silently disable protection.
export const LIMITADOR_REQUISICOES_INDISPONIVEL: LimitadorRequisicoes = {
  async registrarTentativaDeRequisicao() { throw new Error('Rate limiter unavailable'); },
};

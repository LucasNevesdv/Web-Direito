import type { RepositorioAutenticacao, TokensRenovacao } from './authentication-contracts.js';

export class EncerramentoDeSessao {
  constructor(
    private readonly repositorioAutenticacao: Pick<RepositorioAutenticacao, 'revogarSessao'>,
    private readonly tokensRenovacao: Pick<TokensRenovacao, 'interpretarTokenDeRenovacao'>,
    private readonly relogio: () => Date = () => new Date(),
  ) {}

  async encerrarSessao(tokenDeRenovacao: string | undefined): Promise<void> {
    const tokenInterpretado = tokenDeRenovacao ? this.tokensRenovacao.interpretarTokenDeRenovacao(tokenDeRenovacao) : null;
    if (tokenInterpretado) await this.repositorioAutenticacao.revogarSessao(tokenInterpretado.idSessao, this.relogio());
  }
}

import type { RepositorioAutenticacao, TokensRenovacao } from './authentication-contracts.js';

export class EncerramentoDeSessao {
  constructor(
    private readonly repositorioAutenticacao: Pick<RepositorioAutenticacao, 'revogarSessao' | 'buscarSessaoComUsuarioPorId'>,
    private readonly tokensRenovacao: Pick<TokensRenovacao, 'interpretarTokenDeRenovacao' | 'compararHashesDeRenovacao'>,
    private readonly relogio: () => Date = () => new Date(),
  ) {}

  async encerrarSessao(tokenDeRenovacao: string | undefined): Promise<void> {
    const tokenInterpretado = tokenDeRenovacao ? this.tokensRenovacao.interpretarTokenDeRenovacao(tokenDeRenovacao) : null;
    if (!tokenInterpretado) return;
    const registro = await this.repositorioAutenticacao.buscarSessaoComUsuarioPorId(tokenInterpretado.idSessao);
    if (registro && this.tokensRenovacao.compararHashesDeRenovacao(tokenInterpretado.hash, registro.sessao.obterEstadoAtualDaSessao().hashTokenRenovacao)) {
      await this.repositorioAutenticacao.revogarSessao(tokenInterpretado.idSessao, this.relogio());
    }
  }
}

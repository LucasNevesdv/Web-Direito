import { extrairIdentidadePublicaDoVinculo, type TokensAcesso, type RepositorioAutenticacao, type TokensRenovacao } from './authentication-contracts.js';
import { ErroTokenAcessoInvalido } from './authentication-errors.js';

export class RenovacaoDeSessao {
  constructor(
    private readonly repositorioAutenticacao: RepositorioAutenticacao,
    private readonly tokensRenovacao: TokensRenovacao,
    private readonly tokensAcesso: Pick<TokensAcesso, 'criarTokenDeAcesso'>,
    private readonly validadeAcessoSegundos: number,
    private readonly relogio: () => Date = () => new Date(),
  ) {}

  async renovarSessao(tokenDeRenovacao: string | undefined) {
    const tokenInterpretado = tokenDeRenovacao ? this.tokensRenovacao.interpretarTokenDeRenovacao(tokenDeRenovacao) : null;
    if (!tokenInterpretado) throw new ErroTokenAcessoInvalido();
    const sessaoComUsuario = await this.repositorioAutenticacao.buscarSessaoComUsuarioPorId(tokenInterpretado.idSessao);
    if (!sessaoComUsuario) throw new ErroTokenAcessoInvalido();
    const { sessao, usuarioComVinculos: usuarioComVinculos } = sessaoComUsuario;
    const agora = this.relogio();
    if (!this.tokensRenovacao.compararHashesDeRenovacao(tokenInterpretado.hash, sessao.obterEstadoAtualDaSessao().hashTokenRenovacao)) {
      await this.repositorioAutenticacao.revogarSessao(sessao.id, agora);
      throw new ErroTokenAcessoInvalido();
    }
    const vinculoAtivo = usuarioComVinculos.vinculos.find(({ escritorio, papel }) =>
      escritorio.id === sessao.idEscritorioAtivo && escritorio.situacao === 'ATIVO' && papel === 'PROPRIETARIO');
    if (!sessao.estaAtiva(agora) || usuarioComVinculos.usuario.id !== sessao.idUsuario || usuarioComVinculos.usuario.situacao !== 'ATIVO' || !vinculoAtivo) {
      throw new ErroTokenAcessoInvalido();
    }
    const novoTokenDeRenovacao = this.tokensRenovacao.gerarTokenDeRenovacao(sessao.id);
    const tokenAcesso = await this.tokensAcesso.criarTokenDeAcesso({
      idUsuario: sessao.idUsuario, idSessao: sessao.id, idEscritorioAtivo: sessao.idEscritorioAtivo, papel: vinculoAtivo.papel,
    });
    // The current hash is also a concurrency version. Only one caller can replace it.
    const foiHashSubstituido = await this.repositorioAutenticacao.substituirHashDeRenovacao({ id: sessao.id, hashAtual: tokenInterpretado.hash, proximoHash: novoTokenDeRenovacao.hash, agora });
    if (!foiHashSubstituido) {
      await this.repositorioAutenticacao.revogarSessao(sessao.id, agora);
      throw new ErroTokenAcessoInvalido();
    }
    return {
      resposta: { ...extrairIdentidadePublicaDoVinculo(usuarioComVinculos, sessao.idEscritorioAtivo), tokenAcesso, expiraEmSegundos: this.validadeAcessoSegundos },
      tokenRenovacao: novoTokenDeRenovacao.token, renovacaoExpiraEm: sessao.expiraEm,
    };
  }
}

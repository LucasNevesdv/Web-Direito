import { extrairIdentidadePublicaDoVinculo, type TokensAcesso, type RepositorioAutenticacao } from './authentication-contracts.js';
import { ErroTokenAcessoInvalido } from './authentication-errors.js';

export class ConsultaDeIdentidadeAutenticada {
  constructor(
    private readonly repositorioAutenticacao: RepositorioAutenticacao,
    private readonly tokensAcesso: TokensAcesso,
    private readonly relogio: () => Date = () => new Date(),
  ) {}

  async consultarIdentidadeAutenticada(tokenAcesso: string) {
    const dadosToken = await this.tokensAcesso.validarTokenDeAcesso(tokenAcesso);
    const sessaoComUsuario = await this.repositorioAutenticacao.buscarSessaoComUsuarioPorId(dadosToken.idSessao);
    if (!sessaoComUsuario || !sessaoComUsuario.sessao.estaAtiva(this.relogio()) || sessaoComUsuario.usuarioComVinculos.usuario.situacao !== 'ATIVO'
      || sessaoComUsuario.sessao.idUsuario !== dadosToken.idUsuario || sessaoComUsuario.usuarioComVinculos.usuario.id !== dadosToken.idUsuario
      || sessaoComUsuario.sessao.idEscritorioAtivo !== dadosToken.idEscritorioAtivo) throw new ErroTokenAcessoInvalido();
    const vinculoAutorizado = sessaoComUsuario.usuarioComVinculos.vinculos.find(({ escritorio, papel, estaAtivo }) =>
      escritorio.id === dadosToken.idEscritorioAtivo && escritorio.situacao === 'ATIVO' && estaAtivo !== false && papel === dadosToken.papel);
    if (!vinculoAutorizado) throw new ErroTokenAcessoInvalido();
    const identidade = extrairIdentidadePublicaDoVinculo(sessaoComUsuario.usuarioComVinculos, vinculoAutorizado.escritorio.id);
    return { ...identidade, ...(sessaoComUsuario.sessao.estaRestrita ? { deveAlterarSenha: true } : {}) };
  }
}

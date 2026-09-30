import { Sessao } from '../../domain/sessions/session.js';
import { Usuario } from '../../domain/users/user.js';
import type { ProtecaoDeSenhas } from '../security/password-hasher.js';
import { extrairIdentidadePublicaDoVinculo, type TokensAcesso, type RepositorioAutenticacao, type TokensRenovacao } from './authentication-contracts.js';
import { ErroEscritorioInativo, ErroUsuarioInativo, ErroCredenciaisInvalidas, ErroMultiplosEscritoriosAtivos } from './authentication-errors.js';

export class AutenticacaoDeUsuario {
  constructor(
    private readonly repositorioAutenticacao: RepositorioAutenticacao,
    private readonly protecaoDeSenhas: Pick<ProtecaoDeSenhas, 'compararSenhaComHash'>,
    private readonly tokensAcesso: TokensAcesso,
    private readonly tokensRenovacao: TokensRenovacao,
    private readonly opcoes: { hashSenhaReferencia: string; validadeAcessoSegundos: number; validadeRenovacaoSegundos: number },
    private readonly relogio: () => Date = () => new Date(),
  ) {}

  async autenticarUsuario(credenciaisInformadas: { email: string; senha: string }) {
    let email: string;
    try { email = Usuario.normalizarEmail(credenciaisInformadas.email); } catch { throw new ErroCredenciaisInvalidas(); }
    if (typeof credenciaisInformadas.senha !== 'string' || Array.from(credenciaisInformadas.senha).length < 1 || Array.from(credenciaisInformadas.senha).length > 128) {
      throw new ErroCredenciaisInvalidas();
    }
    const usuarioComVinculos = await this.repositorioAutenticacao.buscarUsuarioComVinculosPorEmail(email);
    // Both unknown email and wrong password perform the same Argon2 verification.
    const senhaCorrespondeAoHash = await this.protecaoDeSenhas.compararSenhaComHash(usuarioComVinculos?.usuario.hashSenha ?? this.opcoes.hashSenhaReferencia, credenciaisInformadas.senha);
    if (!usuarioComVinculos || !senhaCorrespondeAoHash) throw new ErroCredenciaisInvalidas();
    if (usuarioComVinculos.usuario.situacao !== 'ATIVO') throw new ErroUsuarioInativo();
    const vinculosAtivos = usuarioComVinculos.vinculos.filter(({ escritorio }) => escritorio.situacao === 'ATIVO');
    if (vinculosAtivos.length === 0) throw new ErroEscritorioInativo();
    if (vinculosAtivos.length !== 1) throw new ErroMultiplosEscritoriosAtivos();
    const vinculoAtivo = vinculosAtivos[0];
    const tokenDeRenovacao = this.tokensRenovacao.gerarTokenDeRenovacao();
    const agora = this.relogio();
    const sessao = Sessao.criar({
      id: tokenDeRenovacao.idSessao,
      idUsuario: usuarioComVinculos.usuario.id, idEscritorioAtivo: vinculoAtivo.escritorio.id, hashTokenRenovacao: tokenDeRenovacao.hash,
      expiraEm: new Date(agora.getTime() + this.opcoes.validadeRenovacaoSegundos * 1000), agora,
    });
    const tokenAcesso = await this.tokensAcesso.criarTokenDeAcesso({
      idUsuario: usuarioComVinculos.usuario.id, idEscritorioAtivo: vinculoAtivo.escritorio.id, idSessao: sessao.id, papel: vinculoAtivo.papel,
    });
    await this.repositorioAutenticacao.salvarSessao(sessao, usuarioComVinculos.usuario.hashSenha);
    return {
      resposta: { ...extrairIdentidadePublicaDoVinculo(usuarioComVinculos, vinculoAtivo.escritorio.id), tokenAcesso, expiraEmSegundos: this.opcoes.validadeAcessoSegundos },
      tokenRenovacao: tokenDeRenovacao.token,
      renovacaoExpiraEm: sessao.expiraEm,
    };
  }
}

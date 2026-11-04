import { Sessao } from '../../domain/sessions/session.js';
import type { MetadadosSessao } from '../../domain/sessions/session.js';
import type { GestaoSessoes } from './manage-sessions.js';
import { Usuario } from '../../domain/users/user.js';
import type { ProtecaoDeSenhas } from '../security/password-hasher.js';
import { extrairIdentidadePublicaDoVinculo, type AuditoriaAutenticacao, type MotivoFalhaLogin, type TokensAcesso, type RepositorioAutenticacao, type TokensRenovacao } from './authentication-contracts.js';
import { ErroEscritorioInativo, ErroUsuarioInativo, ErroCredenciaisInvalidas, ErroMultiplosEscritoriosAtivos } from './authentication-errors.js';

export class AutenticacaoDeUsuario {
  constructor(
    private readonly repositorioAutenticacao: RepositorioAutenticacao,
    private readonly protecaoDeSenhas: Pick<ProtecaoDeSenhas, 'compararSenhaComHash'>,
    private readonly tokensAcesso: TokensAcesso,
    private readonly tokensRenovacao: TokensRenovacao,
    private readonly opcoes: { hashSenhaReferencia: string; validadeAcessoSegundos: number; validadeRenovacaoSegundos: number },
    private readonly relogio: () => Date = () => new Date(),
    private readonly selecao?: Pick<GestaoSessoes, 'exigirSelecao'>,
    private readonly auditoria?: AuditoriaAutenticacao,
  ) {}

  private async recusar(idUsuario: string | null, motivo: MotivoFalhaLogin, metadados: MetadadosSessao | undefined): Promise<never> {
    await this.auditoria?.registrarFalhaDeLogin({ idUsuario, motivo, metadados });
    throw motivo === 'USUARIO_INATIVO' ? new ErroUsuarioInativo() : motivo === 'ESCRITORIO_INATIVO' ? new ErroEscritorioInativo() : new ErroCredenciaisInvalidas();
  }

  async autenticarUsuario(credenciaisInformadas: { email: string; senha: string }, metadados?: MetadadosSessao) {
    let email: string;
    try { email = Usuario.normalizarEmail(credenciaisInformadas.email); } catch { return this.recusar(null, 'CREDENCIAIS_INVALIDAS', metadados); }
    if (typeof credenciaisInformadas.senha !== 'string' || Array.from(credenciaisInformadas.senha).length < 1 || Array.from(credenciaisInformadas.senha).length > 128) {
      return this.recusar(null, 'CREDENCIAIS_INVALIDAS', metadados);
    }
    const usuarioComVinculos = await this.repositorioAutenticacao.buscarUsuarioComVinculosPorEmail(email);
    // E-mail ausente e senha incorreta passam pela mesma verificação Argon2.
    const senhaCorrespondeAoHash = await this.protecaoDeSenhas.compararSenhaComHash(usuarioComVinculos?.usuario.hashSenha ?? this.opcoes.hashSenhaReferencia, credenciaisInformadas.senha);
    if (!usuarioComVinculos || !senhaCorrespondeAoHash) return this.recusar(usuarioComVinculos?.usuario.id ?? null, 'CREDENCIAIS_INVALIDAS', metadados);
    if (usuarioComVinculos.usuario.situacao !== 'ATIVO') return this.recusar(usuarioComVinculos.usuario.id, 'USUARIO_INATIVO', metadados);
    const vinculosAtivos = usuarioComVinculos.vinculos.filter(({ escritorio, estaAtivo }) => escritorio.situacao === 'ATIVO' && estaAtivo !== false);
    if (vinculosAtivos.length === 0) return this.recusar(usuarioComVinculos.usuario.id, 'ESCRITORIO_INATIVO', metadados);
    if (vinculosAtivos.length !== 1) {
      if (this.selecao) return this.selecao.exigirSelecao(usuarioComVinculos);
      throw new ErroMultiplosEscritoriosAtivos();
    }
    const vinculoAtivo = vinculosAtivos[0];
    const tokenDeRenovacao = this.tokensRenovacao.gerarTokenDeRenovacao();
    const agora = this.relogio();
    const sessao = Sessao.criar({
      id: tokenDeRenovacao.idSessao,
      estaRestrita: usuarioComVinculos.usuario.deveAlterarSenha,
      metadados,
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

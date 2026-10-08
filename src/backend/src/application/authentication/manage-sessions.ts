import { Sessao } from '../../domain/sessions/session.js';
import { extrairIdentidadePublicaDoVinculo, type RepositorioAutenticacao, type TokensAcesso, type TokensRenovacao, type UsuarioComVinculos } from './authentication-contracts.js';
import { ErroPrimeiroAcessoObrigatorio, ErroTokenAcessoInvalido } from './authentication-errors.js';
import type { ConsultaDeIdentidadeAutenticada } from './get-authenticated-identity.js';
import { ErroGestaoSessao, SelecaoEscritorioNecessaria, type MetadadosSessao, type RepositorioGestaoSessoes, type TokensSelecao } from './session-management-contracts.js';

export class GestaoSessoes {
  constructor(private readonly repositorio: RepositorioGestaoSessoes, private readonly autenticacao: RepositorioAutenticacao,
    private readonly identidade: ConsultaDeIdentidadeAutenticada, private readonly acesso: TokensAcesso,
    private readonly renovacao: TokensRenovacao, private readonly selecao: TokensSelecao,
    private readonly validadeAcesso: number, private readonly validadeSessao: number,
    private readonly relogio: () => Date = () => new Date()) {}

  async exigirSelecao(usuario: UsuarioComVinculos): Promise<never> {
    const { token, hash } = this.selecao.gerar(); const agora = this.relogio();
    const expiraEm = new Date(agora.getTime() + 300000);
    await this.repositorio.emitirSelecao({ idUsuario: usuario.usuario.id, hash, criadoEm: agora, expiraEm }, usuario.usuario.hashSenha);
    throw new SelecaoEscritorioNecessaria({ selecaoNecessaria: true, autorizacaoSelecao: token, expiraEm: expiraEm.toISOString(),
      escritorios: usuario.vinculos.filter(v => v.estaAtivo !== false && v.escritorio.situacao === 'ATIVO').map(v => ({ id: v.escritorio.id, nome: v.escritorio.nome, papel: v.papel })) });
  }
  private hashSelecao(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ErroGestaoSessao('SELECAO_INVALIDA', 401);
    return this.selecao.calcularHash(token);
  }
  async cancelarSelecao(token: string) { await this.repositorio.invalidarSelecao(this.hashSelecao(token), this.relogio()); }
  private async contexto(token: string) {
    const identidade = await this.identidade.consultarIdentidadeAutenticada(token);
    if (identidade.deveAlterarSenha) throw new ErroPrimeiroAcessoObrigatorio();
    return this.acesso.validarTokenDeAcesso(token);
  }
  async escritorios(token: string) {
    const contexto = await this.contexto(token);
    const registro = await this.autenticacao.buscarSessaoComUsuarioPorId(contexto.idSessao);
    if (!registro) throw new ErroTokenAcessoInvalido();
    return registro.usuarioComVinculos.vinculos.filter(v => v.estaAtivo !== false && v.escritorio.situacao === 'ATIVO')
      .map(v => ({ id: v.escritorio.id, nome: v.escritorio.nome, papel: v.papel }));
  }
  async listar(token: string) { return this.repositorio.listar(await this.contexto(token), this.relogio()); }
  async encerrar(token: string, alvo: string | 'outras') {
    const contexto = await this.contexto(token);
    await this.repositorio.encerrar(contexto, alvo, this.relogio());
    return alvo === contexto.idSessao;
  }
  async estabelecerContexto(token: string, idEscritorio: string, metadados: MetadadosSessao, troca = false) {
    const contexto = troca ? await this.contexto(token) : undefined;
    const agora = this.relogio(); const renovacao = this.renovacao.gerarTokenDeRenovacao();
    let resultado: { resposta: ReturnType<typeof extrairIdentidadePublicaDoVinculo> & { tokenAcesso: string; expiraEmSegundos: number }; tokenRenovacao: string; renovacaoExpiraEm: Date } | undefined;
    const criar = async (usuario: UsuarioComVinculos) => {
      const vinculo = usuario.vinculos.find(v => v.escritorio.id === idEscritorio && v.estaAtivo !== false && v.escritorio.situacao === 'ATIVO');
      if (!vinculo) throw new ErroGestaoSessao('VINCULO_PROIBIDO', 403);
      const sessao = Sessao.criar({ id: renovacao.idSessao, idUsuario: usuario.usuario.id, idEscritorioAtivo: idEscritorio,
        hashTokenRenovacao: renovacao.hash, expiraEm: new Date(agora.getTime() + this.validadeSessao * 1000), agora,
        estaRestrita: usuario.usuario.deveAlterarSenha, metadados });
      resultado = { resposta: { ...extrairIdentidadePublicaDoVinculo(usuario, idEscritorio), tokenAcesso: await this.acesso.criarTokenDeAcesso({
        idUsuario: usuario.usuario.id, idSessao: sessao.id, idEscritorioAtivo: idEscritorio, papel: vinculo.papel }), expiraEmSegundos: this.validadeAcesso },
        tokenRenovacao: renovacao.token, renovacaoExpiraEm: sessao.expiraEm };
      return sessao;
    };
    if (contexto) await this.repositorio.trocar(contexto, idEscritorio, agora, criar);
    else await this.repositorio.selecionar(this.hashSelecao(token), idEscritorio, agora, criar);
    return resultado!;
  }
}

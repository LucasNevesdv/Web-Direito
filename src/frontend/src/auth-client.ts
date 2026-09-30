import type { CoordenadorSessao } from './session-coordinator';

export interface IdentidadeAutenticada {
  usuario: { id: string; nome: string; email: string };
  escritorio: { id: string; nome: string; papel: 'PROPRIETARIO' };
}
export type EstadoAutenticacao = { situacao: 'carregando' | 'autenticado' | 'naoAutenticado'; identidade: IdentidadeAutenticada | null };

export class ErroLogin extends Error {
  constructor(readonly situacao: number) { super('Não foi possível entrar.'); }
}

function validarEExtrairIdentidade(respostaDaApi: unknown): IdentidadeAutenticada {
  const identidadeRecebida = respostaDaApi as IdentidadeAutenticada | undefined;
  if (!identidadeRecebida || !identidadeRecebida.usuario || !identidadeRecebida.escritorio ||
    ![identidadeRecebida.usuario.id, identidadeRecebida.usuario.nome, identidadeRecebida.usuario.email, identidadeRecebida.escritorio.id, identidadeRecebida.escritorio.nome].every((campo) => typeof campo === 'string' && campo.length > 0) ||
    identidadeRecebida.escritorio.papel !== 'PROPRIETARIO') throw new Error('Identidade indisponível.');
  return { usuario: { id: identidadeRecebida.usuario.id, nome: identidadeRecebida.usuario.nome, email: identidadeRecebida.usuario.email },
    escritorio: { id: identidadeRecebida.escritorio.id, nome: identidadeRecebida.escritorio.nome, papel: identidadeRecebida.escritorio.papel } };
}

export class ClienteAutenticacao {
  private tokenAcessoEmMemoria: string | null = null;
  private estadoAutenticacao: EstadoAutenticacao = { situacao: 'carregando', identidade: null };
  private observadoresDaAutenticacao = new Set<() => void>();
  private promessaRenovacao: Promise<boolean> | undefined;
  private promessaRestauracao: Promise<boolean> | undefined;
  private promessaDeEncerramento: Promise<void> | undefined;
  private versaoDaIdentidade = 0;
  private versaoDoTokenDeAcesso = 0;
  private idSessao: string | null = null;

  constructor(private readonly enviarRequisicaoHttp: typeof fetch = (...argumentos) => fetch(...argumentos),
    private readonly aoExigirNovoLogin: () => void = () => {}, private readonly coordenador?: CoordenadorSessao) {
    coordenador?.observarMudancasDaSessao((sessaoRecebida) => {
      if (!sessaoRecebida.credenciais) {
        ++this.versaoDaIdentidade;
        this.limparCredenciaisLocais();
        this.aoExigirNovoLogin();
      } else {
        if (this.promessaDeEncerramento) return;
        if (this.idSessao && sessaoRecebida.idSessao !== this.idSessao) ++this.versaoDaIdentidade;
        this.idSessao = sessaoRecebida.idSessao;
        this.tokenAcessoEmMemoria = sessaoRecebida.credenciais.tokenAcesso;
        ++this.versaoDoTokenDeAcesso;
        this.definirEstadoDaAutenticacao('autenticado', sessaoRecebida.credenciais.identidade);
      }
    });
    coordenador?.registrarAoExpirarSessao(() => { void this.renovarSessao().then((foiSessaoRenovada) => { if (!foiSessaoRenovada) this.aoExigirNovoLogin(); }); });
  }

  private executarOperacaoExclusiva<T>(aoObterExclusividade: (sinal?: AbortSignal) => Promise<T>) {
    return this.coordenador ? this.coordenador.executarOperacaoExclusiva(aoObterExclusividade) : aoObterExclusividade();
  }

  readonly obterEstadoDaAutenticacao = (): EstadoAutenticacao => this.estadoAutenticacao;
  readonly observarMudancasDaAutenticacao = (aoAlterarAutenticacao: () => void) => {
    this.observadoresDaAutenticacao.add(aoAlterarAutenticacao);
    return () => { this.observadoresDaAutenticacao.delete(aoAlterarAutenticacao); };
  };

  private definirEstadoDaAutenticacao(situacao: EstadoAutenticacao['situacao'], identidadeAutenticada: IdentidadeAutenticada | null = null) {
    this.estadoAutenticacao = { situacao, identidade: identidadeAutenticada };
    this.observadoresDaAutenticacao.forEach((aoAlterarAutenticacao) => aoAlterarAutenticacao());
  }

  private limparCredenciaisLocais() { this.tokenAcessoEmMemoria = null; this.definirEstadoDaAutenticacao('naoAutenticado'); }

  prepararSaidaDaPagina(): void {
    ++this.versaoDaIdentidade;
    this.tokenAcessoEmMemoria = null;
    this.promessaRestauracao = undefined;
    this.coordenador?.encerrarCoordenacao();
    this.definirEstadoDaAutenticacao('carregando');
  }

  restaurarSessao(): Promise<boolean> {
    this.promessaRestauracao ??= this.renovarSessao(true);
    return this.promessaRestauracao;
  }

  renovarSessao(estaRestaurandoSessao = false): Promise<boolean> {
    if (this.promessaDeEncerramento) return Promise.resolve(false);
    if (this.promessaRenovacao) return this.promessaRenovacao;
    const versaoDaIdentidadeAoIniciar = this.versaoDaIdentidade;
    const versaoDoTokenAoIniciar = this.versaoDoTokenDeAcesso;
    this.promessaRenovacao = this.executarOperacaoExclusiva(async (sinal) => {
        if (this.coordenador) await this.coordenador.sincronizarSessaoEntreAbas();
        const sessaoCompartilhada = this.coordenador?.obterSessaoCompartilhada();
        if (sessaoCompartilhada?.credenciais && sessaoCompartilhada.credenciais.expiraEm > Date.now() && (estaRestaurandoSessao || versaoDoTokenAoIniciar !== this.versaoDoTokenDeAcesso)) return true;
        if (versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade || (sessaoCompartilhada && !sessaoCompartilhada.credenciais)) { if (!this.tokenAcessoEmMemoria) this.limparCredenciaisLocais(); return false; }
        if (this.coordenador && !this.coordenador.podeRenovar) { this.limparCredenciaisLocais(); return false; }
        const resposta = await this.enviarRequisicaoHttp('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', ...(sinal ? { signal: sinal } : {}) });
        if (resposta.status !== 200) {
          if (resposta.status === 401 && versaoDaIdentidadeAoIniciar === this.versaoDaIdentidade) this.coordenador?.propagarInvalidacaoDaSessao("invalido");
          throw new Error('Sessão indisponível.');
        }
        const respostaAutenticacao = await resposta.json();
        const identidadeAutenticada = validarEExtrairIdentidade(respostaAutenticacao);
        if (typeof respostaAutenticacao.tokenAcesso !== 'string' || !respostaAutenticacao.tokenAcesso || respostaAutenticacao.expiraEmSegundos <= 0 || typeof respostaAutenticacao.expiraEmSegundos !== 'number') throw new Error('Sessão indisponível.');
        if (versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) return false;
        this.coordenador?.compartilharCredenciaisDaSessao(respostaAutenticacao.tokenAcesso, identidadeAutenticada, "renovar");
        this.idSessao = this.coordenador?.obterSessaoCompartilhada()?.idSessao ?? null;
        this.tokenAcessoEmMemoria = respostaAutenticacao.tokenAcesso;
        ++this.versaoDoTokenDeAcesso;
        this.definirEstadoDaAutenticacao('autenticado', identidadeAutenticada);
        return true;
      }).catch(() => {
        if (versaoDaIdentidadeAoIniciar === this.versaoDaIdentidade) this.limparCredenciaisLocais();
        return false;
      }).finally(() => { this.promessaRenovacao = undefined; });
    return this.promessaRenovacao;
  }

  async autenticarUsuario(email: string, senha: string): Promise<void> {
    await this.promessaDeEncerramento;
    await this.promessaRenovacao;
    return this.executarOperacaoExclusiva(async (sinal) => {
    await this.coordenador?.sincronizarSessaoEntreAbas();
    if (this.coordenador?.obterSessaoCompartilhada()?.credenciais) {
      this.coordenador.propagarInvalidacaoDaSessao("sair");
      this.limparCredenciaisLocais();
      const respostaRevogacao = await this.enviarRequisicaoHttp('/api/v1/auth/logout', { method: 'POST', credentials: 'include', signal: sinal });
      if (respostaRevogacao.status !== 204) throw new ErroLogin(500);
    }
    const versaoDaIdentidadeAoIniciar = ++this.versaoDaIdentidade;
    this.limparCredenciaisLocais();
    try {
      const resposta = await this.enviarRequisicaoHttp('/api/v1/auth/login', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha }), signal: sinal,
      });
      if (resposta.status !== 200) throw new ErroLogin(resposta.status);
      const respostaAutenticacao = await resposta.json();
      if (typeof respostaAutenticacao.tokenAcesso !== 'string' || !respostaAutenticacao.tokenAcesso) throw new ErroLogin(500);
      const respostaIdentidade = await this.enviarRequisicaoHttp('/api/v1/auth/me', {
        credentials: 'include', headers: { Authorization: `Bearer ${respostaAutenticacao.tokenAcesso}` }, signal: sinal,
      });
      if (respostaIdentidade.status !== 200) throw new ErroLogin(500);
      const identidadeAutenticada = validarEExtrairIdentidade(await respostaIdentidade.json());
      if (versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) throw new ErroLogin(500);
      this.coordenador?.compartilharCredenciaisDaSessao(respostaAutenticacao.tokenAcesso, identidadeAutenticada, "entrar");
      this.idSessao = this.coordenador?.obterSessaoCompartilhada()?.idSessao ?? null;
      this.tokenAcessoEmMemoria = respostaAutenticacao.tokenAcesso;
      ++this.versaoDoTokenDeAcesso;
      this.definirEstadoDaAutenticacao('autenticado', identidadeAutenticada);
    } catch (erro) {
      if (versaoDaIdentidadeAoIniciar === this.versaoDaIdentidade) this.limparCredenciaisLocais();
      throw erro instanceof ErroLogin ? erro : new ErroLogin(500);
    }
    });
  }

  async enviarRequisicaoAutenticada(caminho: string, opcoes: RequestInit = {}): Promise<Response> {
    // Constrain credential-bearing requests to this application's API.
    if (!caminho.startsWith('/api/') || caminho.includes('\\') || caminho.includes('#')) throw new Error('Caminho não permitido.');
    const caminhoUrl = new URL(caminho, 'https://local.invalid').pathname;
    if (!caminhoUrl.startsWith('/api/')) throw new Error('Caminho não permitido.');
    const rotasSemRenovacao = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout', '/api/v1/onboarding'];
    if (rotasSemRenovacao.includes(caminhoUrl)) return this.enviarRequisicaoHttp(caminho, { ...opcoes, credentials: 'include' });
    const enviarRequisicaoComTokenAtual = () => {
      const cabecalhos = new Headers(opcoes.headers);
      if (this.tokenAcessoEmMemoria) cabecalhos.set('Authorization', `Bearer ${this.tokenAcessoEmMemoria}`);
      else cabecalhos.delete('Authorization');
      return this.enviarRequisicaoHttp(caminho, { ...opcoes, headers: cabecalhos, credentials: 'include' });
    };
    const tokenEnviado = this.tokenAcessoEmMemoria;
    const versaoDoTokenEnviado = this.versaoDoTokenDeAcesso;
    const versaoDaIdentidadeAoIniciar = this.versaoDaIdentidade;
    const resposta = await enviarRequisicaoComTokenAtual();
    if (versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) throw new Error('Sessão alterada durante a requisição.');
    if (resposta.status !== 401 || !tokenEnviado || versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) return resposta;
    // A late 401 may refer to a token another request has already renewed.
    if (this.versaoDoTokenDeAcesso === versaoDoTokenEnviado && !(await this.renovarSessao())) {
      this.aoExigirNovoLogin();
      return resposta;
    }
    if (!this.tokenAcessoEmMemoria || versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) return resposta;
    const respostaDaRepeticao = await enviarRequisicaoComTokenAtual();
    if (versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) throw new Error('Sessão alterada durante a requisição.');
    if (respostaDaRepeticao.status === 401 && versaoDaIdentidadeAoIniciar === this.versaoDaIdentidade) { this.coordenador?.propagarInvalidacaoDaSessao("invalido"); this.limparCredenciaisLocais(); this.aoExigirNovoLogin(); }
    return respostaDaRepeticao;
  }

  encerrarSessao(): Promise<void> {
    if (this.promessaDeEncerramento) return this.promessaDeEncerramento;
    ++this.versaoDaIdentidade;
    this.coordenador?.propagarInvalidacaoDaSessao("sair");
    this.limparCredenciaisLocais();
    this.aoExigirNovoLogin();
    // Let an already-sent refresh finish setting its cookie before revoking it.
    this.promessaDeEncerramento = (async () => {
      await this.promessaRenovacao;
      try {
        const resposta = await this.executarOperacaoExclusiva(async (sinal) => {
          if (this.coordenador) await this.coordenador.sincronizarSessaoEntreAbas();
          const respostaEncerramento = await this.enviarRequisicaoHttp('/api/v1/auth/logout', { method: 'POST', credentials: 'include', signal: sinal });
          if (respostaEncerramento.status === 204) { this.coordenador?.propagarInvalidacaoDaSessao("sair"); this.limparCredenciaisLocais(); }
          return respostaEncerramento;
        });
        if (resposta.status !== 204) throw new Error('Não foi possível encerrar a sessão no servidor. Tente novamente.');
      } finally { this.promessaDeEncerramento = undefined; }
    })();
    return this.promessaDeEncerramento;
  }

  confirmarRevogacaoPorTrocaDeSenha(): void {
    ++this.versaoDaIdentidade;
    this.coordenador?.propagarInvalidacaoDaSessao('sair');
    this.limparCredenciaisLocais();
    this.aoExigirNovoLogin();
  }

  async trocarSenha(caminho: '/api/v1/auth/alterar-senha' | '/api/v1/auth/redefinir-senha', dados: object): Promise<Response> {
    await this.promessaDeEncerramento;
    await this.promessaRenovacao;
    // Renovar, se necessário, antes de adquirir o mesmo lock usado pelo refresh.
    if (caminho === '/api/v1/auth/alterar-senha') {
      const identidade = await this.enviarRequisicaoAutenticada('/api/v1/auth/me');
      if (!identidade.ok) return identidade;
    }
    return this.executarOperacaoExclusiva(async (sinal) => {
      await this.coordenador?.sincronizarSessaoEntreAbas();
      const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' };
      if (caminho === '/api/v1/auth/alterar-senha' && this.tokenAcessoEmMemoria) cabecalhos.Authorization = `Bearer ${this.tokenAcessoEmMemoria}`;
      const resposta = await this.enviarRequisicaoHttp(caminho, { method: 'POST', credentials: 'include',
        headers: cabecalhos, body: JSON.stringify(dados), signal: sinal });
      if (resposta.ok) this.confirmarRevogacaoPorTrocaDeSenha();
      return resposta;
    });
  }
}


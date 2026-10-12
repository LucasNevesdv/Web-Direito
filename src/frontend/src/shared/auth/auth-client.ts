import type { CoordenadorSessao } from './session-coordinator';

const PAPEIS_ESCRITORIO = ['PROPRIETARIO', 'ADMINISTRADOR', 'ADVOGADO', 'ESTAGIARIO', 'SECRETARIO'] as const;
type PapelEscritorio = (typeof PAPEIS_ESCRITORIO)[number];

function ehPapelEscritorio(valor: unknown): valor is PapelEscritorio {
  return typeof valor === 'string' && PAPEIS_ESCRITORIO.some(papel => papel === valor);
}

export interface IdentidadeAutenticada {
  deveAlterarSenha?: boolean;
  usuario: { id: string; nome: string; email: string };
  escritorio: { id: string; nome: string; papel: PapelEscritorio };
}
export interface EscritorioDisponivel { id: string; nome: string; papel: PapelEscritorio }
export type EstadoAutenticacao = { situacao: 'carregando' | 'autenticado' | 'naoAutenticado' | 'selecionando'; identidade: IdentidadeAutenticada | null };

export class ErroLogin extends Error {
  constructor(readonly situacao: number) { super('Não foi possível entrar.'); }
}

function validarEExtrairIdentidade(respostaDaApi: unknown): IdentidadeAutenticada {
  const identidadeRecebida = respostaDaApi as IdentidadeAutenticada | undefined;
  if (!identidadeRecebida || !identidadeRecebida.usuario || !identidadeRecebida.escritorio ||
    ![identidadeRecebida.usuario.id, identidadeRecebida.usuario.nome, identidadeRecebida.usuario.email, identidadeRecebida.escritorio.id, identidadeRecebida.escritorio.nome].every((campo) => typeof campo === 'string' && campo.length > 0) ||
    !ehPapelEscritorio(identidadeRecebida.escritorio.papel)) throw new Error('Identidade indisponível.');
  return { ...(identidadeRecebida.deveAlterarSenha ? { deveAlterarSenha: true } : {}), usuario: { id: identidadeRecebida.usuario.id, nome: identidadeRecebida.usuario.nome, email: identidadeRecebida.usuario.email },
    escritorio: { id: identidadeRecebida.escritorio.id, nome: identidadeRecebida.escritorio.nome, papel: identidadeRecebida.escritorio.papel } };
}

function extrairCredenciaisDaResposta(resposta: unknown) {
  if (!resposta || typeof resposta !== 'object') throw new Error('Sessão indisponível.');
  const { tokenAcesso, expiraEmSegundos } = resposta as Record<string, unknown>;
  if (typeof tokenAcesso !== 'string' || !tokenAcesso || typeof expiraEmSegundos !== 'number' ||
    !Number.isFinite(expiraEmSegundos) || expiraEmSegundos <= 0) throw new Error('Sessão indisponível.');
  return { tokenAcesso, expiraEmSegundos };
}

function extrairEscritoriosDaSelecao(valor: unknown): EscritorioDisponivel[] {
  if (!Array.isArray(valor)) throw new ErroLogin(500);
  return valor.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new ErroLogin(500);
    const { id, nome, papel } = item as Record<string, unknown>;
    if (typeof id !== 'string' || !id || typeof nome !== 'string' || !nome || !ehPapelEscritorio(papel)) throw new ErroLogin(500);
    return { id, nome, papel };
  });
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
  private selecaoPendente?: { autorizacaoSelecao: string; escritorios: EscritorioDisponivel[] };
  private cancelamentoDoContexto = new AbortController();
  private trocaEmAndamento = false;

  private invalidarContexto() {
    ++this.versaoDaIdentidade;
    this.cancelamentoDoContexto.abort();
    this.cancelamentoDoContexto = new AbortController();
  }
  obterEscritoriosDaSelecao() { return this.selecaoPendente?.escritorios ?? []; }

  constructor(private readonly enviarRequisicaoHttp: typeof fetch = (...argumentos) => fetch(...argumentos),
    private readonly aoExigirNovoLogin: () => void = () => {}, private readonly coordenador?: CoordenadorSessao) {
    coordenador?.observarInicioDaTroca?.(() => {
      this.trocaEmAndamento = true; this.invalidarContexto(); this.definirEstadoDaAutenticacao('carregando');
    });
    coordenador?.observarMudancasDaSessao((sessaoRecebida) => {
      if (!sessaoRecebida.credenciais) {
        this.trocaEmAndamento = false;
        this.invalidarContexto();
        this.limparCredenciaisLocais();
        this.aoExigirNovoLogin();
      } else {
        if (this.promessaDeEncerramento) return;
        if (this.trocaEmAndamento && sessaoRecebida.idSessao === this.idSessao) return;
        this.trocaEmAndamento = false;
        if (this.idSessao && sessaoRecebida.idSessao !== this.idSessao) this.invalidarContexto();
        this.selecaoPendente = undefined;
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
        const { tokenAcesso } = extrairCredenciaisDaResposta(respostaAutenticacao);
        if (versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) return false;
        this.coordenador?.compartilharCredenciaisDaSessao(tokenAcesso, identidadeAutenticada, "renovar");
        this.idSessao = this.coordenador?.obterSessaoCompartilhada()?.idSessao ?? null;
        this.tokenAcessoEmMemoria = tokenAcesso;
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
      if (respostaAutenticacao.selecaoNecessaria === true) {
        if (versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) throw new ErroLogin(409);
        if (!/^[A-Za-z0-9_-]{43}$/.test(respostaAutenticacao.autorizacaoSelecao)) throw new ErroLogin(500);
        this.selecaoPendente = { autorizacaoSelecao: respostaAutenticacao.autorizacaoSelecao,
          escritorios: extrairEscritoriosDaSelecao(respostaAutenticacao.escritorios) };
        this.definirEstadoDaAutenticacao('selecionando');
        return;
      }
      const { tokenAcesso } = extrairCredenciaisDaResposta(respostaAutenticacao);
      const respostaIdentidade = await this.enviarRequisicaoHttp('/api/v1/auth/me', {
        credentials: 'include', headers: { Authorization: `Bearer ${tokenAcesso}` }, signal: sinal,
      });
      if (respostaIdentidade.status !== 200) throw new ErroLogin(500);
      const identidadeAutenticada = validarEExtrairIdentidade(await respostaIdentidade.json());
      if (versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) throw new ErroLogin(500);
      this.coordenador?.compartilharCredenciaisDaSessao(tokenAcesso, identidadeAutenticada, "entrar");
      this.idSessao = this.coordenador?.obterSessaoCompartilhada()?.idSessao ?? null;
      this.tokenAcessoEmMemoria = tokenAcesso;
      ++this.versaoDoTokenDeAcesso;
      this.definirEstadoDaAutenticacao('autenticado', identidadeAutenticada);
    } catch (erro) {
      if (versaoDaIdentidadeAoIniciar === this.versaoDaIdentidade) this.limparCredenciaisLocais();
      throw erro instanceof ErroLogin ? erro : new ErroLogin(500);
    }
    });
  }

  async enviarRequisicaoAutenticada(caminho: string, opcoes: RequestInit = {}): Promise<Response> {
    const sinalDoContexto = this.cancelamentoDoContexto.signal;
    const sinal = opcoes.signal ? AbortSignal.any([opcoes.signal, sinalDoContexto]) : sinalDoContexto;
    // Requisições com credenciais ficam restritas à API desta aplicação.
    if (!caminho.startsWith('/api/') || caminho.includes('\\') || caminho.includes('#')) throw new Error('Caminho não permitido.');
    const caminhoUrl = new URL(caminho, 'https://local.invalid').pathname;
    if (!caminhoUrl.startsWith('/api/')) throw new Error('Caminho não permitido.');
    const rotasSemRenovacao = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout', '/api/v1/onboarding'];
    if (rotasSemRenovacao.includes(caminhoUrl)) return this.enviarRequisicaoHttp(caminho, { ...opcoes, credentials: 'include' });
    const enviarRequisicaoComTokenAtual = () => {
      const cabecalhos = new Headers(opcoes.headers);
      if (this.tokenAcessoEmMemoria) cabecalhos.set('Authorization', `Bearer ${this.tokenAcessoEmMemoria}`);
      else cabecalhos.delete('Authorization');
      return this.enviarRequisicaoHttp(caminho, { ...opcoes, signal: sinal, headers: cabecalhos, credentials: 'include' });
    };
    const tokenEnviado = this.tokenAcessoEmMemoria;
    const versaoDoTokenEnviado = this.versaoDoTokenDeAcesso;
    const versaoDaIdentidadeAoIniciar = this.versaoDaIdentidade;
    const resposta = await enviarRequisicaoComTokenAtual();
    if (versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) throw new Error('Sessão alterada durante a requisição.');
    if (resposta.status !== 401 || !tokenEnviado || versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) return this.protegerLeituraDaResposta(resposta, versaoDaIdentidadeAoIniciar);
    // Um 401 atrasado pode se referir a um token já renovado por outra requisição.
    if (this.versaoDoTokenDeAcesso === versaoDoTokenEnviado && !(await this.renovarSessao())) {
      this.aoExigirNovoLogin();
      return resposta;
    }
    if (!this.tokenAcessoEmMemoria || versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) return resposta;
    const respostaDaRepeticao = await enviarRequisicaoComTokenAtual();
    if (versaoDaIdentidadeAoIniciar !== this.versaoDaIdentidade) throw new Error('Sessão alterada durante a requisição.');
    if (respostaDaRepeticao.status === 401 && versaoDaIdentidadeAoIniciar === this.versaoDaIdentidade) { this.coordenador?.propagarInvalidacaoDaSessao("invalido"); this.limparCredenciaisLocais(); this.aoExigirNovoLogin(); }
    return this.protegerLeituraDaResposta(respostaDaRepeticao, versaoDaIdentidadeAoIniciar);
  }

  private protegerLeituraDaResposta(resposta: Response, versao: number): Response {
    const exigirContextoAtual = () => {
      if (versao !== this.versaoDaIdentidade) throw new Error('Contexto alterado.');
    };
    let corpoProtegido: ReadableStream<Uint8Array> | null | undefined;
    return new Proxy(resposta, { get: (alvo, propriedade) => {
      if (propriedade === 'clone') return () => {
        exigirContextoAtual();
        return this.protegerLeituraDaResposta(alvo.clone(), versao);
      };
      if (propriedade === 'body') {
        if (corpoProtegido !== undefined) return corpoProtegido;
        const corpo = alvo.body;
        if (!corpo) {
          corpoProtegido = null;
          return null;
        }
        let leitor: ReadableStreamDefaultReader<Uint8Array> | undefined;
        corpoProtegido = new ReadableStream<Uint8Array>({
          async pull(controlador) {
            exigirContextoAtual();
            leitor ??= corpo.getReader();
            const trecho = await leitor.read();
            exigirContextoAtual();
            if (trecho.done) controlador.close();
            else controlador.enqueue(trecho.value);
          },
          cancel(motivo) { return leitor ? leitor.cancel(motivo) : corpo.cancel(motivo); },
        }, { highWaterMark: 0 });
        return corpoProtegido;
      }
      const valor = Reflect.get(alvo, propriedade, alvo);
      if (['json', 'text', 'blob', 'arrayBuffer', 'formData', 'bytes'].includes(String(propriedade)) && typeof valor === 'function') return async () => {
        exigirContextoAtual();
        const resultado = await (valor as () => Promise<unknown>).call(alvo);
        exigirContextoAtual();
        return resultado;
      };
      return typeof valor === 'function' ? valor.bind(alvo) : valor;
    } });
  }

  async revalidarSessaoSemRenovar(): Promise<void> {
    if (!this.tokenAcessoEmMemoria || this.estadoAutenticacao.situacao !== 'autenticado') return;
    const versao = this.versaoDaIdentidade;
    const token = this.tokenAcessoEmMemoria;
    const compartilhada = this.coordenador?.obterSessaoCompartilhada();
    if (compartilhada?.credenciais && compartilhada.credenciais.expiraEm <= Date.now()) return;
    const resposta = await this.enviarRequisicaoHttp('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` }, credentials: 'include', signal: this.cancelamentoDoContexto.signal });
    if (versao !== this.versaoDaIdentidade || token !== this.tokenAcessoEmMemoria) return;
    if (resposta.status === 401) { this.encerrarAutenticacaoNoNavegador(); return; }
    if (!resposta.ok) return;
    const identidade = validarEExtrairIdentidade(await resposta.json());
    if (versao !== this.versaoDaIdentidade) return;
    this.coordenador?.compartilharCredenciaisDaSessao(token, identidade, 'renovar');
    this.definirEstadoDaAutenticacao('autenticado', identidade);
  }

  async selecionarEscritorio(idEscritorio: string, troca = false): Promise<void> {
    await this.promessaRenovacao;
    await this.executarOperacaoExclusiva(async sinal => {
      await this.coordenador?.sincronizarSessaoEntreAbas();
      const autorizacao = troca ? `Bearer ${this.tokenAcessoEmMemoria}` : `Selecao ${this.selecaoPendente?.autorizacaoSelecao}`;
      if (troca) this.coordenador?.prepararTrocaDeEscritorio?.();
      this.trocaEmAndamento = true;
      this.invalidarContexto();
      const versao = this.versaoDaIdentidade;
      this.definirEstadoDaAutenticacao('carregando');
      try {
        const resposta = await this.enviarRequisicaoHttp(`/api/v1/auth/${troca ? 'trocar' : 'selecionar'}-escritorio`, {
          method: 'POST', credentials: 'include', headers: { Authorization: autorizacao, 'Content-Type': 'application/json' }, body: JSON.stringify({ idEscritorio }), signal: sinal });
        if (!resposta.ok) throw new ErroLogin(resposta.status);
        const dados = await resposta.json(); const identidade = validarEExtrairIdentidade(dados);
        const { tokenAcesso } = extrairCredenciaisDaResposta(dados);
        if (versao !== this.versaoDaIdentidade) throw new ErroLogin(409);
        this.selecaoPendente = undefined;
        this.trocaEmAndamento = false;
        this.coordenador?.compartilharCredenciaisDaSessao(tokenAcesso, identidade, 'entrar');
        this.idSessao = this.coordenador?.obterSessaoCompartilhada()?.idSessao ?? null;
        this.tokenAcessoEmMemoria = tokenAcesso; ++this.versaoDoTokenDeAcesso;
        this.definirEstadoDaAutenticacao('autenticado', identidade);
      } catch (erro) {
        // Uma resposta perdida pode ter consumido a seleção/trocado o contexto: exigir login é seguro.
        this.trocaEmAndamento = false; this.selecaoPendente = undefined; this.encerrarAutenticacaoNoNavegador(); throw erro;
      }
    });
  }

  encerrarSessao(): Promise<void> {
    if (this.promessaDeEncerramento) return this.promessaDeEncerramento;
    this.invalidarContexto();
    const autorizacaoSelecao = this.selecaoPendente?.autorizacaoSelecao;
    this.selecaoPendente = undefined;
    this.coordenador?.propagarInvalidacaoDaSessao("sair");
    this.limparCredenciaisLocais();
    this.aoExigirNovoLogin();
    // Aguarda um refresh enviado anteriormente definir o cookie antes da revogação.
    this.promessaDeEncerramento = (async () => {
      await this.promessaRenovacao;
      try {
        const resposta = await this.executarOperacaoExclusiva(async (sinal) => {
          if (this.coordenador) await this.coordenador.sincronizarSessaoEntreAbas();
          const respostaEncerramento = await this.enviarRequisicaoHttp('/api/v1/auth/logout', { method: 'POST', credentials: 'include', signal: sinal,
            ...(autorizacaoSelecao ? { headers: { Authorization: `Selecao ${autorizacaoSelecao}` } } : {}) });
          if (respostaEncerramento.status === 204) { this.coordenador?.propagarInvalidacaoDaSessao("sair"); this.limparCredenciaisLocais(); }
          return respostaEncerramento;
        });
        if (resposta.status !== 204) throw new Error('Não foi possível encerrar a sessão no servidor. Tente novamente.');
      } finally { this.promessaDeEncerramento = undefined; }
    })();
    return this.promessaDeEncerramento;
  }

  encerrarAutenticacaoNoNavegador(): void {
    this.invalidarContexto();
    this.coordenador?.propagarInvalidacaoDaSessao('sair');
    this.limparCredenciaisLocais();
    this.aoExigirNovoLogin();
  }

  async trocarSenha(caminho: '/api/v1/auth/alterar-senha' | '/api/v1/auth/redefinir-senha' | '/api/v1/auth/primeiro-acesso', dados: object): Promise<Response> {
    await this.promessaDeEncerramento;
    await this.promessaRenovacao;
    // Renovar, se necessário, antes de adquirir o mesmo lock usado pelo refresh.
    if (caminho !== '/api/v1/auth/redefinir-senha') {
      const identidade = await this.enviarRequisicaoAutenticada('/api/v1/auth/me');
      if (!identidade.ok) return identidade;
    }
    return this.executarOperacaoExclusiva(async (sinal) => {
      await this.coordenador?.sincronizarSessaoEntreAbas();
      const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' };
      if (caminho !== '/api/v1/auth/redefinir-senha' && this.tokenAcessoEmMemoria) cabecalhos.Authorization = `Bearer ${this.tokenAcessoEmMemoria}`;
      const resposta = await this.enviarRequisicaoHttp(caminho, { method: 'POST', credentials: 'include',
        headers: cabecalhos, body: JSON.stringify(dados), signal: sinal });
      if (resposta.ok) this.encerrarAutenticacaoNoNavegador();
      return resposta;
    });
  }
}


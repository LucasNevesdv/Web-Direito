// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClienteAutenticacao, type IdentidadeAutenticada } from './auth-client';
import { CoordenadorSessaoNavegador, type RecursosDeCoordenacaoEntreAbas } from './infrastructure/browser-session-coordinator';

const IDENTIDADE: IdentidadeAutenticada = { usuario: { id: crypto.randomUUID(), nome: 'Ana', email: 'ana@example.test' },
  escritorio: { id: crypto.randomUUID(), nome: 'Office', papel: 'PROPRIETARIO' } };
const ID_SESSAO = crypto.randomUUID();
function criarTokenDeAcessoSimulado(sessao = ID_SESSAO, atual = IDENTIDADE, expiracao = Date.now() + 900000) {
  return `e30.${btoa(JSON.stringify({ sessionId: sessao, sub: atual.usuario.id, activeOfficeId: atual.escritorio.id, role: 'OWNER', exp: Math.floor(expiracao / 1000) }))}.test`;
}
const criarRespostaAutenticacao = (tokenAcesso = criarTokenDeAcessoSimulado(), situacao = 200) => new Response(situacao === 204 ? null : JSON.stringify({ ...IDENTIDADE, tokenAcesso, expiraEmSegundos: 900 }), { status: situacao });
const COORDENADORES: CoordenadorSessaoNavegador[] = [];
afterEach(() => { COORDENADORES.splice(0).forEach((coordenador) => coordenador.encerrarCoordenacao()); vi.restoreAllMocks(); vi.useRealTimers(); });

function criarCenario() {
  const pares = new Set<{ receber?: (evento: MessageEvent) => void }>();
  const mensagens: unknown[] = [];
  let fila = Promise.resolve();
  const bloqueios = { request: vi.fn((_nome, opcoes, retorno) => {
    const tarefa = fila.then(async () => { opcoes.signal.throwIfAborted(); return retorno({}); });
    fila = tarefa.then(() => {}, () => {});
    return tarefa;
  }) } as unknown as Pick<LockManager, 'request'>;
  function criarCoordenadorDeTeste(opcoes: { canal?: boolean; bloqueios?: boolean; tempoLimiteMs?: number } = {}) {
    const par: { receber?: (evento: MessageEvent) => void } = {};
    pares.add(par);
    const canal = {
      postMessage(mensagem: unknown) {
        mensagens.push(mensagem);
        queueMicrotask(() => pares.forEach((outro) => { if (outro !== par) outro.receber?.({ data: structuredClone(mensagem) } as MessageEvent); }));
      },
      addEventListener(_tipo: 'message', observador: (evento: MessageEvent) => void) { par.receber = observador; },
      close() { pares.delete(par); },
    };
    const configuracao: RecursosDeCoordenacaoEntreAbas = { canal: opcoes.canal === false ? undefined : canal,
      bloqueios: opcoes.bloqueios === false ? undefined : bloqueios, tempoDeSincronizacaoMs: 5, tempoLimiteMs: opcoes.tempoLimiteMs ?? 2000 };
    const resultado = new CoordenadorSessaoNavegador(configuracao);
    COORDENADORES.push(resultado);
    return resultado;
  }
  return { criarCoordenadorDeTeste, mensagens, injetar: (dados: unknown) => pares.forEach((par) => par.receber?.({ data: dados } as MessageEvent)) };
}

describe("coordenação da autenticação entre abas da mesma origem", () => {
  it('não repete invalidação terminal da mesma sessão, mas respeita logout explícito posterior', async () => {
    const cenario = criarCenario(), um = cenario.criarCoordenadorDeTeste(), dois = cenario.criarCoordenadorDeTeste();
    um.compartilharCredenciaisDaSessao(criarTokenDeAcessoSimulado(), IDENTIDADE, 'entrar'); await dois.sincronizarSessaoEntreAbas();
    const observar = vi.fn(); um.observarMudancasDaSessao(observar);
    dois.propagarInvalidacaoDaSessao('invalido'); await um.sincronizarSessaoEntreAbas(); expect(observar).toHaveBeenCalledTimes(1);
    dois.propagarInvalidacaoDaSessao('invalido'); await um.sincronizarSessaoEntreAbas(); expect(observar).toHaveBeenCalledTimes(1);
    dois.propagarInvalidacaoDaSessao('sair'); await um.sincronizarSessaoEntreAbas(); expect(observar).toHaveBeenCalledTimes(2);
  });
  it("restaura abas simultâneas com uma renovação e compartilha o token com uma aba posterior", async () => {
    const cenario = criarCenario();
    const armazenamento = vi.spyOn(Storage.prototype, 'setItem');
    const emitido = criarTokenDeAcessoSimulado();
    const transporte = vi.fn<typeof window.fetch>().mockImplementation(async () => criarRespostaAutenticacao(emitido));
    const clientes = [new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste()), new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste())];
    expect(await Promise.all(clientes.map((cliente) => cliente.restaurarSessao()))).toEqual([true, true]);
    expect(transporte).toHaveBeenCalledOnce();
    const posterior = new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste());
    expect(await posterior.restaurarSessao()).toBe(true);
    expect(transporte).toHaveBeenCalledOnce();
    for (const cliente of [...clientes, posterior]) expect(cliente.obterEstadoDaAutenticacao().identidade).toEqual(IDENTIDADE);
    await posterior.enviarRequisicaoAutenticada('/api/v1/auth/me');
    expect(new Headers(transporte.mock.calls.at(-1)![1]?.headers).get('Authorization')).toBe(`Bearer ${emitido}`);
    expect(armazenamento).not.toHaveBeenCalled();
    expect(localStorage.length + sessionStorage.length).toBe(0);
    const codificado = JSON.stringify(cenario.mensagens);
    expect(codificado).not.toMatch(/password|refreshToken|cookie|passwordHash/);
    expect(cenario.mensagens).toEqual(expect.arrayContaining([expect.objectContaining({ versao: 1, tipo: "requisicao", idAba: expect.any(String), id: expect.any(String), instante: expect.any(Number) }),
      expect.objectContaining({ tipo: "resposta", idCorrelacao: expect.any(String), idSessao: ID_SESSAO })]));
  });

  it("coordena respostas 401 simultâneas e repete ambas as requisições com um único token renovado", async () => {
    const cenario = criarCenario();
    let rotacoes = 0, expirado = 2;
    const transporte = vi.fn<typeof window.fetch>().mockImplementation(async (caminho) => {
      if (caminho === '/api/v1/auth/refresh') { ++rotacoes; return criarRespostaAutenticacao(); }
      return criarRespostaAutenticacao(undefined, expirado-- > 0 ? 401 : 200);
    });
    const clientes = [new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste()), new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste())];
    await Promise.all(clientes.map((cliente) => cliente.restaurarSessao()));
    const respostas = await Promise.all(clientes.map((cliente) => cliente.enviarRequisicaoAutenticada('/api/v1/auth/me')));
    expect(respostas.map((resultado) => resultado.status)).toEqual([200, 200]);
    expect(rotacoes).toBe(2); // One initial restoration and one shared renewal, even for identical JWT strings.
    expect(transporte.mock.calls.filter(([caminho]) => caminho === '/api/v1/auth/me')).toHaveLength(4);
  });

  it("propaga a saída imediatamente e limpa todas as identidades antes da resposta do servidor", async () => {
    const cenario = criarCenario();
    let finalizar!: (resultado: Response) => void;
    const transporte = vi.fn<typeof window.fetch>().mockImplementation(async (caminho) => caminho === '/api/v1/auth/logout'
      ? new Promise<Response>((resolver) => { finalizar = resolver; }) : criarRespostaAutenticacao());
    const redirecionar = vi.fn();
    const clientes = [new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste()), new ClienteAutenticacao(transporte, redirecionar, cenario.criarCoordenadorDeTeste())];
    await Promise.all(clientes.map((cliente) => cliente.restaurarSessao()));
    const sair = clientes[0].encerrarSessao();
    await vi.waitFor(() => expect(clientes[1].obterEstadoDaAutenticacao().situacao).toBe('naoAutenticado'));
    expect(redirecionar).toHaveBeenCalledOnce();
    finalizar(criarRespostaAutenticacao(undefined, 204)); await sair;
    expect(clientes.every((cliente) => cliente.obterEstadoDaAutenticacao().identidade === null)).toBe(true);
  });

  it("propaga falha definitiva da renovação sem permitir nova tentativa pela aba aguardando", async () => {
    const cenario = criarCenario();
    const transporte = vi.fn<typeof window.fetch>().mockImplementation(async () => criarRespostaAutenticacao());
    const clientes = [new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste()), new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste())];
    await Promise.all(clientes.map((cliente) => cliente.restaurarSessao()));
    transporte.mockImplementation(async () => criarRespostaAutenticacao(undefined, 401));
    expect(await Promise.all(clientes.map((cliente) => cliente.renovarSessao()))).toEqual([false, false]);
    expect(transporte).toHaveBeenCalledTimes(2);
    expect(clientes.every((cliente) => cliente.obterEstadoDaAutenticacao().identidade === null)).toBe(true);
  });

  it("ignora mensagens antigas, sem correlação, malformadas ou de outra sessão", async () => {
    const cenario = criarCenario(), coordenador = cenario.criarCoordenadorDeTeste();
    coordenador.compartilharCredenciaisDaSessao(criarTokenDeAcessoSimulado(), IDENTIDADE, "entrar");
    const inicial = coordenador.obterSessaoCompartilhada()!;
    const mensagem = { versao: 1, idAba: crypto.randomUUID(), id: crypto.randomUUID(), tipo: "estado", instante: Date.now(), idCorrelacao: null,
      idSessao: ID_SESSAO, estado: { ...inicial, id: crypto.randomUUID(), instante: inicial.instante - 1 } };
    cenario.injetar(mensagem);
    cenario.injetar({ ...mensagem, id: crypto.randomUUID(), estado: { ...mensagem.estado, instante: Date.now() + 1, idSessao: crypto.randomUUID() } });
    cenario.injetar({ ...mensagem, id: crypto.randomUUID(), tipo: "resposta", idCorrelacao: crypto.randomUUID() });
    cenario.injetar({ ...mensagem, id: crypto.randomUUID(), instante: Date.now() - 30000 });
    cenario.injetar({ ...mensagem, id: crypto.randomUUID(), estado: { ...inicial, instante: Date.now() + 1, credenciais: { tokenAcesso: 'malformed', identidade: IDENTIDADE } } });
    expect(coordenador.obterSessaoCompartilhada()).toEqual(inicial);
  });

  it("aceita novo login explícito e ignora renovação tardia da sessão anterior", async () => {
    const cenario = criarCenario(), primeiro = cenario.criarCoordenadorDeTeste(), segundo = cenario.criarCoordenadorDeTeste();
    primeiro.compartilharCredenciaisDaSessao(criarTokenDeAcessoSimulado(), IDENTIDADE, "entrar"); await segundo.sincronizarSessaoEntreAbas();
    const novaIdentidade: IdentidadeAutenticada = { ...IDENTIDADE, usuario: { ...IDENTIDADE.usuario, id: crypto.randomUUID(), nome: 'Other' } };
    const proximaSessao = crypto.randomUUID();
    segundo.compartilharCredenciaisDaSessao(criarTokenDeAcessoSimulado(proximaSessao, novaIdentidade), novaIdentidade, "entrar"); await primeiro.sincronizarSessaoEntreAbas();
    expect(primeiro.obterSessaoCompartilhada()?.credenciais?.identidade).toEqual(novaIdentidade);
    const estado = primeiro.obterSessaoCompartilhada()!;
    cenario.injetar({ versao: 1, idAba: crypto.randomUUID(), id: crypto.randomUUID(), tipo: "estado", instante: Date.now(), idCorrelacao: null,
      idSessao: ID_SESSAO, estado: { ...estado, id: crypto.randomUUID(), instante: estado.instante + 1, idSessao: ID_SESSAO, motivo: "renovar", credenciais: { tokenAcesso: criarTokenDeAcessoSimulado(), identidade: IDENTIDADE } } });
    expect(primeiro.obterSessaoCompartilhada()?.idSessao).toBe(proximaSessao);
  });

  it("mantém a revogação definitiva mesmo com mensagens de renovação e saída fora de ordem", async () => {
    const cenario = criarCenario(), coordenador = cenario.criarCoordenadorDeTeste();
    coordenador.compartilharCredenciaisDaSessao(criarTokenDeAcessoSimulado(), IDENTIDADE, "entrar");
    const atual = coordenador.obterSessaoCompartilhada()!;
    const envelopeMensagem = { versao: 1, idAba: crypto.randomUUID(), id: crypto.randomUUID(), tipo: "estado",
      instante: Date.now(), idCorrelacao: null, idSessao: ID_SESSAO };
    cenario.injetar({ ...envelopeMensagem, estado: { ...atual, id: crypto.randomUUID(), instante: atual.instante - 1, motivo: "sair", credenciais: null } });
    expect(coordenador.obterSessaoCompartilhada()?.credenciais).toBeNull();
    cenario.injetar({ ...envelopeMensagem, id: crypto.randomUUID(), estado: { ...atual, id: crypto.randomUUID(), instante: atual.instante + 1, motivo: "renovar" } });
    expect(coordenador.obterSessaoCompartilhada()?.credenciais).toBeNull();
  });

  it("rejeita resposta de identidade pendente quando outra aba muda o usuário", async () => {
    const cenario = criarCenario(), um = cenario.criarCoordenadorDeTeste(), dois = cenario.criarCoordenadorDeTeste();
    let finalizar!: (criarRespostaAutenticacao: Response) => void;
    const transporte = vi.fn<typeof window.fetch>().mockImplementationOnce(async () => criarRespostaAutenticacao())
      .mockImplementation(() => new Promise<Response>((resolver) => { finalizar = resolver; }));
    const cliente = new ClienteAutenticacao(transporte, undefined, um);
    await cliente.restaurarSessao(); await dois.sincronizarSessaoEntreAbas();
    const pendente = cliente.enviarRequisicaoAutenticada('/api/v1/auth/me');
    const proximaIdentidade: IdentidadeAutenticada = { ...IDENTIDADE, usuario: { ...IDENTIDADE.usuario, id: crypto.randomUUID(), nome: 'Other' } };
    dois.compartilharCredenciaisDaSessao(criarTokenDeAcessoSimulado(crypto.randomUUID(), proximaIdentidade), proximaIdentidade, "entrar");
    await um.sincronizarSessaoEntreAbas();
    finalizar(criarRespostaAutenticacao());
    await expect(pendente).rejects.toThrow('Sessão alterada');
    expect(cliente.obterEstadoDaAutenticacao().identidade).toEqual(proximaIdentidade);
  });

  it("impede que a renovação tardia restaure identidades após saída em outra aba", async () => {
    const cenario = criarCenario();
    let finalizar!: (criarRespostaAutenticacao: Response) => void;
    const transporte = vi.fn<typeof window.fetch>().mockImplementation(async () => criarRespostaAutenticacao());
    const clientes = [new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste()), new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste())];
    await Promise.all(clientes.map((cliente) => cliente.restaurarSessao()));
    transporte.mockImplementationOnce(() => new Promise<Response>((resolver) => { finalizar = resolver; }))
      .mockImplementation(async () => criarRespostaAutenticacao(undefined, 204));
    const renovar = clientes[0].renovarSessao();
    await vi.waitFor(() => expect(finalizar).toBeTypeOf('function'));
    const sair = clientes[1].encerrarSessao();
    await vi.waitFor(() => expect(clientes[0].obterEstadoDaAutenticacao().situacao).toBe('naoAutenticado'));
    finalizar(criarRespostaAutenticacao());
    expect(await renovar).toBe(false); await sair;
    expect(clientes.every((cliente) => cliente.obterEstadoDaAutenticacao().identidade === null)).toBe(true);
    expect(transporte.mock.calls.filter(([caminho]) => caminho === '/api/v1/auth/logout')).toHaveLength(1);
  });

  it("cancela a renovação ao fechar a aba e libera a coordenação para outra aba", async () => {
    const cenario = criarCenario(), primeiro = cenario.criarCoordenadorDeTeste();
    let iniciado!: () => void;
    const promessaInicio = new Promise<void>((resolver) => { iniciado = resolver; });
    const transporte = vi.fn<typeof window.fetch>().mockImplementationOnce((_caminho, opcoes) => new Promise<Response>((_resolver, rejeitar) => {
      opcoes?.signal?.addEventListener('abort', () => rejeitar(new Error('Aborted')), { once: true }); iniciado();
    })).mockImplementation(async () => criarRespostaAutenticacao());
    const um = new ClienteAutenticacao(transporte, undefined, primeiro), dois = new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste());
    const pendente = um.restaurarSessao(); await promessaInicio;
    const aguardando = dois.restaurarSessao(); primeiro.encerrarCoordenacao();
    expect(await pendente).toBe(false); expect(await aguardando).toBe(true);
    expect(transporte).toHaveBeenCalledTimes(2);
  });

  it("limita a espera da coordenação e cancela operação parada", async () => {
    const cenario = criarCenario(), coordenador = cenario.criarCoordenadorDeTeste({ tempoLimiteMs: 20 });
    await expect(coordenador.executarOperacaoExclusiva((sinal) => new Promise((_resolver, rejeitar) => {
      sinal?.addEventListener('abort', () => rejeitar(new Error('Aborted')), { once: true });
    }))).rejects.toThrow('Aborted');
    expect(await coordenador.executarOperacaoExclusiva(async () => true)).toBe(true);
  });

  it.each([{ canal: false, bloqueios: false }, { canal: true, bloqueios: false }])("não renova automaticamente sem Web Locks (%j)", async (opcoes) => {
    const cenario = criarCenario(), transporte = vi.fn<typeof window.fetch>();
    const cliente = new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste(opcoes));
    expect(await cliente.restaurarSessao()).toBe(false); expect(transporte).not.toHaveBeenCalled();
    expect(cliente.obterEstadoDaAutenticacao().situacao).toBe('naoAutenticado');
  });

  it("serializa com segurança sem BroadcastChannel e limita renovações independentes", async () => {
    const cenario = criarCenario(); let ativo = 0, maximo = 0;
    const transporte = vi.fn<typeof window.fetch>().mockImplementation(async () => {
      maximo = Math.max(maximo, ++ativo); await new Promise((resolver) => setTimeout(resolver, 5)); --ativo; return criarRespostaAutenticacao();
    });
    const clientes = [new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste({ canal: false })), new ClienteAutenticacao(transporte, undefined, cenario.criarCoordenadorDeTeste({ canal: false }))];
    expect(await Promise.all(clientes.map((cliente) => cliente.restaurarSessao()))).toEqual([true, true]);
    expect(maximo).toBe(1); expect(transporte).toHaveBeenCalledTimes(2);
  });

  it("renova uma vez a sessão compartilhada prestes a expirar e propaga o resultado", async () => {
    vi.useFakeTimers();
    const cenario = criarCenario(), um = cenario.criarCoordenadorDeTeste(), dois = cenario.criarCoordenadorDeTeste();
    const transporte = vi.fn<typeof window.fetch>().mockImplementation(async () => criarRespostaAutenticacao());
    const clientes = [new ClienteAutenticacao(transporte, undefined, um), new ClienteAutenticacao(transporte, undefined, dois)];
    um.compartilharCredenciaisDaSessao(criarTokenDeAcessoSimulado(ID_SESSAO, IDENTIDADE, Date.now() + 3000), IDENTIDADE, "entrar");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3100);
    expect(transporte).toHaveBeenCalledOnce();
    expect(clientes.every((cliente) => cliente.obterEstadoDaAutenticacao().situacao === 'autenticado')).toBe(true);
    expect(dois.obterSessaoCompartilhada()?.id).toBe(um.obterSessaoCompartilhada()?.id);
  });
});

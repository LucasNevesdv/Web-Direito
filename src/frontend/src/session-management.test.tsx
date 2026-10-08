// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClienteAutenticacao } from './auth-client';
import { ProvedorAutenticacao } from './auth-context';
import { PaginaSelecaoEscritorio, PaginaSessoes } from './session-pages';
import { VerificacaoPeriodicaSessao, type RecursosVerificacao } from './infrastructure/session-polling';

const IDENTIDADE = { usuario: { id: crypto.randomUUID(), nome: 'Ana', email: 'ana@example.test' }, escritorio: { id: crypto.randomUUID(), nome: 'Primeiro', papel: 'PROPRIETARIO' as const } };
const OUTRO = { ...IDENTIDADE, escritorio: { ...IDENTIDADE.escritorio, id: crypto.randomUUID(), nome: 'Segundo' } };
const resposta = (dados: unknown, status=200) => new Response(status===204?null:JSON.stringify(dados),{status});
const credenciais = (identidade=IDENTIDADE) => ({...identidade,tokenAcesso:'token-test',expiraEmSegundos:900});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});
describe('seleção e sessões no frontend',()=>{
  it('login múltiplo mantém autorização apenas em memória, não chama /me nem refresh e envia a escolha',async()=>{
    const token='s'.repeat(43);const transporte=vi.fn<typeof fetch>().mockImplementation(async caminho=>caminho==='/api/v1/auth/login'
      ?resposta({selecaoNecessaria:true,autorizacaoSelecao:token,expiraEm:new Date(Date.now()+300000).toISOString(),escritorios:[IDENTIDADE.escritorio,OUTRO.escritorio]}):resposta(credenciais()));
    const cliente=new ClienteAutenticacao(transporte);await cliente.autenticarUsuario('ana@example.test','senha');
    expect(cliente.obterEstadoDaAutenticacao().situacao).toBe('selecionando');expect(transporte).toHaveBeenCalledTimes(1);
    expect(localStorage.length+sessionStorage.length).toBe(0);await cliente.selecionarEscritorio(IDENTIDADE.escritorio.id);
    expect(new Headers(transporte.mock.calls[1][1]?.headers).get('Authorization')).toBe(`Selecao ${token}`);
    expect(cliente.obterEstadoDaAutenticacao().identidade).toEqual(IDENTIDADE);expect(cliente.obterEscritoriosDaSelecao()).toEqual([]);
  });
  it('logout antes da escolha invalida autorização no servidor e limpa lista',async()=>{
    const transporte=vi.fn<typeof fetch>().mockResolvedValueOnce(resposta({selecaoNecessaria:true,autorizacaoSelecao:'s'.repeat(43),expiraEm:new Date(Date.now()+300000).toISOString(),escritorios:[IDENTIDADE.escritorio]})).mockResolvedValueOnce(resposta(null,204));
    const cliente=new ClienteAutenticacao(transporte);await cliente.autenticarUsuario('a@b.test','senha');await cliente.encerrarSessao();
    expect(new Headers(transporte.mock.calls[1][1]?.headers).get('Authorization')).toBe(`Selecao ${'s'.repeat(43)}`);expect(cliente.obterEscritoriosDaSelecao()).toEqual([]);
  });
  it('recusa seleção sem token de acesso antes de autenticar',async()=>{
    const transporte=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(resposta({selecaoNecessaria:true,autorizacaoSelecao:'s'.repeat(43),expiraEm:new Date(Date.now()+300000).toISOString(),escritorios:[IDENTIDADE.escritorio]}))
      .mockResolvedValueOnce(resposta({...IDENTIDADE,expiraEmSegundos:900}));
    const cliente=new ClienteAutenticacao(transporte);
    await cliente.autenticarUsuario('ana@example.test','senha');
    await expect(cliente.selecionarEscritorio(IDENTIDADE.escritorio.id)).rejects.toThrow('Sessão indisponível');
    expect(cliente.obterEstadoDaAutenticacao().situacao).toBe('naoAutenticado');
  });
  it('troca cancela requisição antiga e recusa resposta atrasada mesmo se transporte ignorar abort',async()=>{
    let finalizar!:(r:Response)=>void;
    const transporte=vi.fn<typeof fetch>().mockImplementation(async caminho=>caminho==='/api/v1/equipe/usuarios'?new Promise< Response >(r=>{finalizar=r;}):resposta(credenciais(caminho==='/api/v1/auth/trocar-escritorio'?OUTRO:IDENTIDADE)));
    const cliente=new ClienteAutenticacao(transporte);await cliente.restaurarSessao();
    const antiga=cliente.enviarRequisicaoAutenticada('/api/v1/equipe/usuarios');const rejeicao=expect(antiga).rejects.toThrow('Sessão alterada');
    const sinal=transporte.mock.calls[1][1]?.signal;await cliente.selecionarEscritorio(OUTRO.escritorio.id,true);expect(sinal?.aborted).toBe(true);
    finalizar(resposta({dados:'antigos'}));await rejeicao;expect(cliente.obterEstadoDaAutenticacao().identidade).toEqual(OUTRO);
  });
  it('recusa corpo lido depois da mudança de contexto',async()=>{
    const transporte=vi.fn<typeof fetch>().mockImplementation(async caminho=>resposta(credenciais(caminho==='/api/v1/auth/trocar-escritorio'?OUTRO:IDENTIDADE)));
    const cliente=new ClienteAutenticacao(transporte);await cliente.restaurarSessao();const antiga=await cliente.enviarRequisicaoAutenticada('/api/v1/equipe/usuarios');
    await cliente.selecionarEscritorio(OUTRO.escritorio.id,true);await expect(antiga.json()).rejects.toThrow('Contexto alterado');
  });
  it('também protege clone e leitura em fluxo após trocar o contexto',async()=>{
    const transporte=vi.fn<typeof fetch>().mockImplementation(async caminho=>resposta(credenciais(caminho==='/api/v1/auth/trocar-escritorio'?OUTRO:IDENTIDADE)));
    const cliente=new ClienteAutenticacao(transporte);
    await cliente.restaurarSessao();
    const antiga=await cliente.enviarRequisicaoAutenticada('/api/v1/equipe/usuarios');
    const copia=antiga.clone();
    const leitor=antiga.body!.getReader();
    await cliente.selecionarEscritorio(OUTRO.escritorio.id,true);
    await expect(copia.json()).rejects.toThrow('Contexto alterado');
    await expect(leitor.read()).rejects.toThrow('Contexto alterado');
  });
  it('polling válido consulta /me sem rotacionar refresh',async()=>{const transporte=vi.fn<typeof fetch>().mockResolvedValue(resposta(credenciais()));const cliente=new ClienteAutenticacao(transporte);await cliente.restaurarSessao();transporte.mockImplementation(async()=>resposta(IDENTIDADE));transporte.mockClear();await cliente.revalidarSessaoSemRenovar();expect(transporte.mock.calls.map(c=>c[0])).toEqual(['/api/v1/auth/me']);});
  it('polling revogado limpa memória sem refresh',async()=>{const transporte=vi.fn<typeof fetch>().mockResolvedValueOnce(resposta(credenciais())).mockResolvedValueOnce(resposta({},401));const cliente=new ClienteAutenticacao(transporte);await cliente.restaurarSessao();await cliente.revalidarSessaoSemRenovar();expect(cliente.obterEstadoDaAutenticacao().situacao).toBe('naoAutenticado');expect(transporte).toHaveBeenCalledTimes(2);});
  it('tela envia seleção e mostra somente os escritórios disponibilizados',async()=>{
    const cliente=new ClienteAutenticacao();vi.spyOn(cliente,'restaurarSessao').mockResolvedValue(false);vi.spyOn(cliente,'obterEscritoriosDaSelecao').mockReturnValue([IDENTIDADE.escritorio,OUTRO.escritorio]);const escolher=vi.spyOn(cliente,'selecionarEscritorio').mockResolvedValue();
    render(<ProvedorAutenticacao cliente={cliente}><PaginaSelecaoEscritorio/></ProvedorAutenticacao>);fireEvent.click(screen.getByText(/Segundo —/));await waitFor(()=>expect(escolher).toHaveBeenCalledWith(OUTRO.escritorio.id,false));
  });
  it('mostra sessão atual e exige confirmação antes de encerrar',async()=>{
    const cliente=new ClienteAutenticacao();vi.spyOn(cliente,'restaurarSessao').mockResolvedValue(false);const revogar=vi.spyOn(cliente,'encerrarAutenticacaoNoNavegador').mockImplementation(()=>{});
    const consultar=vi.spyOn(cliente,'enviarRequisicaoAutenticada').mockImplementation(async(_caminho,opcoes)=>opcoes?.method?resposta(null,204):resposta([{id:'sessao',escritorio:IDENTIDADE.escritorio,atual:true,navegador:'Chrome',dispositivo:'Windows',ipMascarado:'127.0.*.*',criadoEm:new Date().toISOString(),ultimaAtividadeEm:new Date().toISOString(),expiraEm:new Date().toISOString(),situacao:'ATIVA'}]));
    render(<ProvedorAutenticacao cliente={cliente}><PaginaSessoes/></ProvedorAutenticacao>);await screen.findByText('Sessão atual — Primeiro');fireEvent.click(screen.getByText('Encerrar sessão'));expect(consultar).toHaveBeenCalledTimes(1);expect(screen.getByRole('alertdialog')).toBeTruthy();fireEvent.click(screen.getByText('Confirmar'));await waitFor(()=>expect(revogar).toHaveBeenCalledOnce());
  });
});
describe('liderança da verificação periódica',()=>{
  function recursos() {
    let fila=Promise.resolve();const ouvintes=new Set<(e:MessageEvent)=>void>();
    const bloqueios={request:vi.fn((_nome: string,opcoes:{signal:AbortSignal},retorno:()=>Promise<void>)=>{
      const atual=fila.then(async()=>{if(opcoes.signal.aborted)throw new Error('abort');await retorno();});fila=atual.catch(()=>{});return atual;
    })} as unknown as RecursosVerificacao['bloqueios'];
    const canal=()=>({postMessage:(dados:unknown)=>ouvintes.forEach(o=>o({data:dados} as MessageEvent)),addEventListener:(_tipo:string,o:(e:MessageEvent)=>void)=>{ouvintes.add(o);},close:()=>{}}) as RecursosVerificacao['canal'];
    return {bloqueios,canal};
  }
  it('três abas fazem uma consulta em 30 segundos e assumem liderança ao fechar a primeira',async()=>{
    vi.useFakeTimers();const r=recursos();const verificar=vi.fn(async()=>{});const abas=[0,1,2].map(()=>new VerificacaoPeriodicaSessao(verificar,{bloqueios:r.bloqueios,canal:r.canal()}));
    abas.forEach(a=>a.definirVisibilidade(true));await vi.advanceTimersByTimeAsync(29000);expect(verificar).not.toHaveBeenCalled();await vi.advanceTimersByTimeAsync(1000);expect(verificar).toHaveBeenCalledTimes(1);
    abas[0].encerrar();await vi.advanceTimersByTimeAsync(30000);expect(verificar).toHaveBeenCalledTimes(2);abas.forEach(a=>a.encerrar());
  });
  it('foco de aba secundária solicita uma consulta na coordenadora',async()=>{vi.useFakeTimers();const r=recursos();const verificar=vi.fn(async()=>{});const a=new VerificacaoPeriodicaSessao(verificar,{bloqueios:r.bloqueios,canal:r.canal()}),b=new VerificacaoPeriodicaSessao(verificar,{bloqueios:r.bloqueios,canal:r.canal()});a.definirVisibilidade(true);b.definirVisibilidade(true);await vi.advanceTimersByTimeAsync(0);b.recuperarFoco();await vi.advanceTimersByTimeAsync(0);expect(verificar).toHaveBeenCalledTimes(1);a.encerrar();b.encerrar();});
  it('sem BroadcastChannel mantém polling periódico coordenado pelo Web Locks',async()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));const r=recursos();const verificar=vi.fn(async()=>{});const a=new VerificacaoPeriodicaSessao(verificar,{bloqueios:r.bloqueios});a.definirVisibilidade(true);await vi.advanceTimersByTimeAsync(30000);expect(verificar).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(30000);expect(verificar).toHaveBeenCalledTimes(2);a.encerrar();});
  it('sem Web Locks coalesce solicitações de foco pelo BroadcastChannel',async()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));const r=recursos();const verificar=vi.fn(async()=>{});const a=new VerificacaoPeriodicaSessao(verificar,{canal:r.canal()});a.definirVisibilidade(true);await vi.advanceTimersByTimeAsync(60000);expect(verificar).not.toHaveBeenCalled();a.recuperarFoco();a.recuperarFoco();await vi.advanceTimersByTimeAsync(100);expect(verificar).toHaveBeenCalledOnce();a.encerrar();});
  it('sem APIs de coordenação limita rajadas de foco à aba atual',async()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));const verificar=vi.fn(async()=>{});const a=new VerificacaoPeriodicaSessao(verificar,{});a.definirVisibilidade(true);await vi.advanceTimersByTimeAsync(60000);expect(verificar).not.toHaveBeenCalled();a.recuperarFoco();a.recuperarFoco();await vi.advanceTimersByTimeAsync(0);expect(verificar).toHaveBeenCalledOnce();a.encerrar();});
  it('fallback BroadcastChannel sem Web Locks coalesce solicitações de foco entre abas',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));const r=recursos();const verificar=vi.fn(async()=>{});
    const abas=Array.from({length:3},()=>new VerificacaoPeriodicaSessao(verificar,{canal:r.canal()}));
    abas.forEach(aba=>aba.recuperarFoco());await vi.advanceTimersByTimeAsync(100);
    expect(verificar).toHaveBeenCalledOnce();abas.forEach(aba=>aba.encerrar());
  });
  it.each([2000,0,NaN,300001])('recusa intervalo inválido %s',intervalo=>{expect(()=>new VerificacaoPeriodicaSessao(async()=>{}, {},intervalo)).toThrow();});
});

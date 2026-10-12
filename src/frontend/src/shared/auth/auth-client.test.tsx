// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClienteAutenticacao } from './auth-client';
import { navegar } from '../../routing';
import { Aplicacao } from '../../app';

const IDENTIDADE = { usuario: { id: 'u', nome: 'Ana', email: 'ana@example.test' }, escritorio: { id: 'o', nome: 'Office', papel: 'PROPRIETARIO' } };
const criarRespostaHttp = (situacao = 200, token = 'access-1') => new Response(situacao === 204 ? null : JSON.stringify({ ...IDENTIDADE, tokenAcesso: token, expiraEmSegundos: 900 }), { status: situacao });
function criarPromessaControlada<T>() { let resolver!: (valor: T) => void; const promessa = new Promise<T>((concluir) => { resolver = concluir; }); return { promise: promessa, resolver }; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("cliente central de autenticação", () => {
  it("exibe carregamento sem conteúdo protegido e restaura uma vez sob StrictMode", async () => {
    const pendente = criarPromessaControlada<Response>();
    const transporte = vi.fn<typeof window.fetch>().mockReturnValue(pendente.promise);
    const cliente = new ClienteAutenticacao(transporte);
    window.history.replaceState({}, '', '/app');
    render(<StrictMode><Aplicacao cliente={cliente} /></StrictMode>);
    expect(screen.getByText('Restaurando sessão…')).toBeTruthy();
    expect(screen.queryByText('Olá, Ana')).toBeNull();
    expect(transporte).toHaveBeenCalledTimes(1);
    await act(async () => { pendente.resolver(criarRespostaHttp()); });
    expect(await screen.findByText('Olá, Ana')).toBeTruthy();
    expect(transporte).toHaveBeenCalledWith('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
  });

  it("restaura um novo cliente após recarga sem armazenamento persistente do token", async () => {
    const armazenamento = vi.spyOn(Storage.prototype, 'setItem');
    const transporte = vi.fn<typeof window.fetch>().mockImplementation(async () => criarRespostaHttp());
    await new ClienteAutenticacao(transporte).restaurarSessao();
    const recarregado = new ClienteAutenticacao(transporte);
    expect(recarregado.obterEstadoDaAutenticacao().situacao).toBe('carregando');
    expect(await recarregado.restaurarSessao()).toBe(true);
    expect(recarregado.obterEstadoDaAutenticacao().identidade).toEqual(IDENTIDADE);
    expect(transporte).toHaveBeenCalledTimes(2);
    expect(armazenamento).not.toHaveBeenCalled();
    expect(JSON.stringify(recarregado.obterEstadoDaAutenticacao())).not.toContain('access-1');
  });

  it.each([401, 500])("exibe login uma vez após falha de restauração (%s), sem conteúdo protegido", async (situacao) => {
    const transporte = vi.fn<typeof window.fetch>().mockResolvedValue(criarRespostaHttp(situacao));
    window.history.replaceState({}, '', '/app');
    render(<Aplicacao cliente={new ClienteAutenticacao(transporte)} />);
    expect(await screen.findByRole('heading', { name: 'Entre no seu escritório' })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(screen.queryByText('Olá, Ana')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(transporte).toHaveBeenCalledTimes(1);
  });

  it("trata erros de rede e identidades inválidas sem restaurar credenciais", async () => {
    for (const transporte of [vi.fn().mockRejectedValue(new Error('private')), vi.fn().mockResolvedValue(new Response('{}'))]) {
      const cliente = new ClienteAutenticacao(transporte);
      expect(await cliente.restaurarSessao()).toBe(false);
      expect(cliente.obterEstadoDaAutenticacao()).toEqual({ situacao: 'naoAutenticado', identidade: null });
    }
  });

  it("compartilha a mesma Promise de renovação", async () => {
    const pendente = criarPromessaControlada<Response>();
    const transporte = vi.fn<typeof window.fetch>().mockReturnValue(pendente.promise);
    const cliente = new ClienteAutenticacao(transporte);
    const primeiro = cliente.renovarSessao(), segundo = cliente.renovarSessao();
    expect(primeiro).toBe(segundo); expect(transporte).toHaveBeenCalledTimes(1);
    pendente.resolver(criarRespostaHttp());expect(await primeiro).toBe(true);
  });

  it("compartilha uma rotação para respostas 401 concorrentes e repete cada requisição uma vez com Bearer", async () => {
    const pendente = criarPromessaControlada<Response>();
    const transporte = vi.fn<typeof window.fetch>().mockResolvedValueOnce(criarRespostaHttp()).mockResolvedValueOnce(criarRespostaHttp(401)).mockResolvedValueOnce(criarRespostaHttp(401))
      .mockReturnValueOnce(pendente.promise).mockResolvedValueOnce(criarRespostaHttp()).mockResolvedValueOnce(criarRespostaHttp());
    const cliente = new ClienteAutenticacao(transporte);await cliente.restaurarSessao();
    const primeiro = cliente.enviarRequisicaoAutenticada('/api/v1/auth/me'), segundo = cliente.enviarRequisicaoAutenticada('/api/v1/auth/me');
    await waitFor(() => expect(transporte).toHaveBeenCalledTimes(4));
    pendente.resolver(criarRespostaHttp(200, 'access-2'));
    expect((await Promise.all([primeiro, segundo])).map((resposta) => resposta.status)).toEqual([200, 200]);
    expect(transporte.mock.calls.filter(([caminho]) => caminho === '/api/v1/auth/refresh')).toHaveLength(2);
    expect(new Headers(transporte.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer access-1');
    expect(new Headers(transporte.mock.calls[4][1]?.headers).get('Authorization')).toBe('Bearer access-2');
    expect(transporte).toHaveBeenCalledTimes(6);
  });

  it("não renova novamente após resposta 401 tardia do token anterior", async () => {
    const tardio = criarPromessaControlada<Response>();
    const transporte = vi.fn<typeof window.fetch>().mockResolvedValue(criarRespostaHttp(401)).mockResolvedValueOnce(criarRespostaHttp()).mockResolvedValueOnce(criarRespostaHttp(401))
      .mockReturnValueOnce(tardio.promise).mockResolvedValueOnce(criarRespostaHttp(200, 'access-1')).mockResolvedValueOnce(criarRespostaHttp()).mockResolvedValueOnce(criarRespostaHttp());
    const cliente = new ClienteAutenticacao(transporte);await cliente.restaurarSessao();
    const primeiro = cliente.enviarRequisicaoAutenticada('/api/v1/auth/me'), segundo = cliente.enviarRequisicaoAutenticada('/api/v1/auth/me');
    expect((await primeiro).status).toBe(200);
    tardio.resolver(criarRespostaHttp(401));expect((await segundo).status).toBe(200);
    expect(transporte.mock.calls.filter(([caminho]) => caminho === '/api/v1/auth/refresh')).toHaveLength(2);
  });

  it.each(["renovar", 'retry'])("limpa a memória e redireciona quando %s falha, sem repetição infinita", async (falha) => {
    const redirecionar = vi.fn();
    const transporte = vi.fn<typeof window.fetch>().mockResolvedValue(criarRespostaHttp(401)).mockResolvedValueOnce(criarRespostaHttp()).mockResolvedValueOnce(criarRespostaHttp(401))
      .mockResolvedValueOnce(criarRespostaHttp(falha === "renovar" ? 401 : 200, 'access-2')).mockResolvedValueOnce(criarRespostaHttp(401));
    const cliente = new ClienteAutenticacao(transporte, redirecionar);await cliente.restaurarSessao();
    expect((await cliente.enviarRequisicaoAutenticada('/api/v1/auth/me')).status).toBe(401);
    expect(cliente.obterEstadoDaAutenticacao()).toEqual({ situacao: 'naoAutenticado', identidade: null });
    expect(redirecionar).toHaveBeenCalledTimes(1);
    expect(transporte).toHaveBeenCalledTimes(falha === "renovar" ? 3 : 4);
    await cliente.enviarRequisicaoAutenticada('/api/v1/auth/me');
    expect(new Headers(transporte.mock.calls.at(-1)![1]?.headers).has('Authorization')).toBe(false);
  });

  it.each(["entrar", "renovar", "sair", 'onboarding'])("não renova após falha na requisição pública %s", async (rota) => {
    const transporte = vi.fn<typeof window.fetch>().mockResolvedValue(criarRespostaHttp(401));
    const cliente = new ClienteAutenticacao(transporte);
    await cliente.enviarRequisicaoAutenticada(rota === 'onboarding' ? '/api/v1/onboarding' : `/api/v1/auth/${rota}`, { method: 'POST' });
    expect(transporte).toHaveBeenCalledTimes(1);
    expect(new Headers(transporte.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
  });

  it("rejeita caminhos externos e escapados antes de enviar credenciais", async () => {
    const transporte = vi.fn<typeof window.fetch>();const cliente = new ClienteAutenticacao(transporte);
    for (const caminho of ['https://evil.test/api/me', '//evil.test/api', '/api/../../other', '/api/\\evil']) await expect(cliente.enviarRequisicaoAutenticada(caminho)).rejects.toThrow();
    expect(transporte).not.toHaveBeenCalled();
  });

  it("encerra a sessão pela API, limpa a memória e protege a navegação Voltar", async () => {
    const transporte = vi.fn<typeof window.fetch>().mockResolvedValueOnce(criarRespostaHttp()).mockResolvedValueOnce(criarRespostaHttp(204)).mockResolvedValueOnce(criarRespostaHttp(401));
    const cliente = new ClienteAutenticacao(transporte, () => navegar('/login'));
    window.history.replaceState({}, '', '/app');
    render(<Aplicacao cliente={cliente} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    await screen.findByRole('heading', { name: 'Entre no seu escritório' });
    await waitFor(() => expect(transporte).toHaveBeenCalledWith('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }));
    expect(cliente.obterEstadoDaAutenticacao()).toEqual({ situacao: 'naoAutenticado', identidade: null });
    await act(async () => { window.history.pushState({}, '', '/app'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.queryByText('Olá, Ana')).toBeNull();expect(window.location.pathname).toBe('/login');
    await cliente.enviarRequisicaoAutenticada('/api/v1/auth/me');
    expect(new Headers(transporte.mock.calls.at(-1)![1]?.headers).has('Authorization')).toBe(false);
  });

  it("aguarda rotação pendente ao sair e ignora sua resposta tardia", async () => {
    const pendente = criarPromessaControlada<Response>();
    const transporte = vi.fn<typeof window.fetch>().mockReturnValueOnce(pendente.promise).mockResolvedValueOnce(criarRespostaHttp(204));
    const cliente = new ClienteAutenticacao(transporte);
    const renovar = cliente.renovarSessao(), sair = cliente.encerrarSessao();
    expect(cliente.encerrarSessao()).toBe(sair);
    expect(transporte).toHaveBeenCalledTimes(1);
    pendente.resolver(criarRespostaHttp());
    expect(await renovar).toBe(false);await sair;
    expect(transporte.mock.calls[1][0]).toBe('/api/v1/auth/logout');
    expect(cliente.obterEstadoDaAutenticacao().situacao).toBe('naoAutenticado');
  });

  it("remove identidade e DOM protegido antes do cache de navegação", async () => {
    const transporte = vi.fn<typeof window.fetch>().mockResolvedValueOnce(criarRespostaHttp());
    const cliente = new ClienteAutenticacao(transporte);
    window.history.replaceState({}, '', '/app');
    render(<Aplicacao cliente={cliente} />);
    await screen.findByText('Olá, Ana');
    act(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); });
    expect(screen.queryByText('Olá, Ana')).toBeNull();
    expect(screen.getByText('Restaurando sessão…')).toBeTruthy();
    expect(cliente.obterEstadoDaAutenticacao()).toEqual({ situacao: 'carregando', identidade: null });
  });

  it("informa falha ao sair no servidor e mantém as credenciais locais apagadas", async () => {
    const transporte = vi.fn<typeof window.fetch>().mockResolvedValueOnce(criarRespostaHttp()).mockResolvedValueOnce(criarRespostaHttp(500));
    const cliente = new ClienteAutenticacao(transporte, () => navegar('/login'));
    window.history.replaceState({}, '', '/app');
    render(<Aplicacao cliente={cliente} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível encerrar a sessão no servidor');
    expect(screen.queryByText('Olá, Ana')).toBeNull();
    expect(cliente.obterEstadoDaAutenticacao().identidade).toBeNull();
  });
});

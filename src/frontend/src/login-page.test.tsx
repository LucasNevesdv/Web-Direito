// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Aplicacao } from './app';
import { ClienteAutenticacao } from './auth-client';
import { ProvedorAutenticacao } from './auth-context';
let cliente: ClienteAutenticacao;
const renderizarLogin = () => render(<ProvedorAutenticacao cliente={cliente}><PaginaLogin /></ProvedorAutenticacao>);
import { PaginaLogin } from './login-page';

const FETCH_SIMULADO = vi.fn<typeof fetch>();
const IDENTIDADE = { usuario: { id: 'user-id', nome: 'Maria Silva', email: 'maria@example.test' }, escritorio: { id: 'office-id', nome: 'Escritório Exemplo', papel: 'PROPRIETARIO' } };
const criarRespostaHttp = (situacao: number, corpo: unknown = {}) => new Response(JSON.stringify(corpo), { status: situacao, headers: { 'Content-Type': 'application/json' } });
function preencherCredenciais() {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: '  MARIA@EXAMPLE.TEST  ' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'isolated test password' } });
}
beforeEach(async () => {
  FETCH_SIMULADO.mockReset();vi.stubGlobal('fetch', FETCH_SIMULADO);
  window.history.replaceState({}, '', '/login');localStorage.clear();sessionStorage.clear();
  cliente = new ClienteAutenticacao(FETCH_SIMULADO);
  FETCH_SIMULADO.mockResolvedValueOnce(criarRespostaHttp(401));await cliente.restaurarSessao();FETCH_SIMULADO.mockReset();
});
afterEach(() => { cleanup();vi.restoreAllMocks();vi.unstubAllGlobals(); });

describe("página de login", () => {
  it('atualiza a confirmação quando a query muda depois do redirecionamento ao login', async () => {
    renderizarLogin();
    window.history.replaceState({}, '', '/login?senha=alterada');
    fireEvent.popState(window);
    expect(await screen.findByText('Senha alterada. Entre novamente com sua nova senha.')).toBeTruthy();
  });
  it("exibe /login e um link funcional para cadastro", () => {
    render(<Aplicacao cliente={cliente} />);
    expect(screen.getByRole('heading', { name: 'Entre no seu escritório' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar escritório' }).getAttribute('href')).toBe('/register');
  });
  it("valida campos sem requisição e foca o primeiro campo inválido", async () => {
    renderizarLogin();await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByLabelText('E-mail'));
    expect(FETCH_SIMULADO).not.toHaveBeenCalled();
  });
  it("envia somente e-mail normalizado e senha e consulta /me com token em memória", async () => {
    const armazenamento = vi.spyOn(Storage.prototype, 'setItem');
    FETCH_SIMULADO.mockResolvedValueOnce(criarRespostaHttp(200, { tokenAcesso: 'unit-test-access-token' })).mockResolvedValueOnce(criarRespostaHttp(200, IDENTIDADE));
    renderizarLogin();preencherCredenciais();await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByRole('heading', { name: 'Sessão autenticada' });
    expect(FETCH_SIMULADO).toHaveBeenNthCalledWith(1, '/api/v1/auth/login', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'maria@example.test', senha: 'isolated test password' }),
    });
    expect(FETCH_SIMULADO).toHaveBeenNthCalledWith(2, '/api/v1/auth/me', { credentials: 'include', headers: { Authorization: 'Bearer unit-test-access-token' } });
    expect(screen.getByText('Olá, Maria Silva')).toBeTruthy();
    expect(screen.getByText('Escritório Exemplo')).toBeTruthy();expect(screen.getByText('PROPRIETARIO')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy();
    expect(document.body.textContent).not.toContain('unit-test-access-token');
    expect(armazenamento).not.toHaveBeenCalled();expect(localStorage.length + sessionStorage.length).toBe(0);
    cleanup();renderizarLogin();
    expect(screen.getByRole('heading', { name: 'Sessão autenticada' })).toBeTruthy();
    expect(FETCH_SIMULADO).toHaveBeenCalledTimes(2);
  });
  it("desabilita o envio e impede requisições duplicadas", async () => {
    let resolver!: (resposta: Response) => void;
    FETCH_SIMULADO.mockReturnValueOnce(new Promise((concluir) => { resolver = concluir; }));
    renderizarLogin();preencherCredenciais();
    const botao = screen.getByRole('button', { name: 'Entrar' });
    fireEvent.submit(botao.closest('form')!);fireEvent.submit(botao.closest('form')!);
    await waitFor(() => expect(FETCH_SIMULADO).toHaveBeenCalledTimes(1));
    expect((screen.getByRole('button', { name: 'Entrando…' }) as HTMLButtonElement).disabled).toBe(true);
    resolver(criarRespostaHttp(401));await screen.findByRole('alert');
    expect((screen.getByRole('button', { name: 'Entrar' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it.each([
    [401, 'Confira suas credenciais'], [429, 'Muitas tentativas'], [409, 'seleção entre escritórios'],
    [400, 'Confira o e-mail'], [500, 'Tente novamente em instantes'],
  ])("trata HTTP %s sem refletir detalhes do servidor", async (situacao, mensagem) => {
    FETCH_SIMULADO.mockResolvedValueOnce(criarRespostaHttp(Number(situacao), { mensagem: 'private server detail' }));
    renderizarLogin();preencherCredenciais();await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    const alerta = await screen.findByRole('alert');expect(alerta.textContent).toContain(mensagem);
    expect(document.body.textContent).not.toContain('private server detail');expect(FETCH_SIMULADO).toHaveBeenCalledTimes(1);
  });
  it("não exibe conteúdo autenticado quando /me rejeita a sessão", async () => {
    FETCH_SIMULADO.mockResolvedValueOnce(criarRespostaHttp(200, { tokenAcesso: 'unit-test-access-token' })).mockResolvedValueOnce(criarRespostaHttp(401));
    renderizarLogin();preencherCredenciais();await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByRole('alert');expect(screen.queryByRole('heading', { name: 'Sessão autenticada' })).toBeNull();
  });
  it("trata falha de rede sem expor o erro", async () => {
    FETCH_SIMULADO.mockRejectedValueOnce(new Error('private network detail'));
    renderizarLogin();preencherCredenciais();await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByRole('alert');expect(document.body.textContent).not.toContain('private network detail');
  });
  it("permite preencher credenciais e enviar pelo teclado", async () => {
    FETCH_SIMULADO.mockResolvedValueOnce(criarRespostaHttp(401));renderizarLogin();
    const usuario = userEvent.setup();
    screen.getByLabelText('E-mail').focus();await usuario.keyboard('maria@example.test');await usuario.tab();
    await usuario.keyboard('isolated test password');await usuario.keyboard('{Enter}');
    await waitFor(() => expect(FETCH_SIMULADO).toHaveBeenCalledTimes(1));await screen.findByRole('alert');
  });
});

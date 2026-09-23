// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { LoginPage } from './login-page';

const fetchMock = vi.fn<typeof fetch>();
const identity = { user: { id: 'user-id', name: 'Maria Silva', email: 'maria@example.test' }, office: { id: 'office-id', name: 'Escritório Exemplo', role: 'OWNER' } };
const result = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function fill() {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: '  MARIA@EXAMPLE.TEST  ' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'isolated test password' } });
}
beforeEach(() => {
  fetchMock.mockReset();vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState({}, '', '/login');localStorage.clear();sessionStorage.clear();
});
afterEach(() => { cleanup();vi.restoreAllMocks();vi.unstubAllGlobals(); });

describe('login page', () => {
  it('renders /login and a real registration link', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Entre no seu escritório' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Criar escritório' }).getAttribute('href')).toBe('/register');
  });
  it('validates fields without a request and focuses the first invalid field', async () => {
    render(<LoginPage />);await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByLabelText('E-mail'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sends only normalized email and password, then calls me with an in-memory token', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    fetchMock.mockResolvedValueOnce(result(200, { accessToken: 'unit-test-access-token' })).mockResolvedValueOnce(result(200, identity));
    render(<LoginPage />);fill();await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByRole('heading', { name: 'Sessão autenticada' });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/v1/auth/login', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'maria@example.test', password: 'isolated test password' }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/v1/auth/me', { credentials: 'include', headers: { Authorization: 'Bearer unit-test-access-token' } });
    expect(screen.getByText('Olá, Maria Silva')).toBeTruthy();
    expect(screen.getByText('Escritório Exemplo')).toBeTruthy();expect(screen.getByText('OWNER')).toBeTruthy();
    expect(screen.getByText(/logout será implementado posteriormente/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('unit-test-access-token');
    expect(storage).not.toHaveBeenCalled();expect(localStorage.length + sessionStorage.length).toBe(0);
    cleanup();render(<LoginPage />);
    expect(screen.getByRole('heading', { name: 'Entre no seu escritório' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('disables submission and prevents duplicate requests', async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    render(<LoginPage />);fill();
    const button = screen.getByRole('button', { name: 'Entrar' });
    fireEvent.submit(button.closest('form')!);fireEvent.submit(button.closest('form')!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Entrando…' }) as HTMLButtonElement).disabled).toBe(true);
    resolve(result(401));await screen.findByRole('alert');
    expect((screen.getByRole('button', { name: 'Entrar' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it.each([
    [401, 'Confira suas credenciais'], [429, 'Muitas tentativas'], [409, 'seleção entre escritórios'],
    [400, 'Confira o e-mail'], [500, 'Tente novamente em instantes'],
  ])('handles HTTP %s without reflecting server details', async (status, message) => {
    fetchMock.mockResolvedValueOnce(result(Number(status), { message: 'private server detail' }));
    render(<LoginPage />);fill();await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    const alert = await screen.findByRole('alert');expect(alert.textContent).toContain(message);
    expect(document.body.textContent).not.toContain('private server detail');expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not show authenticated content when me rejects the session', async () => {
    fetchMock.mockResolvedValueOnce(result(200, { accessToken: 'unit-test-access-token' })).mockResolvedValueOnce(result(401));
    render(<LoginPage />);fill();await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByRole('alert');expect(screen.queryByRole('heading', { name: 'Sessão autenticada' })).toBeNull();
  });
  it('handles network failure without leaking the error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('private network detail'));
    render(<LoginPage />);fill();await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByRole('alert');expect(document.body.textContent).not.toContain('private network detail');
  });
  it('supports entering credentials and submitting with the keyboard', async () => {
    fetchMock.mockResolvedValueOnce(result(401));render(<LoginPage />);
    const user = userEvent.setup();
    screen.getByLabelText('E-mail').focus();await user.keyboard('maria@example.test');await user.tab();
    await user.keyboard('isolated test password');await user.keyboard('{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));await screen.findByRole('alert');
  });
});

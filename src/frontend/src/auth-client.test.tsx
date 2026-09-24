// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthClient } from './auth-client';
import { navigate } from './routing';
import { App } from './app';

const identity = { user: { id: 'u', name: 'Ana', email: 'ana@example.test' }, office: { id: 'o', name: 'Office', role: 'OWNER' } };
const result = (status = 200, token = 'access-1') => new Response(status === 204 ? null : JSON.stringify({ ...identity, accessToken: token, expiresIn: 900 }), { status });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('central authentication', () => {
  it('shows loading without protected content and restores only once under StrictMode', async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn<typeof window.fetch>().mockReturnValue(pending.promise);
    const client = new AuthClient(fetch);
    window.history.replaceState({}, '', '/app');
    render(<StrictMode><App client={client} /></StrictMode>);
    expect(screen.getByText('Restaurando sessão…')).toBeTruthy();
    expect(screen.queryByText('Olá, Ana')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve(result()); });
    expect(await screen.findByText('Olá, Ana')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
  });

  it('restores on a fresh client after reload without persistent token storage', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const fetch = vi.fn<typeof window.fetch>().mockImplementation(async () => result());
    await new AuthClient(fetch).restore();
    const reloaded = new AuthClient(fetch);
    expect(reloaded.getSnapshot().status).toBe('loading');
    expect(await reloaded.restore()).toBe(true);
    expect(reloaded.getSnapshot().identity).toEqual(identity);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(storage).not.toHaveBeenCalled();
    expect(JSON.stringify(reloaded.getSnapshot())).not.toContain('access-1');
  });

  it.each([401, 500])('failed restoration (%s) shows login once without protected content', async (status) => {
    const fetch = vi.fn<typeof window.fetch>().mockResolvedValue(result(status));
    window.history.replaceState({}, '', '/app');
    render(<App client={new AuthClient(fetch)} />);
    expect(await screen.findByRole('heading', { name: 'Entre no seu escritório' })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(screen.queryByText('Olá, Ana')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('handles network errors and invalid identities without restoring credentials', async () => {
    for (const transport of [vi.fn().mockRejectedValue(new Error('private')), vi.fn().mockResolvedValue(new Response('{}'))]) {
      const client = new AuthClient(transport);
      expect(await client.restore()).toBe(false);
      expect(client.getSnapshot()).toEqual({ status: 'unauthenticated', identity: null });
    }
  });

  it('shares exactly the same refresh Promise', async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn<typeof window.fetch>().mockReturnValue(pending.promise);
    const client = new AuthClient(fetch);
    const first = client.refresh(), second = client.refresh();
    expect(first).toBe(second); expect(fetch).toHaveBeenCalledTimes(1);
    pending.resolve(result());expect(await first).toBe(true);
  });

  it('shares one rotation for concurrent 401s, sends Bearer and replays each request once', async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn<typeof window.fetch>().mockResolvedValueOnce(result()).mockResolvedValueOnce(result(401)).mockResolvedValueOnce(result(401))
      .mockReturnValueOnce(pending.promise).mockResolvedValueOnce(result()).mockResolvedValueOnce(result());
    const client = new AuthClient(fetch);await client.restore();
    const first = client.request('/api/v1/auth/me'), second = client.request('/api/v1/auth/me');
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    pending.resolve(result(200, 'access-2'));
    expect((await Promise.all([first, second])).map((r) => r.status)).toEqual([200, 200]);
    expect(fetch.mock.calls.filter(([path]) => path === '/api/v1/auth/refresh')).toHaveLength(2);
    expect(new Headers(fetch.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer access-1');
    expect(new Headers(fetch.mock.calls[4][1]?.headers).get('Authorization')).toBe('Bearer access-2');
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it('does not rotate again for a late 401 referring to the previous token', async () => {
    const late = deferred<Response>();
    const fetch = vi.fn<typeof window.fetch>().mockResolvedValue(result(401)).mockResolvedValueOnce(result()).mockResolvedValueOnce(result(401))
      .mockReturnValueOnce(late.promise).mockResolvedValueOnce(result(200, 'access-1')).mockResolvedValueOnce(result()).mockResolvedValueOnce(result());
    const client = new AuthClient(fetch);await client.restore();
    const first = client.request('/api/v1/auth/me'), second = client.request('/api/v1/auth/me');
    expect((await first).status).toBe(200);
    late.resolve(result(401));expect((await second).status).toBe(200);
    expect(fetch.mock.calls.filter(([path]) => path === '/api/v1/auth/refresh')).toHaveLength(2);
  });

  it.each(['refresh', 'retry'])('clears memory and redirects when %s fails; never loops', async (failure) => {
    const redirect = vi.fn();
    const fetch = vi.fn<typeof window.fetch>().mockResolvedValue(result(401)).mockResolvedValueOnce(result()).mockResolvedValueOnce(result(401))
      .mockResolvedValueOnce(result(failure === 'refresh' ? 401 : 200, 'access-2')).mockResolvedValueOnce(result(401));
    const client = new AuthClient(fetch, redirect);await client.restore();
    expect((await client.request('/api/v1/auth/me')).status).toBe(401);
    expect(client.getSnapshot()).toEqual({ status: 'unauthenticated', identity: null });
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(failure === 'refresh' ? 3 : 4);
    await client.request('/api/v1/auth/me');
    expect(new Headers(fetch.mock.calls.at(-1)![1]?.headers).has('Authorization')).toBe(false);
  });

  it.each(['login', 'refresh', 'logout', 'onboarding'])('never refreshes a failed public %s request', async (route) => {
    const fetch = vi.fn<typeof window.fetch>().mockResolvedValue(result(401));
    const client = new AuthClient(fetch);
    await client.request(route === 'onboarding' ? '/api/v1/onboarding' : `/api/v1/auth/${route}`, { method: 'POST' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new Headers(fetch.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
  });

  it('rejects external and escaped paths before sending credentials', async () => {
    const fetch = vi.fn<typeof window.fetch>();const client = new AuthClient(fetch);
    for (const path of ['https://evil.test/api/me', '//evil.test/api', '/api/../../other', '/api/\\evil']) await expect(client.request(path)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('logout calls the endpoint, clears memory and prevents protected content on Back', async () => {
    const fetch = vi.fn<typeof window.fetch>().mockResolvedValueOnce(result()).mockResolvedValueOnce(result(204)).mockResolvedValueOnce(result(401));
    const client = new AuthClient(fetch, () => navigate('/login'));
    window.history.replaceState({}, '', '/app');
    render(<App client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    await screen.findByRole('heading', { name: 'Entre no seu escritório' });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }));
    expect(client.getSnapshot()).toEqual({ status: 'unauthenticated', identity: null });
    await act(async () => { window.history.pushState({}, '', '/app'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.queryByText('Olá, Ana')).toBeNull();expect(window.location.pathname).toBe('/login');
    await client.request('/api/v1/auth/me');
    expect(new Headers(fetch.mock.calls.at(-1)![1]?.headers).has('Authorization')).toBe(false);
  });

  it('logout waits for in-flight rotation and cannot be undone by its late response', async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn<typeof window.fetch>().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(result(204));
    const client = new AuthClient(fetch);
    const refresh = client.refresh(), logout = client.logout();
    expect(client.logout()).toBe(logout);
    expect(fetch).toHaveBeenCalledTimes(1);
    pending.resolve(result());
    expect(await refresh).toBe(false);await logout;
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/auth/logout');
    expect(client.getSnapshot().status).toBe('unauthenticated');
  });

  it('removes identity and protected DOM before the browser caches the previous page', async () => {
    const fetch = vi.fn<typeof window.fetch>().mockResolvedValueOnce(result());
    const client = new AuthClient(fetch);
    window.history.replaceState({}, '', '/app');
    render(<App client={client} />);
    await screen.findByText('Olá, Ana');
    act(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); });
    expect(screen.queryByText('Olá, Ana')).toBeNull();
    expect(screen.getByText('Restaurando sessão…')).toBeTruthy();
    expect(client.getSnapshot()).toEqual({ status: 'loading', identity: null });
  });

  it('reports a server logout failure while keeping local credentials cleared', async () => {
    const fetch = vi.fn<typeof window.fetch>().mockResolvedValueOnce(result()).mockResolvedValueOnce(result(500));
    const client = new AuthClient(fetch, () => navigate('/login'));
    window.history.replaceState({}, '', '/app');
    render(<App client={client} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível encerrar a sessão no servidor');
    expect(screen.queryByText('Olá, Ana')).toBeNull();
    expect(client.getSnapshot().identity).toBeNull();
  });
});

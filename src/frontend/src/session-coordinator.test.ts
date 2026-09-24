// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthClient, type Identity } from './auth-client';
import { BrowserSessionCoordinator, type BrowserCoordination } from './infrastructure/browser-session-coordinator';

const identity: Identity = { user: { id: crypto.randomUUID(), name: 'Ana', email: 'ana@example.test' },
  office: { id: crypto.randomUUID(), name: 'Office', role: 'OWNER' } };
const sessionId = crypto.randomUUID();
function token(session = sessionId, current = identity, expiration = Date.now() + 900000) {
  return `e30.${btoa(JSON.stringify({ sessionId: session, sub: current.user.id, activeOfficeId: current.office.id, role: 'OWNER', exp: Math.floor(expiration / 1000) }))}.test`;
}
const response = (accessToken = token(), status = 200) => new Response(status === 204 ? null : JSON.stringify({ ...identity, accessToken, expiresIn: 900 }), { status });
const coordinators: BrowserSessionCoordinator[] = [];
afterEach(() => { coordinators.splice(0).forEach((coordinator) => coordinator.close()); vi.restoreAllMocks(); vi.useRealTimers(); });

function fixture() {
  const peers = new Set<{ receive?: (event: MessageEvent) => void }>();
  const messages: unknown[] = [];
  let queue = Promise.resolve();
  const locks = { request: vi.fn((_name, options, callback) => {
    const task = queue.then(async () => { options.signal.throwIfAborted(); return callback({}); });
    queue = task.then(() => {}, () => {});
    return task;
  }) } as unknown as Pick<LockManager, 'request'>;
  function coordinator(options: { channel?: boolean; locks?: boolean; timeoutMs?: number } = {}) {
    const peer: { receive?: (event: MessageEvent) => void } = {};
    peers.add(peer);
    const channel = {
      postMessage(message: unknown) {
        messages.push(message);
        queueMicrotask(() => peers.forEach((other) => { if (other !== peer) other.receive?.({ data: structuredClone(message) } as MessageEvent); }));
      },
      addEventListener(_type: 'message', listener: (event: MessageEvent) => void) { peer.receive = listener; },
      close() { peers.delete(peer); },
    };
    const config: BrowserCoordination = { channel: options.channel === false ? undefined : channel,
      locks: options.locks === false ? undefined : locks, exchangeMs: 5, timeoutMs: options.timeoutMs ?? 2000 };
    const result = new BrowserSessionCoordinator(config);
    coordinators.push(result);
    return result;
  }
  return { coordinator, messages, inject: (data: unknown) => peers.forEach((peer) => peer.receive?.({ data } as MessageEvent)) };
}

describe('same-origin authentication coordination', () => {
  it('restores simultaneous tabs with one refresh and shares the token, including a later tab', async () => {
    const f = fixture();
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const issued = token();
    const fetch = vi.fn<typeof window.fetch>().mockImplementation(async () => response(issued));
    const clients = [new AuthClient(fetch, undefined, f.coordinator()), new AuthClient(fetch, undefined, f.coordinator())];
    expect(await Promise.all(clients.map((client) => client.restore()))).toEqual([true, true]);
    expect(fetch).toHaveBeenCalledOnce();
    const later = new AuthClient(fetch, undefined, f.coordinator());
    expect(await later.restore()).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
    for (const client of [...clients, later]) expect(client.getSnapshot().identity).toEqual(identity);
    await later.request('/api/v1/auth/me');
    expect(new Headers(fetch.mock.calls.at(-1)![1]?.headers).get('Authorization')).toBe(`Bearer ${issued}`);
    expect(storage).not.toHaveBeenCalled();
    expect(localStorage.length + sessionStorage.length).toBe(0);
    const encoded = JSON.stringify(f.messages);
    expect(encoded).not.toMatch(/password|refreshToken|cookie|passwordHash/);
    expect(f.messages).toEqual(expect.arrayContaining([expect.objectContaining({ version: 1, type: 'request', tabId: expect.any(String), id: expect.any(String), timestamp: expect.any(Number) }),
      expect.objectContaining({ type: 'response', correlationId: expect.any(String), sessionId })]));
  });

  it('coordinates simultaneous 401s and retries both requests with a single rotated token', async () => {
    const f = fixture();
    let rotations = 0, expired = 2;
    const fetch = vi.fn<typeof window.fetch>().mockImplementation(async (path) => {
      if (path === '/api/v1/auth/refresh') { ++rotations; return response(); }
      return response(undefined, expired-- > 0 ? 401 : 200);
    });
    const clients = [new AuthClient(fetch, undefined, f.coordinator()), new AuthClient(fetch, undefined, f.coordinator())];
    await Promise.all(clients.map((client) => client.restore()));
    const responses = await Promise.all(clients.map((client) => client.request('/api/v1/auth/me')));
    expect(responses.map((result) => result.status)).toEqual([200, 200]);
    expect(rotations).toBe(2); // One initial restoration and one shared renewal, even for identical JWT strings.
    expect(fetch.mock.calls.filter(([path]) => path === '/api/v1/auth/me')).toHaveLength(4);
  });

  it('broadcasts logout immediately, clearing all identities before the server responds', async () => {
    const f = fixture();
    let finish!: (result: Response) => void;
    const fetch = vi.fn<typeof window.fetch>().mockImplementation(async (path) => path === '/api/v1/auth/logout'
      ? new Promise<Response>((resolve) => { finish = resolve; }) : response());
    const redirect = vi.fn();
    const clients = [new AuthClient(fetch, undefined, f.coordinator()), new AuthClient(fetch, redirect, f.coordinator())];
    await Promise.all(clients.map((client) => client.restore()));
    const logout = clients[0].logout();
    await vi.waitFor(() => expect(clients[1].getSnapshot().status).toBe('unauthenticated'));
    expect(redirect).toHaveBeenCalledOnce();
    finish(response(undefined, 204)); await logout;
    expect(clients.every((client) => client.getSnapshot().identity === null)).toBe(true);
  });

  it('propagates definitive refresh failure without letting the waiting tab refresh again', async () => {
    const f = fixture();
    const fetch = vi.fn<typeof window.fetch>().mockImplementation(async () => response());
    const clients = [new AuthClient(fetch, undefined, f.coordinator()), new AuthClient(fetch, undefined, f.coordinator())];
    await Promise.all(clients.map((client) => client.restore()));
    fetch.mockImplementation(async () => response(undefined, 401));
    expect(await Promise.all(clients.map((client) => client.refresh()))).toEqual([false, false]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(clients.every((client) => client.getSnapshot().identity === null)).toBe(true);
  });

  it('ignores stale, uncorrelated, malformed and other-session messages', async () => {
    const f = fixture(), coordinator = f.coordinator();
    coordinator.publish(token(), identity, 'login');
    const initial = coordinator.getState()!;
    const message = { version: 1, tabId: crypto.randomUUID(), id: crypto.randomUUID(), type: 'state', timestamp: Date.now(), correlationId: null,
      sessionId, state: { ...initial, id: crypto.randomUUID(), timestamp: initial.timestamp - 1 } };
    f.inject(message);
    f.inject({ ...message, id: crypto.randomUUID(), state: { ...message.state, timestamp: Date.now() + 1, sessionId: crypto.randomUUID() } });
    f.inject({ ...message, id: crypto.randomUUID(), type: 'response', correlationId: crypto.randomUUID() });
    f.inject({ ...message, id: crypto.randomUUID(), timestamp: Date.now() - 30000 });
    f.inject({ ...message, id: crypto.randomUUID(), state: { ...initial, timestamp: Date.now() + 1, credentials: { accessToken: 'malformed', identity } } });
    expect(coordinator.getState()).toEqual(initial);
  });

  it('accepts an explicit new login but ignores late renewal from the previous session', async () => {
    const f = fixture(), first = f.coordinator(), second = f.coordinator();
    first.publish(token(), identity, 'login'); await second.synchronize();
    const newIdentity: Identity = { ...identity, user: { ...identity.user, id: crypto.randomUUID(), name: 'Other' } };
    const nextSession = crypto.randomUUID();
    second.publish(token(nextSession, newIdentity), newIdentity, 'login'); await first.synchronize();
    expect(first.getState()?.credentials?.identity).toEqual(newIdentity);
    const state = first.getState()!;
    f.inject({ version: 1, tabId: crypto.randomUUID(), id: crypto.randomUUID(), type: 'state', timestamp: Date.now(), correlationId: null,
      sessionId, state: { ...state, id: crypto.randomUUID(), timestamp: state.timestamp + 1, sessionId, reason: 'refresh', credentials: { accessToken: token(), identity } } });
    expect(first.getState()?.sessionId).toBe(nextSession);
  });

  it('makes revocation terminal even when refresh and logout messages arrive out of order', async () => {
    const f = fixture(), coordinator = f.coordinator();
    coordinator.publish(token(), identity, 'login');
    const current = coordinator.getState()!;
    const envelope = { version: 1, tabId: crypto.randomUUID(), id: crypto.randomUUID(), type: 'state',
      timestamp: Date.now(), correlationId: null, sessionId };
    f.inject({ ...envelope, state: { ...current, id: crypto.randomUUID(), timestamp: current.timestamp - 1, reason: 'logout', credentials: null } });
    expect(coordinator.getState()?.credentials).toBeNull();
    f.inject({ ...envelope, id: crypto.randomUUID(), state: { ...current, id: crypto.randomUUID(), timestamp: current.timestamp + 1, reason: 'refresh' } });
    expect(coordinator.getState()?.credentials).toBeNull();
  });

  it('rejects an in-flight identity response when another tab changes the user', async () => {
    const f = fixture(), one = f.coordinator(), two = f.coordinator();
    let finish!: (response: Response) => void;
    const fetch = vi.fn<typeof window.fetch>().mockImplementationOnce(async () => response())
      .mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const client = new AuthClient(fetch, undefined, one);
    await client.restore(); await two.synchronize();
    const pending = client.request('/api/v1/auth/me');
    const nextIdentity: Identity = { ...identity, user: { ...identity.user, id: crypto.randomUUID(), name: 'Other' } };
    two.publish(token(crypto.randomUUID(), nextIdentity), nextIdentity, 'login');
    await one.synchronize();
    finish(response());
    await expect(pending).rejects.toThrow('Sessão alterada');
    expect(client.getSnapshot().identity).toEqual(nextIdentity);
  });

  it('logout during another tab refresh cannot restore either identity from the late response', async () => {
    const f = fixture();
    let finish!: (response: Response) => void;
    const fetch = vi.fn<typeof window.fetch>().mockImplementation(async () => response());
    const clients = [new AuthClient(fetch, undefined, f.coordinator()), new AuthClient(fetch, undefined, f.coordinator())];
    await Promise.all(clients.map((client) => client.restore()));
    fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }))
      .mockImplementation(async () => response(undefined, 204));
    const refresh = clients[0].refresh();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    const logout = clients[1].logout();
    await vi.waitFor(() => expect(clients[0].getSnapshot().status).toBe('unauthenticated'));
    finish(response());
    expect(await refresh).toBe(false); await logout;
    expect(clients.every((client) => client.getSnapshot().identity === null)).toBe(true);
    expect(fetch.mock.calls.filter(([path]) => path === '/api/v1/auth/logout')).toHaveLength(1);
  });

  it('closing a tab aborts its refresh and releases coordination for another tab', async () => {
    const f = fixture(), first = f.coordinator();
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const fetch = vi.fn<typeof window.fetch>().mockImplementationOnce((_path, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }); started();
    })).mockImplementation(async () => response());
    const one = new AuthClient(fetch, undefined, first), two = new AuthClient(fetch, undefined, f.coordinator());
    const pending = one.restore(); await startedPromise;
    const waiting = two.restore(); first.close();
    expect(await pending).toBe(false); expect(await waiting).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('bounds pending coordination and aborts a stalled operation', async () => {
    const f = fixture(), coordinator = f.coordinator({ timeoutMs: 20 });
    await expect(coordinator.exclusive((signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    }))).rejects.toThrow('Aborted');
    expect(await coordinator.exclusive(async () => true)).toBe(true);
  });

  it.each([{ channel: false, locks: false }, { channel: true, locks: false }])('does not rotate automatically without locks (%j)', async (options) => {
    const f = fixture(), fetch = vi.fn<typeof window.fetch>();
    const client = new AuthClient(fetch, undefined, f.coordinator(options));
    expect(await client.restore()).toBe(false); expect(fetch).not.toHaveBeenCalled();
    expect(client.getSnapshot().status).toBe('unauthenticated');
  });

  it('serializes safely without BroadcastChannel, with finite independent renewals', async () => {
    const f = fixture(); let active = 0, maximum = 0;
    const fetch = vi.fn<typeof window.fetch>().mockImplementation(async () => {
      maximum = Math.max(maximum, ++active); await new Promise((resolve) => setTimeout(resolve, 5)); --active; return response();
    });
    const clients = [new AuthClient(fetch, undefined, f.coordinator({ channel: false })), new AuthClient(fetch, undefined, f.coordinator({ channel: false }))];
    expect(await Promise.all(clients.map((client) => client.restore()))).toEqual([true, true]);
    expect(maximum).toBe(1); expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('renews an expiring shared session once and propagates the result', async () => {
    vi.useFakeTimers();
    const f = fixture(), one = f.coordinator(), two = f.coordinator();
    const fetch = vi.fn<typeof window.fetch>().mockImplementation(async () => response());
    const clients = [new AuthClient(fetch, undefined, one), new AuthClient(fetch, undefined, two)];
    one.publish(token(sessionId, identity, Date.now() + 3000), identity, 'login');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3100);
    expect(fetch).toHaveBeenCalledOnce();
    expect(clients.every((client) => client.getSnapshot().status === 'authenticated')).toBe(true);
    expect(two.getState()?.id).toBe(one.getState()?.id);
  });
});

import type { SessionCoordinator } from './session-coordinator';

export interface Identity {
  user: { id: string; name: string; email: string };
  office: { id: string; name: string; role: 'OWNER' };
}
export type AuthState = { status: 'loading' | 'authenticated' | 'unauthenticated'; identity: Identity | null };

export class LoginError extends Error {
  constructor(readonly status: number) { super('Não foi possível entrar.'); }
}

function identity(value: unknown): Identity {
  const data = value as Identity | undefined;
  if (!data || !data.user || !data.office ||
    ![data.user.id, data.user.name, data.user.email, data.office.id, data.office.name].every((field) => typeof field === 'string' && field.length > 0) ||
    data.office.role !== 'OWNER') throw new Error('Identidade indisponível.');
  return { user: { id: data.user.id, name: data.user.name, email: data.user.email },
    office: { id: data.office.id, name: data.office.name, role: data.office.role } };
}

export class AuthClient {
  private token: string | null = null;
  private state: AuthState = { status: 'loading', identity: null };
  private listeners = new Set<() => void>();
  private refreshPromise: Promise<boolean> | undefined;
  private restorePromise: Promise<boolean> | undefined;
  private logoutPromise: Promise<void> | undefined;
  private generation = 0;
  private tokenVersion = 0;
  private sessionId: string | null = null;

  constructor(private readonly transport: typeof fetch = (...args) => fetch(...args),
    private readonly redirect: () => void = () => {}, private readonly coordinator?: SessionCoordinator) {
    coordinator?.subscribe((state) => {
      if (!state.credentials) {
        ++this.generation;
        this.clear();
        this.redirect();
      } else {
        if (this.logoutPromise) return;
        if (this.sessionId && state.sessionId !== this.sessionId) ++this.generation;
        this.sessionId = state.sessionId;
        this.token = state.credentials.accessToken;
        ++this.tokenVersion;
        this.setState('authenticated', state.credentials.identity);
      }
    });
    coordinator?.onExpiration(() => { void this.refresh().then((success) => { if (!success) this.redirect(); }); });
  }

  private exclusive<T>(task: (signal?: AbortSignal) => Promise<T>) {
    return this.coordinator ? this.coordinator.exclusive(task) : task();
  }

  readonly getSnapshot = (): AuthState => this.state;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private setState(status: AuthState['status'], current: Identity | null = null) {
    this.state = { status, identity: current };
    this.listeners.forEach((listener) => listener());
  }

  private clear() { this.token = null; this.setState('unauthenticated'); }

  prepareForNavigation(): void {
    ++this.generation;
    this.token = null;
    this.restorePromise = undefined;
    this.coordinator?.close();
    this.setState('loading');
  }

  restore(): Promise<boolean> {
    this.restorePromise ??= this.refresh(true);
    return this.restorePromise;
  }

  refresh(restoring = false): Promise<boolean> {
    if (this.logoutPromise) return Promise.resolve(false);
    if (this.refreshPromise) return this.refreshPromise;
    const generation = this.generation;
    const version = this.tokenVersion;
    this.refreshPromise = this.exclusive(async (signal) => {
        if (this.coordinator) await this.coordinator.synchronize();
        const shared = this.coordinator?.getState();
        if (shared?.credentials && shared.credentials.expiresAt > Date.now() && (restoring || version !== this.tokenVersion)) return true;
        if (generation !== this.generation || (shared && !shared.credentials)) { if (!this.token) this.clear(); return false; }
        if (this.coordinator && !this.coordinator.canRefresh) { this.clear(); return false; }
        const response = await this.transport('/api/v1/auth/refresh', { method: 'POST', credentials: 'include', ...(signal ? { signal } : {}) });
        if (response.status !== 200) {
          if (response.status === 401 && generation === this.generation) this.coordinator?.invalidate('invalid');
          throw new Error('Sessão indisponível.');
        }
        const result = await response.json();
        const current = identity(result);
        if (typeof result.accessToken !== 'string' || !result.accessToken || result.expiresIn <= 0 || typeof result.expiresIn !== 'number') throw new Error('Sessão indisponível.');
        if (generation !== this.generation) return false;
        this.coordinator?.publish(result.accessToken, current, 'refresh');
        this.sessionId = this.coordinator?.getState()?.sessionId ?? null;
        this.token = result.accessToken;
        ++this.tokenVersion;
        this.setState('authenticated', current);
        return true;
      }).catch(() => {
        if (generation === this.generation) this.clear();
        return false;
      }).finally(() => { this.refreshPromise = undefined; });
    return this.refreshPromise;
  }

  async login(email: string, password: string): Promise<void> {
    await this.logoutPromise;
    await this.refreshPromise;
    return this.exclusive(async (signal) => {
    await this.coordinator?.synchronize();
    if (this.coordinator?.getState()?.credentials) {
      this.coordinator.invalidate('logout');
      this.clear();
      const revoked = await this.transport('/api/v1/auth/logout', { method: 'POST', credentials: 'include', signal });
      if (revoked.status !== 204) throw new LoginError(500);
    }
    const generation = ++this.generation;
    this.clear();
    try {
      const response = await this.transport('/api/v1/auth/login', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }), signal,
      });
      if (response.status !== 200) throw new LoginError(response.status);
      const result = await response.json();
      if (typeof result.accessToken !== 'string' || !result.accessToken) throw new LoginError(500);
      const me = await this.transport('/api/v1/auth/me', {
        credentials: 'include', headers: { Authorization: `Bearer ${result.accessToken}` }, signal,
      });
      if (me.status !== 200) throw new LoginError(500);
      const current = identity(await me.json());
      if (generation !== this.generation) throw new LoginError(500);
      this.coordinator?.publish(result.accessToken, current, 'login');
      this.sessionId = this.coordinator?.getState()?.sessionId ?? null;
      this.token = result.accessToken;
      ++this.tokenVersion;
      this.setState('authenticated', current);
    } catch (error) {
      if (generation === this.generation) this.clear();
      throw error instanceof LoginError ? error : new LoginError(500);
    }
    });
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    // Constrain credential-bearing requests to this application's API.
    if (!path.startsWith('/api/') || path.includes('\\') || path.includes('#')) throw new Error('Caminho não permitido.');
    const pathname = new URL(path, 'https://local.invalid').pathname;
    if (!pathname.startsWith('/api/')) throw new Error('Caminho não permitido.');
    const excluded = ['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout', '/api/v1/onboarding'];
    if (excluded.includes(pathname)) return this.transport(path, { ...init, credentials: 'include' });
    const send = () => {
      const headers = new Headers(init.headers);
      if (this.token) headers.set('Authorization', `Bearer ${this.token}`);
      else headers.delete('Authorization');
      return this.transport(path, { ...init, headers, credentials: 'include' });
    };
    const sentToken = this.token;
    const sentVersion = this.tokenVersion;
    const generation = this.generation;
    const response = await send();
    if (generation !== this.generation) throw new Error('Sessão alterada durante a requisição.');
    if (response.status !== 401 || !sentToken || generation !== this.generation) return response;
    // A late 401 may refer to a token another request has already renewed.
    if (this.tokenVersion === sentVersion && !(await this.refresh())) {
      this.redirect();
      return response;
    }
    if (!this.token || generation !== this.generation) return response;
    const retried = await send();
    if (generation !== this.generation) throw new Error('Sessão alterada durante a requisição.');
    if (retried.status === 401 && generation === this.generation) { this.coordinator?.invalidate('invalid'); this.clear(); this.redirect(); }
    return retried;
  }

  logout(): Promise<void> {
    if (this.logoutPromise) return this.logoutPromise;
    ++this.generation;
    this.coordinator?.invalidate('logout');
    this.clear();
    this.redirect();
    // Let an already-sent refresh finish setting its cookie before revoking it.
    this.logoutPromise = (async () => {
      await this.refreshPromise;
      try {
        const response = await this.exclusive(async (signal) => {
          if (this.coordinator) await this.coordinator.synchronize();
          const result = await this.transport('/api/v1/auth/logout', { method: 'POST', credentials: 'include', signal });
          if (result.status === 204) { this.coordinator?.invalidate('logout'); this.clear(); }
          return result;
        });
        if (response.status !== 204) throw new Error('Não foi possível encerrar a sessão no servidor. Tente novamente.');
      } finally { this.logoutPromise = undefined; }
    })();
    return this.logoutPromise;
  }
}


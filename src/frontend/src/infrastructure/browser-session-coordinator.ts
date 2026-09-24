import type { Identity } from '../auth-client';
import type { SessionCoordinator, SharedSession } from '../session-coordinator';

const channelName = 'web-direito:authentication:v1';
const lockName = 'web-direito:authentication-mutation:v1';
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
interface Channel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  close(): void;
}
export interface BrowserCoordination {
  channel?: Channel;
  locks?: Pick<LockManager, 'request'>;
  exchangeMs?: number;
  timeoutMs?: number;
}
interface Envelope {
  version: 1; tabId: string; id: string; type: 'request' | 'response' | 'state';
  timestamp: number; correlationId: string | null; sessionId: string | null; state: SharedSession | null;
}

function credentials(token: string, value: Identity) {
  if (typeof token !== 'string' || token.length > 4096 || token.split('.').length !== 3) throw new Error('Invalid shared session');
  // Metadata is only for coordination. The API still verifies the JWT on every request.
  const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  if (!uuid.test(payload.sessionId) || payload.sub !== value.user?.id || payload.activeOfficeId !== value.office?.id ||
    payload.role !== 'OWNER' || value.office.role !== 'OWNER' || !uuid.test(value.user.id) || !uuid.test(value.office.id) ||
    ![value.user.name, value.user.email, value.office.name].every((field) => typeof field === 'string' && field.length > 0 && field.length <= 254) ||
    !Number.isFinite(payload.exp) || payload.exp * 1000 > Date.now() + 902000 || payload.exp * 1000 <= Date.now()) throw new Error('Invalid shared session');
  const identity: Identity = { user: { id: value.user.id, name: value.user.name, email: value.user.email },
    office: { id: value.office.id, name: value.office.name, role: 'OWNER' } };
  return { sessionId: payload.sessionId as string, credentials: { accessToken: token, identity, expiresAt: payload.exp * 1000 } };
}

export class BrowserSessionCoordinator implements SessionCoordinator {
  private readonly tabId = crypto.randomUUID();
  private state: SharedSession | null = null;
  private closed = false;
  private readonly listeners = new Set<(state: SharedSession) => void>();
  private readonly pending = new Map<string, () => void>();
  private readonly seen = new Set<string>();
  private readonly controllers = new Set<AbortController>();
  private expiration?: ReturnType<typeof setTimeout>;
  private expirationListener?: () => void;
  readonly canRefresh: boolean;

  constructor(private readonly browser: BrowserCoordination) {
    this.canRefresh = !!browser.locks;
    browser.channel?.addEventListener('message', (event) => this.receive(event.data));
  }

  getState() { return this.state; }
  subscribe(listener: (state: SharedSession) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  onExpiration(listener: () => void) { this.expirationListener = listener; }

  private scheduleExpiration() {
    clearTimeout(this.expiration);
    if (this.state?.credentials && !this.closed) {
      this.expiration = setTimeout(() => this.expirationListener?.(), Math.max(0, this.state.credentials.expiresAt - Date.now()));
    }
  }

  private send(type: Envelope['type'], correlationId: string | null = null) {
    if (this.closed) return;
    const state = type === 'request' ? null : this.state;
    const message: Envelope = { version: 1, tabId: this.tabId, id: crypto.randomUUID(), type,
      timestamp: Date.now(), correlationId, sessionId: state?.sessionId ?? null, state };
    this.browser.channel?.postMessage(message);
    return message.id;
  }

  private receive(value: unknown) {
    if (this.closed) return;
    try {
      const message = value as Envelope;
      if (!message || message.version !== 1 || !uuid.test(message.tabId) || !uuid.test(message.id) || message.tabId === this.tabId ||
        !Number.isFinite(message.timestamp) || Math.abs(Date.now() - message.timestamp) > 15000 || this.seen.has(message.id)) return;
      this.seen.add(message.id);
      if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
      if (message.type === 'request') { if (this.state) this.send('response', message.id); return; }
      if (message.type !== 'state' && message.type !== 'response') return;
      if (message.type === 'response' && (!message.correlationId || !this.pending.has(message.correlationId))) return;
      const state = message.state;
      if (!state || !uuid.test(state.id) || !Number.isFinite(state.timestamp) || state.timestamp > Date.now() + 2000 ||
        state.sessionId !== message.sessionId || (state.sessionId !== null && !uuid.test(state.sessionId)) ||
        !['login', 'refresh', 'logout', 'invalid'].includes(state.reason)) return;
      if (this.state?.sessionId && this.state.sessionId !== state.sessionId && state.reason !== 'login') return;
      // Revocation is terminal for a session, even if an in-flight refresh broadcasts later.
      const invalidatesCurrent = this.state?.credentials && state.sessionId === this.state.sessionId &&
        !state.credentials && (state.reason === 'logout' || state.reason === 'invalid');
      if (!invalidatesCurrent && this.state && (state.timestamp < this.state.timestamp || (state.timestamp === this.state.timestamp && state.id <= this.state.id))) return;
      if (this.state && !this.state.credentials && state.reason === 'refresh') return;
      let safe: SharedSession;
      if (state.credentials) {
        if (state.reason !== 'login' && state.reason !== 'refresh') return;
        const parsed = credentials(state.credentials.accessToken, state.credentials.identity);
        if (parsed.sessionId !== state.sessionId) return;
        safe = { id: state.id, timestamp: state.timestamp, reason: state.reason, ...parsed };
      } else {
        if (state.reason !== 'logout' && state.reason !== 'invalid') return;
        safe = { id: state.id, timestamp: state.timestamp, sessionId: state.sessionId, reason: state.reason, credentials: null };
      }
      this.state = safe;
      this.scheduleExpiration();
      this.listeners.forEach((listener) => listener(safe));
    } catch { /* Malformed messages never affect the current identity. */ }
  }

  async synchronize(): Promise<void> {
    if (this.closed) throw new Error('Coordination closed');
    if (!this.browser.channel) return;
    // Replies are collected for a bounded interval, including multiple peers.
    await new Promise<void>((resolve) => {
      const id = this.send('request')!;
      const timer = setTimeout(() => { this.pending.delete(id); resolve(); }, this.browser.exchangeMs ?? 250);
      this.pending.set(id, () => { clearTimeout(timer); resolve(); });
    });
  }

  async exclusive<T>(task: (signal?: AbortSignal) => Promise<T>): Promise<T> {
    if (this.closed) throw new Error('Coordination closed');
    const controller = new AbortController();
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), this.browser.timeoutMs ?? 20000);
    const run = () => {
      controller.signal.throwIfAborted();
      return task(controller.signal);
    };
    try {
      return this.browser.locks
        ? await this.browser.locks.request(lockName, { mode: 'exclusive', signal: controller.signal }, run)
        : await run();
    } finally { clearTimeout(timer); this.controllers.delete(controller); }
  }

  publish(token: string, identity: Identity, reason: 'login' | 'refresh') {
    if (this.closed) return;
    const parsed = credentials(token, identity);
    this.state = { id: crypto.randomUUID(), timestamp: Math.max(Date.now(), (this.state?.timestamp ?? 0) + 1), reason, ...parsed };
    this.scheduleExpiration();
    this.send('state');
  }

  invalidate(reason: 'logout' | 'invalid') {
    if (this.closed) return;
    this.state = { id: crypto.randomUUID(), timestamp: Math.max(Date.now(), (this.state?.timestamp ?? 0) + 1),
      sessionId: this.state?.sessionId ?? null, reason, credentials: null };
    clearTimeout(this.expiration);
    this.send('state');
  }

  close() {
    this.closed = true;
    clearTimeout(this.expiration);
    this.controllers.forEach((controller) => controller.abort());
    this.pending.forEach((finish) => finish());
    this.pending.clear();
    this.listeners.clear();
    this.browser.channel?.close();
    this.state = null;
  }
}

export function createBrowserSessionCoordinator(): SessionCoordinator {
  let channel: Channel | undefined;
  try { if (typeof BroadcastChannel !== 'undefined') channel = new BroadcastChannel(channelName); } catch { /* Safe degraded mode. */ }
  return new BrowserSessionCoordinator({ channel, locks: typeof navigator !== 'undefined' ? navigator.locks : undefined });
}

import type { Identity } from './auth-client';

export interface SharedSession {
  id: string;
  timestamp: number;
  sessionId: string | null;
  reason: 'login' | 'refresh' | 'logout' | 'invalid';
  credentials: { accessToken: string; identity: Identity; expiresAt: number } | null;
}

// Application code depends on this contract, never on browser coordination APIs.
export interface SessionCoordinator {
  readonly canRefresh: boolean;
  getState(): SharedSession | null;
  synchronize(): Promise<void>;
  exclusive<T>(task: (signal?: AbortSignal) => Promise<T>): Promise<T>;
  publish(accessToken: string, identity: Identity, reason: 'login' | 'refresh'): void;
  invalidate(reason: 'logout' | 'invalid'): void;
  subscribe(listener: (state: SharedSession) => void): () => void;
  onExpiration(listener: () => void): void;
  close(): void;
}

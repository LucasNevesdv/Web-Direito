import { AuthClient } from './auth-client';
import { createBrowserSessionCoordinator } from './infrastructure/browser-session-coordinator';
import { navigate } from './routing';

const transport: typeof fetch = (path, init) => fetch(path, {
  ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
});
export const authClient = new AuthClient(transport, () => navigate('/login'), createBrowserSessionCoordinator());

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import type { DatabaseHealthChecker } from '../src/database-health-checker.js';

const apps: ReturnType<typeof buildApp>[] = [];

function createApp(checker: DatabaseHealthChecker) {
  const app = buildApp(checker);
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('GET /health', () => {
  it('returns ok without invoking an unavailable database checker', async () => {
    const check = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const app = createApp({ check });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(check).not.toHaveBeenCalled();
  });
});

describe('GET /ready', () => {
  it('returns ready after the checker succeeds', async () => {
    const check = vi.fn().mockResolvedValue(undefined);
    const readyApp = createApp({ check });

    const response = await readyApp.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
    expect(check).toHaveBeenCalledOnce();
  });

  it('returns a sanitized failure while health remains available', async () => {
    const check = vi.fn().mockRejectedValue(
      new Error('database unavailable: postgresql://user:secret@internal/db'),
    );
    const readyApp = createApp({ check });

    const response = await readyApp.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready' });
    expect(response.body).not.toContain('database unavailable');
    expect(response.body).not.toContain('secret');
    expect(check).toHaveBeenCalledOnce();

    const health = await readyApp.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
    expect(check).toHaveBeenCalledOnce();
  });
});

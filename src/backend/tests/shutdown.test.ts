import { describe, expect, it, vi } from 'vitest';
import { createShutdown } from '../src/shutdown.js';

describe('shutdown', () => {
  it('shares one promise and runs cleanup once, including concurrent calls', async () => {
    let finishClose!: () => void;
    const closeWait = new Promise<void>((resolve) => {
      finishClose = resolve;
    });
    const close = vi.fn(() => closeWait);
    const disconnect = vi.fn(async () => {});
    const shutdown = createShutdown({ close }, { $disconnect: disconnect });

    const first = shutdown();
    const second = shutdown();
    expect(second).toBe(first);
    await Promise.resolve();
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();

    finishClose();
    await Promise.all([first, second]);

    expect(shutdown()).toBe(first);
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('attempts disconnection when closing the app fails and preserves the shared rejection', async () => {
    const closeError = new Error('Closing failed');
    const close = vi.fn(async () => {
      throw closeError;
    });
    const disconnect = vi.fn(async () => {});
    const shutdown = createShutdown({ close }, { $disconnect: disconnect });

    const first = shutdown();
    expect(shutdown()).toBe(first);
    await expect(first).rejects.toBe(closeError);

    expect(shutdown()).toBe(first);
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('propagates a disconnection failure after closing the app', async () => {
    const disconnectError = new Error('Disconnection failed');
    const close = vi.fn(async () => {});
    const disconnect = vi.fn(async () => {
      throw disconnectError;
    });
    const shutdown = createShutdown({ close }, { $disconnect: disconnect });

    await expect(shutdown()).rejects.toBe(disconnectError);
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('reports both failures after attempting both cleanup operations', async () => {
    const closeError = new Error('Closing failed');
    const disconnectError = new Error('Disconnection failed');
    const close = vi.fn(async () => {
      throw closeError;
    });
    const disconnect = vi.fn(async () => {
      throw disconnectError;
    });
    const shutdown = createShutdown({ close }, { $disconnect: disconnect });

    await expect(shutdown()).rejects.toMatchObject({
      name: 'AggregateError',
      message: 'Resource cleanup failed',
      errors: [closeError, disconnectError],
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

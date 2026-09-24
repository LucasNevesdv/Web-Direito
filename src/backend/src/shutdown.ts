export function createShutdown(
  app: { close(): Promise<unknown> },
  database: { $disconnect(): Promise<void> },
  background?: { stop(): Promise<void> },
): () => Promise<void> {
  let shutdownPromise: Promise<void> | undefined;

  return () => {
    shutdownPromise ??= Promise.resolve().then(async () => {
      const errors: unknown[] = [];

      if (background) {
        try { await background.stop(); } catch (error) { errors.push(error); }
      }

      try {
        await app.close();
      } catch (error) {
        errors.push(error);
      }

      try {
        await database.$disconnect();
      } catch (error) {
        errors.push(error);
      }

      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, 'Resource cleanup failed');
      }
    });

    return shutdownPromise;
  };
}

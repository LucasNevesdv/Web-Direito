export function criarEncerramento(
  aplicacao: { close(): Promise<unknown> },
  bancoDados: { $disconnect(): Promise<void> },
  tarefasSegundoPlano?: { parar(): Promise<void> },
): () => Promise<void> {
  let promessaEncerramento: Promise<void> | undefined;

  return () => {
    promessaEncerramento ??= Promise.resolve().then(async () => {
      const erros: unknown[] = [];

      if (tarefasSegundoPlano) {
        try { await tarefasSegundoPlano.parar(); } catch (erro) { erros.push(erro); }
      }

      try {
        await aplicacao.close();
      } catch (erro) {
        erros.push(erro);
      }

      try {
        await bancoDados.$disconnect();
      } catch (erro) {
        erros.push(erro);
      }

      if (erros.length === 1) {
        throw erros[0];
      }
      if (erros.length > 1) {
        throw new AggregateError(erros, 'Resource cleanup failed');
      }
    });

    return promessaEncerramento;
  };
}

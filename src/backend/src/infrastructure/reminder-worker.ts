import type { LembretesDePrazos } from '../application/tasks/reminders.js';

export interface PoliticaProcessamentoLembretes { intervaloGeracaoMs: number; intervaloEnvioMs: number; reservaSegundos: number; prazoEncerramentoMs: number }
type EventoLembretes = 'iniciado' | 'lembretes_gerados' | 'emails_enviados' | 'falha_processamento' | 'encerrado' | 'encerramento_limitado';

// Executa geração e envio em ciclos sem sobreposição; o estado durável fica no PostgreSQL.
export class ProcessamentoLembretes {
  private temporizadores: Array<ReturnType<typeof setInterval>> = [];
  private geracaoPendente: Promise<void> | undefined;
  private envioPendente: Promise<void> | undefined;
  private encerramento: Promise<void> | undefined;
  private readonly cancelamento = new AbortController();

  constructor(private readonly lembretes: Pick<LembretesDePrazos, 'gerar' | 'enviarPendentes'>, private readonly politica: PoliticaProcessamentoLembretes,
    private readonly registrarEvento: (evento: EventoLembretes, quantidade?: number) => void) {}

  iniciar(): void {
    if (this.temporizadores.length || this.encerramento) return;
    this.registrarEvento('iniciado');
    void this.gerar();
    this.temporizadores = [setInterval(() => { void this.gerar(); }, this.politica.intervaloGeracaoMs),
      setInterval(() => { void this.enviar(); }, this.politica.intervaloEnvioMs)];
    for (const temporizador of this.temporizadores) temporizador.unref();
  }

  gerar(): Promise<void> {
    if (this.encerramento) return Promise.resolve();
    this.geracaoPendente ??= this.lembretes.gerar().then((quantidade) => { if (quantidade) this.registrarEvento('lembretes_gerados', quantidade); })
      .catch(() => this.registrarEvento('falha_processamento')).finally(() => { this.geracaoPendente = undefined; });
    return this.geracaoPendente;
  }

  enviar(): Promise<void> {
    if (this.encerramento) return Promise.resolve();
    this.envioPendente ??= this.lembretes.enviarPendentes(this.politica.reservaSegundos, this.cancelamento.signal)
      .then((quantidade) => { if (quantidade) this.registrarEvento('emails_enviados', quantidade); })
      .catch(() => this.registrarEvento('falha_processamento')).finally(() => { this.envioPendente = undefined; });
    return this.envioPendente;
  }

  parar(): Promise<void> {
    if (this.encerramento) return this.encerramento;
    this.temporizadores.forEach(clearInterval);
    this.encerramento = (async () => {
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const terminou = await Promise.race([
        Promise.all([this.geracaoPendente, this.envioPendente]).then(() => true),
        new Promise<boolean>((resolver) => { temporizador = setTimeout(() => resolver(false), this.politica.prazoEncerramentoMs); }),
      ]);
      clearTimeout(temporizador);
      // Reservas interrompidas expiram e são retomadas por outra instância.
      if (!terminou) this.cancelamento.abort();
      this.registrarEvento(terminou ? 'encerrado' : 'encerramento_limitado');
    })();
    return this.encerramento;
  }
}

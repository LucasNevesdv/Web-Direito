import type { RepositorioSenhas } from '../../application/passwords/password-contracts.js';
import type { RepositorioTrabalhosRecuperacao } from '../../application/passwords/recovery-email-jobs.js';
import type { EnvioRecuperacaoDeSenha } from '../../application/passwords/deliver-password-recovery.js';

export interface PoliticaProcessamentoRecuperacao {
  intervaloMs: number; reservaSegundos: number; prazoEncerramentoMs: number; retencaoDias: number;
}
export class ProcessamentoRecuperacaoDeSenha {
  private temporizador: ReturnType<typeof setInterval> | undefined;
  private temporizadorLimpeza: ReturnType<typeof setInterval> | undefined;
  private tarefaPendente: Promise<void> | undefined;
  private limpezaPendente: Promise<void> | undefined;
  private encerramento: Promise<void> | undefined;
  private estaEncerrando = false;
  private readonly cancelamento = new AbortController();

  constructor(private readonly trabalhos: RepositorioTrabalhosRecuperacao, private readonly envio: Pick<EnvioRecuperacaoDeSenha, 'enviarRecuperacao'>,
    private readonly recuperacoes: Pick<RepositorioSenhas, 'removerRecuperacoesExpiradas'>,
    private readonly politica: PoliticaProcessamentoRecuperacao,
    private readonly registrarEvento: (evento: 'iniciado' | 'ciclo_concluido' | 'falha_processamento' | 'limpeza_concluida' | 'encerrado' | 'encerramento_limitado') => void) {}

  iniciarProcessamento(intervaloLimpezaMs = 60000): void {
    if (this.temporizador || this.estaEncerrando) return;
    this.registrarEvento('iniciado');
    this.temporizador = setInterval(() => { void this.processarDisponivel(); }, this.politica.intervaloMs);
    this.temporizador.unref();
    this.temporizadorLimpeza = setInterval(() => {
      if (this.limpezaPendente || this.estaEncerrando) return;
      this.limpezaPendente = (async () => {
        await this.trabalhos.removerTrabalhosAntigos(this.politica.retencaoDias);
        await this.recuperacoes.removerRecuperacoesExpiradas();
        this.registrarEvento('limpeza_concluida');
      })().catch(() => this.registrarEvento('falha_processamento')).finally(() => { this.limpezaPendente = undefined; });
    }, intervaloLimpezaMs);
    this.temporizadorLimpeza.unref();
  }

  processarDisponivel(): Promise<void> {
    if (this.estaEncerrando) return Promise.resolve();
    if (this.tarefaPendente) return this.tarefaPendente;
    const inicio = performance.now();
    this.tarefaPendente = (async () => {
      const reserva = await this.trabalhos.reservarTrabalho(this.politica.reservaSegundos);
      if (!reserva || this.estaEncerrando) return; // Lease devolve trabalho se shutdown ocorrer durante reserva.
      const restante = this.politica.reservaSegundos * 1000 - (performance.now() - inicio) - 5000;
      if (restante <= 0) return;
      // Cancela a operação antes da reserva expirar; SMTP fecha o socket e HTTP usa AbortSignal.
      const sinal = AbortSignal.any([this.cancelamento.signal, AbortSignal.timeout(Math.floor(restante))]);
      await this.envio.enviarRecuperacao(reserva, sinal);
      this.registrarEvento('ciclo_concluido');
    })().catch(() => this.registrarEvento('falha_processamento')).finally(() => { this.tarefaPendente = undefined; });
    return this.tarefaPendente;
  }

  parar(): Promise<void> {
    if (this.encerramento) return this.encerramento;
    this.estaEncerrando = true;
    clearInterval(this.temporizador); clearInterval(this.temporizadorLimpeza);
    this.encerramento = (async () => {
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      const terminou = await Promise.race([
        Promise.all([this.tarefaPendente, this.limpezaPendente]).then(() => true),
        new Promise<boolean>((resolver) => { temporizador = setTimeout(() => resolver(false), this.politica.prazoEncerramentoMs); }),
      ]);
      clearTimeout(temporizador);
      if (!terminou) this.cancelamento.abort();
      this.registrarEvento(terminou ? 'encerrado' : 'encerramento_limitado');
    })();
    return this.encerramento;
  }
}

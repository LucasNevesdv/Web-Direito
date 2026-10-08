export interface RecursosVerificacao {
  bloqueios?: Pick<LockManager, 'request'>;
  canal?: Pick<BroadcastChannel, 'postMessage' | 'addEventListener' | 'close'>;
}
// O lock de liderança é distinto daquele que serializa login/refresh/logout.
export class VerificacaoPeriodicaSessao {
  private encerrada = false;
  private lider = false;
  private pendente = false;
  private ultimaVerificacao = 0;
  private temporizador?: ReturnType<typeof setInterval>;
  private liberarLideranca?: () => void;
  private candidatura?: AbortController;
  private focoPendente = false;
  private readonly idDaAba = crypto.randomUUID();
  private requisicoesDeFoco = new Set<string>();
  private temporizadorDeDebounce?: ReturnType<typeof setTimeout>;
  constructor(private readonly verificar: () => Promise<void>, private readonly recursos: RecursosVerificacao, readonly intervalo = 30000) {
    if (!Number.isFinite(intervalo) || intervalo < 10000 || intervalo > 300000) throw new Error('Intervalo inválido.');
    recursos.canal?.addEventListener('message', evento => {
      if (evento.data?.tipo === 'verificar' && this.lider) void this.executar();
      else if (evento.data?.tipo === 'verificar' && !this.recursos.bloqueios) this.agruparRequisicaoDeFoco(evento.data.id);
      else if (evento.data?.tipo === 'resultado' && Number.isFinite(evento.data.instante)) {
        this.ultimaVerificacao = Math.max(this.ultimaVerificacao, evento.data.instante);
      }
    });
  }
  private agruparRequisicaoDeFoco(id: unknown) {
    if (typeof id !== 'string' || id.length > 80) return;
    this.requisicoesDeFoco.add(id);
    if (this.temporizadorDeDebounce) return;
    this.temporizadorDeDebounce = setTimeout(() => {
      this.temporizadorDeDebounce = undefined;
      const deveVerificar = [...this.requisicoesDeFoco].sort()[0] === this.idDaAba;
      this.requisicoesDeFoco.clear();
      if (!deveVerificar || Date.now() - this.ultimaVerificacao < this.intervalo) return;
      void this.executar().then(() => this.recursos.canal?.postMessage({ tipo: 'resultado', instante: this.ultimaVerificacao }));
    }, 80);
  }
  private async executar() {
    if (this.encerrada || this.pendente || Date.now() - this.ultimaVerificacao < 1000) return;
    this.pendente = true; this.ultimaVerificacao = Date.now();
    try { await this.verificar(); } catch { /* Falha transitória não confirma revogação. */ }
    finally { this.pendente = false; }
  }
  definirVisibilidade(visivel: boolean) {
    if (!visivel) { this.candidatura?.abort(); this.candidatura = undefined; this.liberarLideranca?.(); return; }
    if (this.encerrada || this.candidatura) return;
    // O Web Lock coordena uma única aba mesmo quando o canal não está disponível.
    if (!this.recursos.bloqueios) return;
    const candidatura = new AbortController(); this.candidatura = candidatura;
    void this.recursos.bloqueios.request('web-direito:session-polling:v1', { signal: candidatura.signal }, async () => {
      if (this.encerrada || candidatura.signal.aborted) return;
      this.lider = true;
      if (this.focoPendente) { this.focoPendente = false; void this.executar(); }
      this.temporizador = setInterval(() => { void this.executar(); }, this.intervalo);
      try { await new Promise<void>(resolver => { this.liberarLideranca = resolver; candidatura.signal.addEventListener('abort', () => resolver(), { once: true }); }); }
      finally { this.lider = false; clearInterval(this.temporizador); this.liberarLideranca = undefined; }
    }).catch(() => { /* Candidatura cancelada ao ocultar/fechar a aba. */ });
  }
  recuperarFoco() {
    if (this.encerrada) return;
    this.focoPendente = true;
    this.definirVisibilidade(true);
    if (!this.recursos.bloqueios && this.recursos.canal) {
      if (Date.now() - this.ultimaVerificacao >= this.intervalo) {
        this.agruparRequisicaoDeFoco(this.idDaAba);
        this.recursos.canal.postMessage({ tipo: 'verificar', id: this.idDaAba });
      }
    } else if (!this.recursos.bloqueios) {
      if (Date.now() - this.ultimaVerificacao >= this.intervalo) void this.executar();
    } else if (this.lider) void this.executar();
    else if (this.recursos.canal) {
      this.recursos.canal.postMessage({ tipo: 'verificar' });
      queueMicrotask(() => { if (this.lider) void this.executar(); });
    }
  }
  encerrar() {
    this.encerrada = true; this.candidatura?.abort(); this.liberarLideranca?.();
    clearInterval(this.temporizador); clearTimeout(this.temporizadorDeDebounce); this.recursos.canal?.close();
  }
}
export function iniciarVerificacaoPeriodica(verificar: () => Promise<void>) {
  let canal: BroadcastChannel | undefined;
  try { if (typeof BroadcastChannel !== 'undefined') canal = new BroadcastChannel('web-direito:session-polling:v1'); } catch { /* Fallback por foco. */ }
  const intervalo = Number(import.meta.env.VITE_SESSION_CHECK_INTERVAL_MS ?? 30000);
  const verificacao = new VerificacaoPeriodicaSessao(verificar, { canal, bloqueios: navigator.locks }, intervalo);
  const foco = () => verificacao.recuperarFoco();
  const visibilidade = () => { verificacao.definirVisibilidade(document.visibilityState !== 'hidden'); if (document.visibilityState !== 'hidden') foco(); };
  verificacao.definirVisibilidade(document.visibilityState !== 'hidden');
  window.addEventListener('focus', foco); document.addEventListener('visibilitychange', visibilidade);
  return () => { verificacao.encerrar(); window.removeEventListener('focus', foco); document.removeEventListener('visibilitychange', visibilidade); };
}

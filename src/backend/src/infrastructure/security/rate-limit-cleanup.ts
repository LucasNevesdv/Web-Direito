import type { ArmazenamentoLimiteRequisicoes } from '../../application/security/rate-limiter.js';

export function iniciarLimpezaLimites(armazenamento: Pick<ArmazenamentoLimiteRequisicoes, 'removerLimitesExpirados'>, intervaloMs: number,
  aoFalharLimpeza: () => void = () => console.error('Rate limit cleanup failed.')) {
  let promessaDeLimpeza: Promise<void> | undefined;
  let estaLimpezaEncerrada = false;
  const temporizador = setInterval(() => {
    if (estaLimpezaEncerrada || promessaDeLimpeza) return;
    promessaDeLimpeza = armazenamento.removerLimitesExpirados().then(() => {}, () => aoFalharLimpeza()).finally(() => { promessaDeLimpeza = undefined; });
  }, intervaloMs);
  temporizador.unref();
  return { async parar(): Promise<void> { estaLimpezaEncerrada = true; clearInterval(temporizador); await promessaDeLimpeza; } };
}

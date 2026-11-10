export type Visao = 'DIA' | 'SEMANA' | 'MES';
export function somarDias(data: string, dias: number): string {
  const valor = new Date(`${data}T12:00:00Z`); valor.setUTCDate(valor.getUTCDate() + dias); return valor.toISOString().slice(0, 10);
}
export function dataHoraNoFuso(instante: string, fuso: string): string {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instante));
  const obter = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return `${obter('year')}-${obter('month')}-${obter('day')}T${obter('hour')}:${obter('minute')}`;
}
// Converte a hora civil do escritório, sem depender do fuso configurado no computador.
export function instanteNoFuso(local: string, fuso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error('Informe data e horário válidos.');
  const esperado = Date.parse(`${local}:00Z`);
  let instante = esperado;
  for (let i = 0; i < 4; i++) {
    const civil = dataHoraNoFuso(new Date(instante).toISOString(), fuso);
    if (civil === local) return new Date(instante).toISOString();
    instante += esperado - Date.parse(`${civil}:00Z`);
  }
  throw new Error('Este horário não existe no fuso do escritório. Escolha outro horário.');
}
export function diasDaVisao(data: string, visao: Visao): string[] {
  let inicio = visao === 'MES' ? `${data.slice(0, 7)}-01` : data;
  if (visao !== 'DIA') inicio = somarDias(inicio, -((new Date(`${inicio}T12:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: visao === 'DIA' ? 1 : visao === 'SEMANA' ? 7 : 42 }, (_, i) => somarDias(inicio, i));
}
export function moverPeriodo(data: string, visao: Visao, direcao: number) {
  if (visao !== 'MES') return somarDias(data, direcao * (visao === 'DIA' ? 1 : 7));
  const mes = new Date(`${data.slice(0, 7)}-01T12:00:00Z`); mes.setUTCMonth(mes.getUTCMonth() + direcao); return mes.toISOString().slice(0, 10);
}
export function eventoNoDia(inicio: string, fim: string, dia: string, fuso: string) {
  return inicio < instanteNoFuso(`${somarDias(dia, 1)}T00:00`, fuso) && fim > instanteNoFuso(`${dia}T00:00`, fuso);
}

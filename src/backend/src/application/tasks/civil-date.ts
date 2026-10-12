const PADRAO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

// Datas de prazo são datas civis (sem horário), informadas e confirmadas pelo advogado.
export function dataCivilValida(valor: string): boolean {
  const partes = PADRAO_DATA.exec(valor);
  if (!partes) return false;
  const data = new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
  return data.toISOString().slice(0, 10) === valor;
}

export function hojeNoFuso(fusoHorario: string, agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fusoHorario, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

export function somarDias(data: string, dias: number): string {
  const base = new Date(`${data}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

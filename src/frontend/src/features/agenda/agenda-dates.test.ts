import { describe, expect, it } from 'vitest';
import { dataHoraNoFuso, diasDaVisao, eventoNoDia, instanteNoFuso, moverPeriodo } from './agenda-dates';

describe('calendário no fuso do escritório', () => {
  it('preserva o horário em São Paulo independentemente do fuso do navegador', () => {
    expect(instanteNoFuso('2030-01-15T09:30', 'America/Sao_Paulo')).toBe('2030-01-15T12:30:00.000Z');
    expect(dataHoraNoFuso('2030-01-15T12:30:00Z', 'America/Sao_Paulo')).toBe('2030-01-15T09:30');
  });
  it('rejeita uma hora civil inexistente na mudança de horário de verão', () => {
    expect(() => instanteNoFuso('2026-03-08T02:30', 'America/New_York')).toThrow('não existe');
  });
  it('gera dia, semana com segunda-feira e mês com todos os dias', () => {
    expect(diasDaVisao('2030-01-15', 'DIA')).toEqual(['2030-01-15']);
    expect(diasDaVisao('2030-01-15', 'SEMANA')).toHaveLength(7);
    expect(diasDaVisao('2030-01-15', 'SEMANA')[0]).toBe('2030-01-14');
    const mes = diasDaVisao('2030-01-31', 'MES');
    expect(mes).toHaveLength(42); expect(mes).toContain('2030-01-01'); expect(mes).toContain('2030-01-31');
    expect(moverPeriodo('2030-01-31', 'MES', 1)).toBe('2030-02-01');
  });
  it('mantém eventos que atravessam a meia-noite e exclui o limite final', () => {
    expect(eventoNoDia('2030-01-31T23:00:00.000Z', '2030-02-01T05:00:00.000Z', '2030-02-01', 'America/Sao_Paulo')).toBe(true);
    expect(eventoNoDia('2030-01-31T23:00:00.000Z', '2030-02-01T03:00:00.000Z', '2030-02-01', 'America/Sao_Paulo')).toBe(false);
  });
});

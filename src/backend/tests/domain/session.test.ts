import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ErroSessaoInvalida, Sessao } from '../../src/domain/sessions/session.js';

const criarSessaoDeTeste = () => Sessao.criar({ idUsuario: randomUUID(), idEscritorioAtivo: randomUUID(), hashTokenRenovacao: 'a'.repeat(64), agora: new Date(1000), expiraEm: new Date(10000) });

describe("Sessao", () => {
  it("define UUID e datas, protege o estado e não serializa o hash implicitamente", () => {
    const sessao = criarSessaoDeTeste();
    expect(sessao.id).toMatch(/^[a-f\d-]{36}$/);
    const estado = sessao.obterEstadoAtualDaSessao();
    estado.expiraEm.setTime(0);
    expect(sessao.expiraEm.getTime()).toBe(10000);
    expect(JSON.stringify(sessao)).toBe('{}');
    expect(sessao.estaAtiva(new Date(9999))).toBe(true);
    expect(sessao.estaAtiva(new Date(10000))).toBe(false);
  });
  it.each([
    ['id', 'invalid'], ['idUsuario', 'invalid'], ['idEscritorioAtivo', 'invalid'],
    ['hashTokenRenovacao', 'raw-refresh-token'], ['criadoEm', new Date('invalid')],
    ['expiraEm', new Date(1000)], ['atualizadoEm', new Date(0)],
    ['revogadaEm', new Date(0)], ['ultimoUsoEm', new Date(0)],
  ])("rejeita %s inválido", (campo, valor) => {
    expect(() => Sessao.restaurar({ ...criarSessaoDeTeste().obterEstadoAtualDaSessao(), [campo]: valor })).toThrow(ErroSessaoInvalida);
  });
});

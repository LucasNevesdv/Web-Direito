import { describe, expect, it } from 'vitest';
import { ErroVinculoInvalido } from '../../src/domain/memberships/invalid-membership-error.js';
import { VinculoEscritorio } from '../../src/domain/memberships/membership.js';

const ENTRADA_VALIDA = {
  idEscritorio: '68f762ad-c1cb-4a39-b8da-b0504f358cdd',
  idUsuario: '795526bb-82c2-43cd-845b-589ac594e7dd',
};
const VINCULO_PERSISTIDO = {
  ...ENTRADA_VALIDA,
  id: '2d917aee-8379-46a5-a6fd-a2f08077aa90',
  papel: 'PROPRIETARIO' as const,
  criadoEm: new Date('2026-01-01T12:00:00Z'),
};

describe("VinculoEscritorio", () => {
  it("cria vínculo PROPRIETARIO com identidade e data de criação geradas", () => {
    const antes = Date.now();
    const vinculo = VinculoEscritorio.criar(ENTRADA_VALIDA);
    expect(vinculo.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(vinculo.idEscritorio).toBe(ENTRADA_VALIDA.idEscritorio);
    expect(vinculo.idUsuario).toBe(ENTRADA_VALIDA.idUsuario);
    expect(vinculo.papel).toBe('PROPRIETARIO');
    expect(vinculo.criadoEm.getTime()).toBeGreaterThanOrEqual(antes);
    expect(vinculo.criadoEm.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("normaliza UUIDs fornecidos e restaura campos persistidos", () => {
    const vinculo = VinculoEscritorio.restaurar({
      ...VINCULO_PERSISTIDO,
      id: VINCULO_PERSISTIDO.id.toUpperCase(),
      idEscritorio: ENTRADA_VALIDA.idEscritorio.toUpperCase(),
      idUsuario: ENTRADA_VALIDA.idUsuario.toUpperCase(),
    });
    expect(vinculo.id).toBe(VINCULO_PERSISTIDO.id);
    expect(vinculo.idEscritorio).toBe(ENTRADA_VALIDA.idEscritorio);
    expect(vinculo.idUsuario).toBe(ENTRADA_VALIDA.idUsuario);
    expect(vinculo.criadoEm).toEqual(VINCULO_PERSISTIDO.criadoEm);
  });

  it.each([
    { campo: 'id', valor: 'invalid' },
    { campo: 'idEscritorio', valor: 'invalid' },
    { campo: 'idUsuario', valor: 'invalid' },
    { campo: 'papel', valor: 'ADMIN' },
    { campo: 'criadoEm', valor: new Date('invalid') },
    { campo: 'criadoEm', valor: '2026-01-01' },
  ] as const)("rejeita $campo persistido inválido", ({ campo, valor }) => {
    expect(() => VinculoEscritorio.restaurar({ ...VINCULO_PERSISTIDO, [campo]: valor }))
      .toThrowError(new ErroVinculoInvalido(campo));
  });

  it("mantém a data de criação imutável", () => {
    const criadoEm = new Date(VINCULO_PERSISTIDO.criadoEm);
    const vinculo = VinculoEscritorio.restaurar({ ...VINCULO_PERSISTIDO, criadoEm });
    criadoEm.setTime(0);
    vinculo.criadoEm.setTime(0);
    expect(vinculo.criadoEm).toEqual(VINCULO_PERSISTIDO.criadoEm);
  });
});

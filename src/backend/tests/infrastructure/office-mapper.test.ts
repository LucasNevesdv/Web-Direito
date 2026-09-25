import { describe, expect, it } from 'vitest';
import { Escritorio } from '../../src/domain/offices/office.js';
import { ErroEscritorioInvalido } from '../../src/domain/offices/invalid-office-error.js';
import { MAPEADOR_ESCRITORIO } from '../../src/infrastructure/prisma/office-mapper.js';

describe("mapeamento de persistência do escritório", () => {
  it("restaura escritório inativo sem regenerar identidade, estado ou datas", () => {
    const registro = {
      id: '1e5ec6ab-cb01-4a65-ae67-b9ab6dfbe9ee',
      name: 'Escritório persistido',
      status: 'INACTIVE' as const,
      createdAt: new Date('2026-01-01T10:00:00.123Z'),
      updatedAt: new Date('2026-02-01T11:00:00.456Z'),
    };

    const escritorio = MAPEADOR_ESCRITORIO.converterRegistroPrismaEmEscritorio(registro);

    expect(escritorio).toBeInstanceOf(Escritorio);
    expect(MAPEADOR_ESCRITORIO.converterEscritorioEmRegistroPrisma(escritorio)).toEqual(registro);
    registro.createdAt.setFullYear(2000);
    expect(escritorio.criadoEm.toISOString()).toBe('2026-01-01T10:00:00.123Z');
  });

  it("rejeita estado persistido corrompido pela validação do domínio", () => {
    expect(() => MAPEADOR_ESCRITORIO.converterRegistroPrismaEmEscritorio({
      id: '1e5ec6ab-cb01-4a65-ae67-b9ab6dfbe9ee',
      name: '',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    })).toThrow(ErroEscritorioInvalido);
  });
});

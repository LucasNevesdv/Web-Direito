import { describe, expect, it } from 'vitest';
import { ErroEscritorioInvalido } from '../../src/domain/offices/invalid-office-error.js';
import { Escritorio } from '../../src/domain/offices/office.js';

const ESCRITORIO_PERSISTIDO = {
  id: '02ac42eb-e434-4ffd-90eb-91ca9e2a4b16',
  nome: 'Escritório Exemplo',
  situacao: 'INATIVO' as const,
  criadoEm: new Date('2026-01-01T12:00:00.000Z'),
  atualizadoEm: new Date('2026-02-01T12:00:00.000Z'),
};

describe("Escritorio", () => {
  it("cria escritório ativo válido com UUID e datas de criação", () => {
    const antes = Date.now();
    const escritorio = Escritorio.criar({ nome: 'Escritório Exemplo' });
    const depois = Date.now();

    expect(escritorio.nome).toBe('Escritório Exemplo');
    expect(escritorio.situacao).toBe('ATIVO');
    expect(escritorio.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(escritorio.criadoEm.getTime()).toBeGreaterThanOrEqual(antes);
    expect(escritorio.criadoEm.getTime()).toBeLessThanOrEqual(depois);
    expect(escritorio.atualizadoEm).toEqual(escritorio.criadoEm);
  });

  it("normaliza espaços externos preservando o nome", () => {
    expect(Escritorio.criar({ nome: ' \t Escritório  Exemplo \n' }).nome)
      .toBe('Escritório  Exemplo');
  });

  it.each(['AB', 'a'.repeat(120), '😀'.repeat(120)])(
    "aceita nomes nos limites de caracteres",
    (nome) => {
      expect(Escritorio.criar({ nome }).nome).toBe(nome);
    },
  );

  it.each(['', '   ', '\t\n', 'A', ' 😀 ', 'a'.repeat(121), '😀'.repeat(121)])(
    "rejeita nomes vazios, curtos ou longos após normalização",
    (nome) => {
      expect(() => Escritorio.criar({ nome })).toThrowError(new ErroEscritorioInvalido('nome'));
    },
  );

  it.each([undefined, null, 123, {}])("rejeita nome que não seja texto", (nome) => {
    expect(() => Escritorio.criar({ nome: nome as string }))
      .toThrowError(new ErroEscritorioInvalido('nome'));
  });

  it("preserva UUID fornecido com caixa normalizada", () => {
    expect(Escritorio.criar({ nome: 'Exemplo', id: ESCRITORIO_PERSISTIDO.id.toUpperCase() }).id)
      .toBe(ESCRITORIO_PERSISTIDO.id);
  });

  it.each(['', 'not-a-uuid', '02ac42eb-e434-4ffd-90eb-91ca9e2a4b1z', null, 123])(
    "rejeita identificador fornecido inválido",
    (id) => {
      expect(() => Escritorio.criar({ nome: 'Exemplo', id: id as string }))
        .toThrowError(new ErroEscritorioInvalido('id'));
    },
  );

  it("restaura identidade, situação e datas persistidas", () => {
    const escritorio = Escritorio.restaurar(ESCRITORIO_PERSISTIDO);

    expect(escritorio.id).toBe(ESCRITORIO_PERSISTIDO.id);
    expect(escritorio.nome).toBe(ESCRITORIO_PERSISTIDO.nome);
    expect(escritorio.situacao).toBe('INATIVO');
    expect(escritorio.criadoEm).toEqual(ESCRITORIO_PERSISTIDO.criadoEm);
    expect(escritorio.atualizadoEm).toEqual(ESCRITORIO_PERSISTIDO.atualizadoEm);
  });

  it.each([
    { campo: 'id', valor: 'invalid' },
    { campo: 'nome', valor: ' ' },
    { campo: 'situacao', valor: 'DELETED' },
    { campo: 'criadoEm', valor: new Date('invalid') },
    { campo: 'criadoEm', valor: '2026-01-01T12:00:00.000Z' },
    { campo: 'atualizadoEm', valor: new Date('invalid') },
    { campo: 'atualizadoEm', valor: new Date('2025-01-01T00:00:00.000Z') },
  ] as const)("rejeita $campo persistido inválido", ({ campo, valor }) => {
    const estado = { ...ESCRITORIO_PERSISTIDO, [campo]: valor };
    expect(() => Escritorio.restaurar(estado)).toThrowError(new ErroEscritorioInvalido(campo));
  });

  it("preserva datas quando entradas ou datas retornadas são modificadas", () => {
    const criadoEm = new Date(ESCRITORIO_PERSISTIDO.criadoEm);
    const atualizadoEm = new Date(ESCRITORIO_PERSISTIDO.atualizadoEm);
    const escritorio = Escritorio.restaurar({ ...ESCRITORIO_PERSISTIDO, criadoEm, atualizadoEm });

    criadoEm.setTime(0);
    atualizadoEm.setTime(0);
    escritorio.criadoEm.setTime(0);
    escritorio.atualizadoEm.setTime(0);

    expect(escritorio.criadoEm).toEqual(ESCRITORIO_PERSISTIDO.criadoEm);
    expect(escritorio.atualizadoEm).toEqual(ESCRITORIO_PERSISTIDO.atualizadoEm);
  });

  it("fornece erro de domínio previsível e sanitizado", () => {
    const nomeInvalido = 'private-office-name'.repeat(10);
    let erroCapturado: unknown;
    try {
      Escritorio.criar({ nome: nomeInvalido });
    } catch (erro) {
      erroCapturado = erro;
    }

    expect(erroCapturado).toBeInstanceOf(ErroEscritorioInvalido);
    expect(erroCapturado).toMatchObject({
      codigo: 'ESCRITORIO_INVALIDO',
      campo: 'nome',
      message: 'Invalid office field: nome',
    });
    expect(String(erroCapturado)).not.toContain(nomeInvalido);
  });
});

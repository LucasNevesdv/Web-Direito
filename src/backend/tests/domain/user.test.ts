import { describe, expect, it } from 'vitest';
import { ErroUsuarioInvalido } from '../../src/domain/users/invalid-user-error.js';
import { Usuario } from '../../src/domain/users/user.js';

const ENTRADA_VALIDA = { nome: 'Ana Silva', email: 'ana@example.test', hashSenha: 'test-only-opaque-hash' };
const USUARIO_PERSISTIDO = {
  ...ENTRADA_VALIDA,
  id: '68f762ad-c1cb-4a39-b8da-b0504f358cdd',
  situacao: 'ATIVO' as const,
  criadoEm: new Date('2026-01-01T12:00:00Z'),
  atualizadoEm: new Date('2026-01-02T12:00:00Z'),
};

describe("Usuario", () => {
  it("cria usuário ativo com UUID e datas", () => {
    const antes = Date.now();
    const usuario = Usuario.criar(ENTRADA_VALIDA);
    expect(usuario.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
    expect(usuario.situacao).toBe('ATIVO');
    expect(usuario.nome).toBe(ENTRADA_VALIDA.nome);
    expect(usuario.email).toBe(ENTRADA_VALIDA.email);
    expect(usuario.hashSenha).toBe(ENTRADA_VALIDA.hashSenha);
    expect(usuario.criadoEm.getTime()).toBeGreaterThanOrEqual(antes);
    expect(usuario.criadoEm.getTime()).toBeLessThanOrEqual(Date.now());
    expect(usuario.atualizadoEm).toEqual(usuario.criadoEm);
  });

  it("remove espaços externos dos nomes e normaliza o e-mail", () => {
    const usuario = Usuario.criar({ ...ENTRADA_VALIDA, nome: '  Ana  Silva\n', email: '  ANA+LEGAL@EXAMPLE.TEST  ' });
    expect(usuario.nome).toBe('Ana  Silva');
    expect(usuario.email).toBe('ana+legal@example.test');
  });

  it.each(['AB', 'a'.repeat(120), '😀'.repeat(120)])("aceita limites do nome medidos em caracteres", (nome) => {
    expect(Usuario.criar({ ...ENTRADA_VALIDA, nome }).nome).toBe(nome);
  });

  it.each(['', '   ', 'A', 'a'.repeat(121), undefined, null, 123])("rejeita nomes inválidos", (nome) => {
    expect(() => Usuario.criar({ ...ENTRADA_VALIDA, nome: nome as string }))
      .toThrowError(new ErroUsuarioInvalido('nome'));
  });

  it.each([
    '', ' ', 'invalid', 'ana@', '@example.test', 'a@localhost', 'a b@example.test',
    'a@@example.test', '.a@example.test', 'a.@example.test', 'a..b@example.test',
    'ana@-example.test', 'ana@example-.test', 'ana@example..test', 'ana@example.1',
    `${'a'.repeat(65)}@example.test`, `ana@${'a'.repeat(64)}.test`,
    `ana@${['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(63)].join('.')}.test`,
    undefined, null, 123,
  ])("rejeita endereços de e-mail malformados", (email) => {
    expect(() => Usuario.criar({ ...ENTRADA_VALIDA, email: email as string }))
      .toThrowError(new ErroUsuarioInvalido('email'));
  });

  it.each(['', '  ', undefined, null, 123])("rejeita hash ausente ou inválido", (hashSenha) => {
    expect(() => Usuario.criar({ ...ENTRADA_VALIDA, hashSenha: hashSenha as string }))
      .toThrowError(new ErroUsuarioInvalido('hashSenha'));
  });

  it("restaura identidade e datas sem expor hash na serialização automática", () => {
    const usuario = Usuario.restaurar(USUARIO_PERSISTIDO);
    expect(usuario.id).toBe(USUARIO_PERSISTIDO.id);
    expect(usuario.criadoEm).toEqual(USUARIO_PERSISTIDO.criadoEm);
    expect(usuario.atualizadoEm).toEqual(USUARIO_PERSISTIDO.atualizadoEm);
    expect(Object.keys(usuario)).not.toContain('hashSenha');
    expect(JSON.stringify(usuario)).not.toContain(USUARIO_PERSISTIDO.hashSenha);
  });

  it.each([
    { campo: 'id', valor: 'bad-id' },
    { campo: 'situacao', valor: 'UNKNOWN' },
    { campo: 'criadoEm', valor: new Date('invalid') },
    { campo: 'criadoEm', valor: '2026-01-01' },
    { campo: 'atualizadoEm', valor: new Date('invalid') },
    { campo: 'atualizadoEm', valor: new Date('2025-01-01') },
  ] as const)("rejeita $campo inválido na restauração", ({ campo, valor }) => {
    expect(() => Usuario.restaurar({ ...USUARIO_PERSISTIDO, [campo]: valor }))
      .toThrowError(new ErroUsuarioInvalido(campo));
  });

  it("protege datas contra mutação", () => {
    const criadoEm = new Date(USUARIO_PERSISTIDO.criadoEm);
    const atualizadoEm = new Date(USUARIO_PERSISTIDO.atualizadoEm);
    const usuario = Usuario.restaurar({ ...USUARIO_PERSISTIDO, criadoEm, atualizadoEm });
    criadoEm.setTime(0);
    atualizadoEm.setTime(0);
    usuario.criadoEm.setTime(0);
    usuario.atualizadoEm.setTime(0);
    expect(usuario.criadoEm).toEqual(USUARIO_PERSISTIDO.criadoEm);
    expect(usuario.atualizadoEm).toEqual(USUARIO_PERSISTIDO.atualizadoEm);
  });

  it("retorna somente identificador do campo nos erros de entrada inválida", () => {
    const emailInvalido = 'private-invalid-value';
    expect(() => Usuario.criar({ ...ENTRADA_VALIDA, email: emailInvalido }))
      .toThrowError(new ErroUsuarioInvalido('email'));
    expect(new ErroUsuarioInvalido('email')).toMatchObject({
      codigo: 'USUARIO_INVALIDO', campo: 'email', message: 'Invalid user field: email',
    });
  });
});

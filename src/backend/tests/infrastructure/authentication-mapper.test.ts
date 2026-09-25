import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ErroUsuarioInvalido } from '../../src/domain/users/invalid-user-error.js';
import { Sessao } from '../../src/domain/sessions/session.js';
import { converterRegistroPrismaEmUsuario, converterRegistroPrismaEmSessao, converterSessaoEmRegistroPrisma } from '../../src/infrastructure/prisma/authentication-mapper.js';

describe('compatibilidade da autenticação com registros físicos existentes', () => {
  it.each([['ACTIVE', 'ATIVO'], ['INACTIVE', 'INATIVO']] as const)('converte %s para %s preservando identidade, hash e datas', (status, situacao) => {
    const registro = { id: randomUUID(), name: 'Ana Silva', email: 'ana@example.test',
      passwordHash: 'hash-opaco-existente', status, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-02-01') };
    const usuario = converterRegistroPrismaEmUsuario(registro);
    expect(usuario.id).toBe(registro.id);
    expect(usuario.nome).toBe(registro.name);
    expect(usuario.situacao).toBe(situacao);
    expect(usuario.hashSenha).toBe(registro.passwordHash);
    expect(usuario.criadoEm).toEqual(registro.createdAt);
    expect(usuario.atualizadoEm).toEqual(registro.updatedAt);
    expect(JSON.stringify(usuario)).not.toContain(registro.passwordHash);
  });

  it('mantém a validação de um registro persistido inválido', () => {
    expect(() => converterRegistroPrismaEmUsuario({ id: randomUUID(), name: '', email: 'ana@example.test',
      passwordHash: 'hash-opaco', status: 'ACTIVE', createdAt: new Date(), updatedAt: new Date() })).toThrow(ErroUsuarioInvalido);
  });

  it('preserva integralmente sessão revogada e seu hash na conversão de ida e volta', () => {
    const registro = { id: randomUUID(), userId: randomUUID(), activeOfficeId: randomUUID(),
      refreshTokenHash: 'a'.repeat(64), createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-03'),
      expiresAt: new Date('2026-01-08'), revokedAt: new Date('2026-01-03'), lastUsedAt: new Date('2026-01-02') };
    const sessao = converterRegistroPrismaEmSessao(registro);
    expect(sessao).toBeInstanceOf(Sessao);
    expect(sessao.estaAtiva(new Date('2026-01-04'))).toBe(false);
    expect(converterSessaoEmRegistroPrisma(sessao)).toEqual(registro);
    expect(JSON.stringify(sessao)).not.toContain(registro.refreshTokenHash);
  });
});

import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { InactiveOfficeError, InactiveUserError, InvalidAccessTokenError, InvalidCredentialsError, MultipleActiveOfficesError } from '../../src/application/authentication/authentication-errors.js';
import { Session } from '../../src/domain/sessions/session.js';
import { User } from '../../src/domain/users/user.js';
import { authenticationFixture, testPassword } from '../support/authentication-fixture.js';

describe('AuthenticateUser', () => {
  it('verifies Argon2, normalizes email and stores only a refresh digest in a seven-day session', async () => {
    const fixture = await authenticationFixture();
    const result = await fixture.login.execute({ email: '  USER@EXAMPLE.TEST  ', password: testPassword });
    expect(fixture.repository.findByEmail).toHaveBeenCalledWith('user@example.test');
    expect(fixture.passwords.verify).toHaveBeenCalledTimes(1);
    expect(fixture.sessions.size).toBe(1);
    const state = [...fixture.sessions.values()][0].toPersistence();
    expect(state.userId).toBe(fixture.account.user.id);
    expect(state.activeOfficeId).toBe(fixture.account.memberships[0].office.id);
    expect(state.refreshTokenHash === createHash('sha256').update(result.refreshToken).digest('hex')).toBe(true);
    expect(JSON.stringify(state).includes(result.refreshToken)).toBe(false);
    expect(JSON.stringify(state).includes(testPassword)).toBe(false);
    expect(state.expiresAt.getTime() - state.createdAt.getTime()).toBe(604800000);
    expect(state.revokedAt).toBeNull();
    expect(result.response.expiresIn).toBe(900);
    expect(result.response.office.role).toBe('OWNER');
    expect(Object.keys(result.response.user).sort()).toEqual(['email', 'id', 'name']);
    expect(JSON.stringify(result.response).includes('Hash')).toBe(false);
    expect(await fixture.tokens.verify(result.response.accessToken)).toEqual({
      userId: state.userId, sessionId: state.id, activeOfficeId: state.activeOfficeId, role: 'OWNER',
    });
  });

  it.each(['unknown@example.test', 'user@example.test'])('does equivalent password work without creating a session for %s', async (email) => {
    const fixture = await authenticationFixture();
    await expect(fixture.login.execute({ email, password: 'incorrect password' })).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(fixture.passwords.verify).toHaveBeenCalledTimes(1);
    expect(fixture.passwords.verify.mock.calls[0][0]).toBe(email.startsWith('unknown') ? fixture.referencePasswordHash : fixture.account.user.passwordHash);
    expect(fixture.repository.createSession).not.toHaveBeenCalled();
  });

  it('rejects an inactive user after password verification', async () => {
    const fixture = await authenticationFixture();
    const user = fixture.account.user;
    fixture.account.user = User.restore({ id: user.id, name: user.name, email: user.email, passwordHash: user.passwordHash, status: 'INACTIVE', createdAt: user.createdAt, updatedAt: user.updatedAt });
    await expect(fixture.login.execute({ email: user.email, password: testPassword })).rejects.toBeInstanceOf(InactiveUserError);
    expect(fixture.passwords.verify).toHaveBeenCalledTimes(1);
    expect(fixture.sessions.size).toBe(0);
  });

  it.each(['inactive', 'missing'] as const)('rejects %s office membership', async (scenario) => {
    const fixture = await authenticationFixture();
    if (scenario === 'missing') fixture.account.memberships = [];
    else fixture.account.memberships[0].office.status = 'INACTIVE';
    await expect(fixture.login.execute({ email: fixture.account.user.email, password: testPassword })).rejects.toBeInstanceOf(InactiveOfficeError);
    expect(fixture.sessions.size).toBe(0);
  });

  it('does not silently choose between active offices', async () => {
    const fixture = await authenticationFixture();
    fixture.account.memberships.push({ office: { id: randomUUID(), name: 'Another', status: 'ACTIVE' }, role: 'OWNER' });
    await expect(fixture.login.execute({ email: fixture.account.user.email, password: testPassword })).rejects.toBeInstanceOf(MultipleActiveOfficesError);
    expect(fixture.sessions.size).toBe(0);
  });

  it('uses the only active office even with an inactive membership', async () => {
    const fixture = await authenticationFixture();
    fixture.account.memberships.unshift({ office: { id: randomUUID(), name: 'Inactive', status: 'INACTIVE' }, role: 'OWNER' });
    const result = await fixture.login.execute({ email: fixture.account.user.email, password: testPassword });
    expect(result.response.office.id).toBe(fixture.account.memberships[1].office.id);
  });

  it('does not persist a session when signing fails', async () => {
    const fixture = await authenticationFixture();
    vi.spyOn(fixture.tokens, 'sign').mockRejectedValueOnce(new Error('Signing failed'));
    await expect(fixture.login.execute({ email: fixture.account.user.email, password: testPassword })).rejects.toThrow('Signing failed');
    expect(fixture.sessions.size).toBe(0);
  });

  it('does not return credentials when session persistence fails', async () => {
    const fixture = await authenticationFixture();
    vi.mocked(fixture.repository.createSession).mockRejectedValueOnce(new Error('Persistence failed'));
    await expect(fixture.login.execute({ email: fixture.account.user.email, password: testPassword })).rejects.toThrow('Persistence failed');
  });
});

describe('GetAuthenticatedIdentity', () => {
  it('returns public identity for a live session', async () => {
    const fixture = await authenticationFixture();
    const result = await fixture.login.execute({ email: fixture.account.user.email, password: testPassword });
    const identity = await fixture.identity.execute(result.response.accessToken);
    expect(Object.keys(identity).sort()).toEqual(['office', 'user']);
    expect(identity.office.role).toBe('OWNER');
  });

  it.each(['missing', 'revoked', 'expired', 'inactive-user', 'inactive-office', 'membership-removed', 'wrong-office', 'wrong-user'] as const)('rejects %s even with a signed token', async (scenario) => {
    const fixture = await authenticationFixture();
    const result = await fixture.login.execute({ email: fixture.account.user.email, password: testPassword });
    const session = [...fixture.sessions.values()][0];
    const state = session.toPersistence();
    if (scenario === 'missing') fixture.sessions.clear();
    if (scenario === 'revoked') fixture.sessions.set(session.id, Session.restore({ ...state, revokedAt: new Date() }));
    if (scenario === 'expired') fixture.sessions.set(session.id, Session.restore({ ...state, createdAt: new Date(0), expiresAt: new Date(1) }));
    if (scenario === 'inactive-user') {
      const user = fixture.account.user;
      fixture.account.user = User.restore({ id: user.id, name: user.name, email: user.email, passwordHash: user.passwordHash, status: 'INACTIVE', createdAt: user.createdAt, updatedAt: user.updatedAt });
    }
    if (scenario === 'inactive-office') fixture.account.memberships[0].office.status = 'INACTIVE';
    if (scenario === 'membership-removed') fixture.account.memberships = [];
    if (scenario === 'wrong-office') fixture.sessions.set(session.id, Session.restore({ ...state, activeOfficeId: randomUUID() }));
    if (scenario === 'wrong-user') fixture.sessions.set(session.id, Session.restore({ ...state, userId: randomUUID() }));
    await expect(fixture.identity.execute(result.response.accessToken)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });
});

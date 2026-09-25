import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ErroEscritorioInativo, ErroUsuarioInativo, ErroTokenAcessoInvalido, ErroCredenciaisInvalidas, ErroMultiplosEscritoriosAtivos } from '../../src/application/authentication/authentication-errors.js';
import { Sessao } from '../../src/domain/sessions/session.js';
import { Usuario } from '../../src/domain/users/user.js';
import { criarCenarioAutenticacao, SENHA_TESTE } from '../support/authentication-fixture.js';

describe("AutenticacaoDeUsuario", () => {
  it("verifica Argon2, normaliza e-mail e armazena somente hash de renovação em sessão de sete dias", async () => {
    const cenario = await criarCenarioAutenticacao();
    const resultado = await cenario.autenticacaoUsuario.autenticarUsuario({ email: '  USER@EXAMPLE.TEST  ', senha: SENHA_TESTE });
    expect(cenario.repositorio.buscarUsuarioComVinculosPorEmail).toHaveBeenCalledWith('user@example.test');
    expect(cenario.protecaoDeSenhas.compararSenhaComHash).toHaveBeenCalledTimes(1);
    expect(cenario.sessoes.size).toBe(1);
    const estado = [...cenario.sessoes.values()][0].obterCopiaDoEstado();
    expect(estado.idUsuario).toBe(cenario.usuarioComVinculos.usuario.id);
    expect(estado.idEscritorioAtivo).toBe(cenario.usuarioComVinculos.vinculos[0].escritorio.id);
    expect(estado.hashTokenRenovacao === createHash('sha256').update(resultado.tokenRenovacao).digest('hex')).toBe(true);
    expect(JSON.stringify(estado).includes(resultado.tokenRenovacao)).toBe(false);
    expect(JSON.stringify(estado).includes(SENHA_TESTE)).toBe(false);
    expect(estado.expiraEm.getTime() - estado.criadoEm.getTime()).toBe(604800000);
    expect(estado.revogadaEm).toBeNull();
    expect(resultado.resposta.expiraEmSegundos).toBe(900);
    expect(resultado.resposta.escritorio.papel).toBe('PROPRIETARIO');
    expect(Object.keys(resultado.resposta.usuario).sort()).toEqual(['email', 'id', 'nome']);
    expect(JSON.stringify(resultado.resposta).includes('Hash')).toBe(false);
    expect(await cenario.tokensAcesso.validarTokenDeAcesso(resultado.resposta.tokenAcesso)).toEqual({
      idUsuario: estado.idUsuario, idSessao: estado.id, idEscritorioAtivo: estado.idEscritorioAtivo, papel: 'PROPRIETARIO',
    });
  });

  it.each(['unknown@example.test', 'user@example.test'])("executa verificação equivalente de senha sem criar sessão para %s", async (email) => {
    const cenario = await criarCenarioAutenticacao();
    await expect(cenario.autenticacaoUsuario.autenticarUsuario({ email, senha: 'incorrect password' })).rejects.toBeInstanceOf(ErroCredenciaisInvalidas);
    expect(cenario.protecaoDeSenhas.compararSenhaComHash).toHaveBeenCalledTimes(1);
    expect(cenario.protecaoDeSenhas.compararSenhaComHash.mock.calls[0][0]).toBe(email.startsWith('unknown') ? cenario.hashSenhaReferencia : cenario.usuarioComVinculos.usuario.hashSenha);
    expect(cenario.repositorio.salvarSessao).not.toHaveBeenCalled();
  });

  it("rejeita usuário inativo após verificar a senha", async () => {
    const cenario = await criarCenarioAutenticacao();
    const usuario = cenario.usuarioComVinculos.usuario;
    cenario.usuarioComVinculos.usuario = Usuario.restaurar({ id: usuario.id, nome: usuario.nome, email: usuario.email, hashSenha: usuario.hashSenha, situacao: 'INATIVO', criadoEm: usuario.criadoEm, atualizadoEm: usuario.atualizadoEm });
    await expect(cenario.autenticacaoUsuario.autenticarUsuario({ email: usuario.email, senha: SENHA_TESTE })).rejects.toBeInstanceOf(ErroUsuarioInativo);
    expect(cenario.protecaoDeSenhas.compararSenhaComHash).toHaveBeenCalledTimes(1);
    expect(cenario.sessoes.size).toBe(0);
  });

  it.each(['inactive', 'missing'] as const)("rejeita vínculo de escritório no cenário %s", async (condicao) => {
    const cenario = await criarCenarioAutenticacao();
    if (condicao === 'missing') cenario.usuarioComVinculos.vinculos = [];
    else cenario.usuarioComVinculos.vinculos[0].escritorio.situacao = 'INATIVO';
    await expect(cenario.autenticacaoUsuario.autenticarUsuario({ email: cenario.usuarioComVinculos.usuario.email, senha: SENHA_TESTE })).rejects.toBeInstanceOf(ErroEscritorioInativo);
    expect(cenario.sessoes.size).toBe(0);
  });

  it("não escolhe silenciosamente entre escritórios ativos", async () => {
    const cenario = await criarCenarioAutenticacao();
    cenario.usuarioComVinculos.vinculos.push({ escritorio: { id: randomUUID(), nome: 'Another', situacao: 'ATIVO' }, papel: 'PROPRIETARIO' });
    await expect(cenario.autenticacaoUsuario.autenticarUsuario({ email: cenario.usuarioComVinculos.usuario.email, senha: SENHA_TESTE })).rejects.toBeInstanceOf(ErroMultiplosEscritoriosAtivos);
    expect(cenario.sessoes.size).toBe(0);
  });

  it("usa o único escritório ativo mesmo com outro vínculo inativo", async () => {
    const cenario = await criarCenarioAutenticacao();
    cenario.usuarioComVinculos.vinculos.unshift({ escritorio: { id: randomUUID(), nome: 'Inactive', situacao: 'INATIVO' }, papel: 'PROPRIETARIO' });
    const resultado = await cenario.autenticacaoUsuario.autenticarUsuario({ email: cenario.usuarioComVinculos.usuario.email, senha: SENHA_TESTE });
    expect(resultado.resposta.escritorio.id).toBe(cenario.usuarioComVinculos.vinculos[1].escritorio.id);
  });

  it("não persiste sessão quando a assinatura falha", async () => {
    const cenario = await criarCenarioAutenticacao();
    vi.spyOn(cenario.tokensAcesso, "criarTokenDeAcesso").mockRejectedValueOnce(new Error('Signing failed'));
    await expect(cenario.autenticacaoUsuario.autenticarUsuario({ email: cenario.usuarioComVinculos.usuario.email, senha: SENHA_TESTE })).rejects.toThrow('Signing failed');
    expect(cenario.sessoes.size).toBe(0);
  });

  it("não retorna credenciais quando a persistência da sessão falha", async () => {
    const cenario = await criarCenarioAutenticacao();
    vi.mocked(cenario.repositorio.salvarSessao).mockRejectedValueOnce(new Error('Persistence failed'));
    await expect(cenario.autenticacaoUsuario.autenticarUsuario({ email: cenario.usuarioComVinculos.usuario.email, senha: SENHA_TESTE })).rejects.toThrow('Persistence failed');
  });
});

describe("ConsultaDeIdentidadeAutenticada", () => {
  it("retorna identidade pública de sessão válida", async () => {
    const cenario = await criarCenarioAutenticacao();
    const resultado = await cenario.autenticacaoUsuario.autenticarUsuario({ email: cenario.usuarioComVinculos.usuario.email, senha: SENHA_TESTE });
    const identidade = await cenario.consultaIdentidade.consultarIdentidadeAutenticada(resultado.resposta.tokenAcesso);
    expect(Object.keys(identidade).sort()).toEqual(['escritorio', 'usuario']);
    expect(identidade.escritorio.papel).toBe('PROPRIETARIO');
  });

  it.each(['missing', 'revoked', 'expired', 'inactive-user', 'inactive-office', 'membership-removed', 'wrong-office', 'wrong-user'] as const)("rejeita %s mesmo com token assinado", async (condicao) => {
    const cenario = await criarCenarioAutenticacao();
    const resultado = await cenario.autenticacaoUsuario.autenticarUsuario({ email: cenario.usuarioComVinculos.usuario.email, senha: SENHA_TESTE });
    const sessao = [...cenario.sessoes.values()][0];
    const estado = sessao.obterCopiaDoEstado();
    if (condicao === 'missing') cenario.sessoes.clear();
    if (condicao === 'revoked') cenario.sessoes.set(sessao.id, Sessao.restaurar({ ...estado, revogadaEm: new Date() }));
    if (condicao === 'expired') cenario.sessoes.set(sessao.id, Sessao.restaurar({ ...estado, criadoEm: new Date(0), expiraEm: new Date(1) }));
    if (condicao === 'inactive-user') {
      const usuario = cenario.usuarioComVinculos.usuario;
      cenario.usuarioComVinculos.usuario = Usuario.restaurar({ id: usuario.id, nome: usuario.nome, email: usuario.email, hashSenha: usuario.hashSenha, situacao: 'INATIVO', criadoEm: usuario.criadoEm, atualizadoEm: usuario.atualizadoEm });
    }
    if (condicao === 'inactive-office') cenario.usuarioComVinculos.vinculos[0].escritorio.situacao = 'INATIVO';
    if (condicao === 'membership-removed') cenario.usuarioComVinculos.vinculos = [];
    if (condicao === 'wrong-office') cenario.sessoes.set(sessao.id, Sessao.restaurar({ ...estado, idEscritorioAtivo: randomUUID() }));
    if (condicao === 'wrong-user') cenario.sessoes.set(sessao.id, Sessao.restaurar({ ...estado, idUsuario: randomUUID() }));
    await expect(cenario.consultaIdentidade.consultarIdentidadeAutenticada(resultado.resposta.tokenAcesso)).rejects.toBeInstanceOf(ErroTokenAcessoInvalido);
  });
});

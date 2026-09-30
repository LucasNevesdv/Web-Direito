import { describe, expect, it } from 'vitest';
import { RecuperacaoDeSenha } from '../src/domain/password-recovery/password-recovery.js';
import { converterRecuperacaoEmRegistroPrisma, converterRegistroPrismaEmRecuperacao } from '../src/infrastructure/prisma/password-recovery-mapper.js';
import { criarCenarioSenhas } from './support/password-fixture.js';
const NOVA = { novaSenha: 'nova senha para teste', confirmacaoNovaSenha: 'nova senha para teste' };

describe('RF-007 e RF-008 — domínio e aplicação', () => {
  it('gera 256 bits, hash SHA256 e validade de 30 minutos sem token puro na entidade ou mapper', () => {
    const cenario = criarCenarioSenhas(), gerado = cenario.tokens.gerarToken();
    expect(Buffer.from(gerado.token, 'base64url')).toHaveLength(32);
    expect(gerado.hash).toMatch(/^[a-f0-9]{64}$/);
    const recuperacao = RecuperacaoDeSenha.criar(cenario.usuario.id, gerado.hash);
    const estado = recuperacao.obterEstadoDaRecuperacao();
    expect(estado.expiraEm.getTime() - estado.criadoEm.getTime()).toBe(1800000);
    expect(recuperacao.estaUtilizavel(estado.expiraEm)).toBe(false);
    expect(converterRegistroPrismaEmRecuperacao(converterRecuperacaoEmRegistroPrisma(recuperacao)).obterEstadoDaRecuperacao()).toEqual(estado);
    expect(JSON.stringify(converterRecuperacaoEmRegistroPrisma(recuperacao))).not.toContain(gerado.token);
    estado.expiraEm.setTime(0); expect(recuperacao.estaUtilizavel(new Date())).toBe(true);
    expect(() => RecuperacaoDeSenha.criar('invalido', gerado.hash)).toThrow('Recuperação de senha inválida');
  });
  it('normaliza e-mail, persiste antes de enviar HTML/texto com fragmento e avisos', async () => {
    const c = criarCenarioSenhas(); await c.solicitacao.solicitarRecuperacao(' PESSOA@EXAMPLE.TEST ');
    expect(c.trabalhos.size).toBe(1); expect(c.mensagens).toHaveLength(0);
    await c.executarTarefas(); expect(c.mensagens).toHaveLength(1);
    expect(c.mensagens[0].destinatario).toBe(c.usuario.email);
    for (const conteudo of [c.mensagens[0].html, c.mensagens[0].texto]) {
      expect(conteudo).toContain('Web Direito'); expect(conteudo).toContain('30 minutos'); expect(conteudo).toContain('nunca pedirá sua senha');
      expect(conteudo).toContain('/redefinir-senha#token='); expect(conteudo).not.toContain('?token=');
    }
    expect(c.mensagens[0].html).toContain('lang="pt-BR"');
  });
  it.each(['inexistente', 'inativo', 'malformado'])('não envia para %s', async (caso) => {
    const c = criarCenarioSenhas(); if (caso === 'inativo') c.usuario.estaAtivo = false;
    await c.solicitacao.solicitarRecuperacao(caso === 'inexistente' ? 'outro@example.test' : caso === 'malformado' ? 'invalido' : c.usuario.email);
    await c.executarTarefas(); expect(c.mensagens).toHaveLength(0); expect(c.recuperacoes.size).toBe(0);
  });
  it('invalida somente o novo token quando o envio falha, sem registrar o erro bruto', async () => {
    const c = criarCenarioSenhas(); c.envioEmail.enviarEmail.mockRejectedValue(new Error('segredo de fornecedor'));
    await c.solicitacao.solicitarRecuperacao(c.usuario.email); await c.executarTarefas();
    expect([...c.recuperacoes.values()].every((r) => !r.estaUtilizavel(new Date()))).toBe(true);
    expect(c.registrarFalha).toHaveBeenCalledWith();
  });
  it('solicitações concorrentes deixam somente um token utilizável', async () => {
    const c = criarCenarioSenhas(); for (let indice = 0; indice < 3; indice++) await c.solicitacao.solicitarRecuperacao(c.usuario.email);
    await c.executarTarefas(); expect(c.trabalhos.size).toBe(3);
    expect([...c.trabalhos.values()].filter((t) => t.situacao === 'FALHA_DEFINITIVA')).toHaveLength(2);
    expect(c.recuperacoes.size).toBe(1);
    expect([...c.recuperacoes.values()].filter((r) => r.estaUtilizavel(new Date()))).toHaveLength(1);
  });
  it.each(['ausente', 'expirado', 'utilizado', 'invalidado'])('rejeita token %s sem revelar o estado', async (caso) => {
    const c = criarCenarioSenhas(); await c.solicitacao.solicitarRecuperacao(c.usuario.email); await c.executarTarefas();
    const [id, recuperacao] = [...c.recuperacoes][0], estado = recuperacao.obterEstadoDaRecuperacao();
    if (caso === 'ausente') c.recuperacoes.clear();
    else c.recuperacoes.set(id, RecuperacaoDeSenha.restaurar({ ...estado,
      ...(caso === 'expirado' ? { criadoEm: new Date(0), expiraEm: new Date(1) } : caso === 'utilizado' ? { utilizadoEm: new Date() } : { invalidadoEm: new Date() }) }));
    await expect(c.redefinicao.redefinirSenha({ ...NOVA, token: c.obterToken() })).rejects.toThrow('TOKEN_INVALIDO');
    expect([...c.sessoes.values()]).toEqual([true, true]);
  });
  it('consome uma vez, troca senha e revoga todas as sessões em duas tentativas concorrentes', async () => {
    const c = criarCenarioSenhas(); await c.solicitacao.solicitarRecuperacao(c.usuario.email); await c.executarTarefas();
    const dados = { ...NOVA, token: c.obterToken() };
    const resultados = await Promise.allSettled([c.redefinicao.redefinirSenha(dados), c.redefinicao.redefinirSenha(dados)]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(c.usuario.hashSenha).toBe(`hash:${NOVA.novaSenha}`); expect([...c.sessoes.values()]).toEqual([false, false]);
    await expect(c.redefinicao.redefinirSenha(dados)).rejects.toThrow('TOKEN_INVALIDO');
  });
  it.each([
    ['curta', 'curta', 'SENHA_INVALIDA'], ['a'.repeat(129), 'a'.repeat(129), 'SENHA_INVALIDA'],
    [NOVA.novaSenha, 'diferente', 'CONFIRMACAO_DIFERENTE'], ['senha antiga de teste', 'senha antiga de teste', 'SENHA_REPETIDA'],
  ])('reutiliza a política sem mudar senha inválida (caso %#)', async (novaSenha, confirmacaoNovaSenha, erro) => {
    const c = criarCenarioSenhas(); await c.solicitacao.solicitarRecuperacao(c.usuario.email); await c.executarTarefas();
    await expect(c.redefinicao.redefinirSenha({ token: c.obterToken(), novaSenha, confirmacaoNovaSenha })).rejects.toThrow(erro);
    await expect(c.alteracao.alterarSenha('acesso', { senhaAtual: 'senha antiga de teste', novaSenha, confirmacaoNovaSenha })).rejects.toThrow(erro);
    expect(c.repositorio.redefinirSenha).not.toHaveBeenCalled(); expect(c.repositorio.alterarSenha).not.toHaveBeenCalled();
  });
  it('altera senha autenticado, invalida recuperações e encerra todas as sessões', async () => {
    const c = criarCenarioSenhas(); await c.solicitacao.solicitarRecuperacao(c.usuario.email); await c.executarTarefas();
    await c.alteracao.alterarSenha('acesso', { ...NOVA, senhaAtual: 'senha antiga de teste' });
    expect([...c.sessoes.values()]).toEqual([false, false]); expect([...c.recuperacoes.values()][0].estaUtilizavel(new Date())).toBe(false);
    await expect(c.alteracao.alterarSenha('acesso', { ...NOVA, senhaAtual: NOVA.novaSenha })).rejects.toThrow();
  });
  it('não altera com senha atual incorreta', async () => {
    const c = criarCenarioSenhas(); await expect(c.alteracao.alterarSenha('acesso', { ...NOVA, senhaAtual: 'errada' })).rejects.toThrow('SENHA_ATUAL_INCORRETA');
    expect(c.repositorio.alterarSenha).not.toHaveBeenCalled();
  });
});

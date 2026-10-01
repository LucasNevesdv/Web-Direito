import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GestaoEquipe } from '../src/application/team/manage-team.js';
import { ErroEquipe, PERMISSOES_EQUIPE, PoliticaEquipe, type AutorEquipe } from '../src/application/team/team-policy.js';
import type { OperacoesEquipe, MembroEquipe, RepositorioEquipe } from '../src/application/team/team-contracts.js';
import type { PapelVinculoEscritorio } from '../src/domain/memberships/membership.js';
import { Usuario } from '../src/domain/users/user.js';
import { criarAplicacao } from '../src/app.js';
import { criarCenarioLimitador } from './support/rate-limiter-fixture.js';
import type { ServicosRotasAutenticacao } from '../src/presentation/authentication-routes.js';
import { ErroPrimeiroAcessoObrigatorio, ErroTokenAcessoInvalido } from '../src/application/authentication/authentication-errors.js';
import { criarCenarioAutenticacao, SENHA_TESTE } from './support/authentication-fixture.js';
import { criarCenarioSenhas } from './support/password-fixture.js';

function preparar(papel: PapelVinculoEscritorio = 'PROPRIETARIO') {
  const autor: AutorEquipe = { idUsuario: randomUUID(), papel, permissoes: PoliticaEquipe.permissoesPadrao(papel) };
  const contexto = { idUsuario: autor.idUsuario, idEscritorioAtivo: randomUUID(), idSessao: randomUUID(), papel };
  const membro: MembroEquipe = { id: randomUUID(), idUsuario: randomUUID(), nome: 'Pessoa', email: 'pessoa@example.test', papel: 'ADVOGADO', permissoes: [], estaAtivo: true, deveAlterarSenha: true, criadoEm: new Date(), versao: 0 };
  const operacoes: OperacoesEquipe = { autor,
    listar: vi.fn(async () => ({ usuarios: [membro], total: 1 })), consultar: vi.fn(async (id) => { if (id !== membro.id) throw new ErroEquipe('NAO_ENCONTRADO', 404); return membro; }),
    historico: vi.fn(async () => []), criar: vi.fn(async (dados) => ({ ...membro, email: dados.email, papel: dados.papel, permissoes: dados.permissoes })),
    alterar: vi.fn(async (anterior, dados) => ({ ...anterior, ...dados, versao: anterior.versao + 1 })),
  };
  const repositorio: RepositorioEquipe = { executar: vi.fn(async (_contexto, operacao) => operacao(operacoes)) };
  const senhas = { gerarHashDaSenha: vi.fn(async () => 'hash-opaco'), compararSenhaComHash: vi.fn(async () => true) };
  const tokens = { validarTokenDeAcesso: vi.fn(async () => contexto), criarTokenDeAcesso: vi.fn(async () => 'token') };
  const equipe = new GestaoEquipe(repositorio, tokens, senhas);
  const dados = { nome: ' Pessoa Nova ', email: ' NOVA@EXAMPLE.TEST ', papel: 'ADVOGADO' as PapelVinculoEscritorio, permissoes: [] as string[], senhaTemporaria: 'credencial temporaria', confirmacaoSenhaTemporaria: 'credencial temporaria' };
  return { autor, contexto, membro, operacoes, repositorio, senhas, tokens, equipe, dados };
}
describe('política e cadastro administrativo', () => {
  it.each(['ADMINISTRADOR', 'ADVOGADO', 'ESTAGIARIO', 'SECRETARIO'] as const)('proprietário cadastra %s com padrões', async (papel) => {
    const c = preparar(); const permissoes = PoliticaEquipe.permissoesPadrao(papel);
    const criado = await c.equipe.cadastrar('token', { ...c.dados, papel, permissoes });
    expect(criado.papel).toBe(papel); expect(criado.permissoes).toEqual(permissoes);
    const dados = vi.mocked(c.operacoes.criar).mock.calls[0][0];
    expect(dados.usuarioNovo).toBeInstanceOf(Usuario); expect(dados.usuarioNovo?.deveAlterarSenha).toBe(true);
    expect(dados.usuarioNovo?.nome).toBe('Pessoa Nova'); expect(dados.email).toBe('nova@example.test');
    expect(dados.usuarioNovo?.hashSenha).toBe('hash-opaco'); expect(JSON.stringify(criado)).not.toContain('hash-opaco');
  });
  it.each(['ADVOGADO', 'ESTAGIARIO', 'SECRETARIO'] as const)('administrador cadastra %s', async (papel) => {
    const c = preparar('ADMINISTRADOR'); await c.equipe.cadastrar('token', { ...c.dados, papel }); expect(c.operacoes.criar).toHaveBeenCalledOnce();
  });
  it.each(['PROPRIETARIO', 'ADMINISTRADOR'] as const)('administrador não cria %s', async (papel) => {
    const c = preparar('ADMINISTRADOR'); await expect(c.equipe.cadastrar('token', { ...c.dados, papel })).rejects.toMatchObject({ situacao: 403 });
    expect(c.senhas.gerarHashDaSenha).not.toHaveBeenCalled(); expect(c.operacoes.criar).not.toHaveBeenCalled();
  });
  it.each(['ADVOGADO', 'ESTAGIARIO', 'SECRETARIO'] as const)('%s não gerencia mesmo com permissões adulteradas', async (papel) => {
    const c = preparar(papel); c.autor.permissoes = [...PERMISSOES_EQUIPE];
    await expect(c.equipe.cadastrar('token', c.dados)).rejects.toMatchObject({ situacao: 403 });
  });
  it('proprietário tem todas as permissões mesmo se vetor persistido estiver incompleto', async () => {
    const c = preparar(); c.autor.permissoes = []; expect((await c.equipe.configuracao('token')).permissoes).toEqual(PERMISSOES_EQUIPE);
  });
  it.each(['EQUIPE_CADASTRAR_USUARIO', 'EQUIPE_DEFINIR_PERMISSOES'] as const)('cadastro exige %s', async (permissao) => {
    const c = preparar('ADMINISTRADOR'); c.autor.permissoes = c.autor.permissoes.filter((p) => p !== permissao);
    await expect(c.equipe.cadastrar('token', c.dados)).rejects.toMatchObject({ situacao: 403 });
  });
  it.each([['curta', 'curta'], ['a'.repeat(129), 'a'.repeat(129)], ['credencial temporaria', 'diferente']])('rejeita senha inválida ou confirmação (caso %#)', async (senhaTemporaria, confirmacaoSenhaTemporaria) => {
    const c = preparar(); await expect(c.equipe.cadastrar('token', { ...c.dados, senhaTemporaria, confirmacaoSenhaTemporaria })).rejects.toMatchObject({ situacao: 400 }); expect(c.operacoes.criar).not.toHaveBeenCalled();
  });
  it('confirma vínculo existente sem gerar ou passar nova senha', async () => {
    const c = preparar(); await c.equipe.confirmarVinculo('token', { email: c.dados.email, papel: 'ADVOGADO', permissoes: [] });
    expect(c.senhas.gerarHashDaSenha).not.toHaveBeenCalled(); expect(c.operacoes.criar).toHaveBeenCalledWith({ email: 'nova@example.test', papel: 'ADVOGADO', permissoes: [], confirmarContaExistente: true });
  });
  it.each(['CONTA_EXISTENTE', 'VINCULO_EXISTENTE', 'VINCULO_INATIVO'] as const)('preserva conflito %s sem substituir conta', async (codigo) => {
    const c = preparar(); vi.mocked(c.operacoes.criar).mockRejectedValue(new ErroEquipe(codigo, 409));
    await expect(c.equipe.cadastrar('token', c.dados)).rejects.toMatchObject({ codigo, situacao: 409 }); expect(c.operacoes.alterar).not.toHaveBeenCalled();
  });
  it('não permite cadastrar proprietário mesmo com autoridade máxima', async () => {
    const c = preparar(); await expect(c.equipe.cadastrar('token', { ...c.dados, papel: 'PROPRIETARIO' })).rejects.toMatchObject({ situacao: 403 });
  });
  it('personaliza visualização sem conceder administração a papel inferior', async () => {
    const c = preparar('ADMINISTRADOR'); await c.equipe.cadastrar('token', { ...c.dados, permissoes: ['EQUIPE_VISUALIZAR'] });
    await expect(c.equipe.cadastrar('token', { ...c.dados, permissoes: ['EQUIPE_ALTERAR_USUARIO'] })).rejects.toMatchObject({ situacao: 403 });
    c.autor.permissoes = c.autor.permissoes.filter((p) => p !== 'EQUIPE_VISUALIZAR');
    await expect(c.equipe.cadastrar('token', { ...c.dados, permissoes: ['EQUIPE_VISUALIZAR'] })).rejects.toMatchObject({ situacao: 403 });
  });
  it.each([['FICTICIA'], ['EQUIPE_VISUALIZAR', 'EQUIPE_VISUALIZAR']])('rejeita conjunto inválido (caso %#)', async (...permissoes) => {
    const c = preparar(); await expect(c.equipe.cadastrar('token', { ...c.dados, permissoes })).rejects.toMatchObject({ situacao: 400 });
  });
  it('reconfirma autorização depois do hash e deriva contexto somente do token', async () => {
    const c = preparar('ADMINISTRADOR'); c.senhas.gerarHashDaSenha.mockImplementation(async () => { c.autor.permissoes = []; return 'hash'; });
    await expect(c.equipe.cadastrar('token', c.dados)).rejects.toMatchObject({ situacao: 403 }); expect(c.operacoes.criar).not.toHaveBeenCalled();
    expect(c.repositorio.executar).toHaveBeenCalledWith(c.contexto, expect.any(Function));
  });
});
describe('alterações e ativação', () => {
  it('inativação preserva permissões existentes sem exigir autoridade para concedê-las novamente', async () => {
    const c = preparar('ADMINISTRADOR'); c.autor.permissoes = ['EQUIPE_ATIVAR_INATIVAR_USUARIO']; c.membro.permissoes = ['EQUIPE_VISUALIZAR'];
    const resultado = await c.equipe.definirSituacao('token', c.membro.id, false, 0);
    expect(resultado.estaAtivo).toBe(false); expect(resultado.permissoes).toEqual(['EQUIPE_VISUALIZAR']);
  });
  it.each([true, false])('altera situação para %s preservando papel e permissões', async (estaAtivo) => {
    const c = preparar(); c.membro.estaAtivo = !estaAtivo;
    const resultado = await c.equipe.definirSituacao('token', c.membro.id, estaAtivo, 0);
    expect(resultado).toMatchObject({ estaAtivo, papel: c.membro.papel, permissoes: c.membro.permissoes, versao: 1 });
  });
  it.each(['proprietario', 'proprio', 'administrador'] as const)('protege vínculo %s contra edição e inativação', async (caso) => {
    const c = preparar(caso === 'administrador' ? 'ADMINISTRADOR' : 'PROPRIETARIO');
    if (caso === 'proprietario') c.membro.papel = 'PROPRIETARIO';
    if (caso === 'proprio') c.membro.idUsuario = c.autor.idUsuario;
    if (caso === 'administrador') c.membro.papel = 'ADMINISTRADOR';
    await expect(c.equipe.alterar('token', c.membro.id, { papel: 'ADVOGADO', permissoes: [], versao: 0 })).rejects.toMatchObject({ situacao: 403 });
    await expect(c.equipe.definirSituacao('token', c.membro.id, false, 0)).rejects.toMatchObject({ situacao: 403 });
  });
  it('versão divergente rejeita escrita concorrente', async () => {
    const c = preparar(); c.membro.versao = 1;
    await expect(c.equipe.alterar('token', c.membro.id, { papel: 'ADVOGADO', permissoes: [], versao: 0 })).rejects.toMatchObject({ situacao: 409 });
    await expect(c.equipe.definirSituacao('token', c.membro.id, false, 0)).rejects.toMatchObject({ situacao: 409 }); expect(c.operacoes.alterar).not.toHaveBeenCalled();
  });
  it('redução exige permissão específica e mantém estado do vínculo', async () => {
    const c = preparar('ADMINISTRADOR'); c.membro.permissoes = ['EQUIPE_VISUALIZAR'];
    c.autor.permissoes = c.autor.permissoes.filter((p) => p !== 'EQUIPE_DEFINIR_PERMISSOES');
    await expect(c.equipe.alterar('token', c.membro.id, { papel: 'ADVOGADO', permissoes: [], versao: 0 })).rejects.toMatchObject({ situacao: 403 });
    c.autor.permissoes.push('EQUIPE_DEFINIR_PERMISSOES'); await c.equipe.alterar('token', c.membro.id, { papel: 'ESTAGIARIO', permissoes: [], versao: 0 });
    expect(c.operacoes.alterar).toHaveBeenCalledWith(c.membro, expect.objectContaining({ papel: 'ESTAGIARIO', permissoes: [], estaAtivo: true }));
  });
  it('consulta e histórico recusam ID de outro escritório', async () => {
    const c = preparar(); await expect(c.equipe.consultar('token', randomUUID())).rejects.toMatchObject({ situacao: 404 });
    await expect(c.equipe.historico('token', randomUUID())).rejects.toMatchObject({ situacao: 404 }); expect(c.operacoes.historico).not.toHaveBeenCalled();
  });
  it('visualização exige permissão atual', async () => {
    const c = preparar('ADVOGADO'); await expect(c.equipe.listar('token', { pagina: 1, tamanhoPagina: 10, pesquisa: '' })).rejects.toMatchObject({ situacao: 403 });
    c.autor.permissoes = ['EQUIPE_VISUALIZAR']; expect((await c.equipe.listar('token', { pagina: 1, tamanhoPagina: 10, pesquisa: 'Pessoa' })).total).toBe(1);
  });
});
const aplicacoes: ReturnType<typeof criarAplicacao>[] = [];
afterEach(async () => { await Promise.all(aplicacoes.splice(0).map((app) => app.close())); });
describe('HTTP administrativo', () => {
  function api() {
    const c = preparar(); const limites = criarCenarioLimitador({ 'team-create-ip': { limite: 2 } });
    const app = criarAplicacao({ verificarConexaoComBanco: async () => {} }, undefined, { origemFrontend: 'http://localhost:5173' } as ServicosRotasAutenticacao, { limitador: limites.limitador }, undefined, c.equipe); aplicacoes.push(app);
    const enviar = (payload: unknown) => app.inject({ method: 'POST', url: '/api/v1/equipe/usuarios', headers: { origin: 'http://localhost:5173', authorization: 'Bearer teste' }, payload: payload as object });
    return { ...c, app, enviar };
  }
  it('retorna 201 sem credencial e limita cadastro com Retry-After', async () => {
    const c = api(); const resposta = await c.enviar(c.dados); expect(resposta.statusCode).toBe(201); expect(resposta.body).not.toMatch(/hash|senhaTemporaria|credencial temporaria/);
    await c.enviar(c.dados); const limitada = await c.enviar(c.dados); expect(limitada.statusCode).toBe(429); expect(limitada.headers['retry-after']).toBeDefined();
  });
  it.each([{ escritorioId: randomUUID() }, { senha: 'segredo' }, { active: false }, { papel: 'PROPRIETARIO' }, { permissoes: ['FICTICIA'] }])('rejeita mass assignment e valores inválidos (caso %#)', async (extra) => {
    const c = api(); expect((await c.enviar({ ...c.dados, ...extra })).statusCode).toBe(400); expect(c.operacoes.criar).not.toHaveBeenCalled();
  });
  it('exige confirmação literal para conta existente', async () => {
    const c = api(); const resposta = await c.app.inject({ method: 'POST', url: '/api/v1/equipe/usuarios/confirmar-vinculo', headers: { origin: 'http://localhost:5173', authorization: 'Bearer teste' }, payload: { email: 'pessoa@example.test', papel: 'ADVOGADO', permissoes: [] } });
    expect(resposta.statusCode).toBe(400); expect(c.operacoes.criar).not.toHaveBeenCalled();
  });
  it('nega ausência de autenticação e origem incompatível', async () => {
    const c = api(); expect((await c.app.inject('/api/v1/equipe/usuarios')).statusCode).toBe(401);
    expect((await c.app.inject({ method: 'POST', url: '/api/v1/equipe/usuarios', payload: c.dados })).statusCode).toBe(403);
  });
  it.each([[new ErroTokenAcessoInvalido(), 401], [new ErroPrimeiroAcessoObrigatorio(), 403], [new Error('senha privada'), 503]] as const)('sanitiza falha e restrição (caso %#)', async (erro, status) => {
    const c = api(); vi.mocked(c.repositorio.executar).mockRejectedValue(erro); const resposta = await c.enviar(c.dados);
    expect(resposta.statusCode).toBe(status); expect(resposta.body).not.toContain('senha privada');
  });
});
describe('primeiro acesso e autenticação', () => {
  it.each(['ADMINISTRADOR', 'ADVOGADO', 'ESTAGIARIO', 'SECRETARIO'] as const)('login normal e refresh preservam %s', async (papel) => {
    const c = await criarCenarioAutenticacao(); c.usuarioComVinculos.vinculos[0].papel = papel;
    const login = await c.autenticacaoUsuario.autenticarUsuario({ email: c.usuarioComVinculos.usuario.email, senha: SENHA_TESTE });
    expect((await c.consultaIdentidade.consultarIdentidadeAutenticada(login.resposta.tokenAcesso)).escritorio.papel).toBe(papel);
    expect((await c.renovacaoSessao.renovarSessao(login.tokenRenovacao)).resposta.escritorio.papel).toBe(papel);
  });
  it('senha temporária cria sessão restrita e não permite refresh', async () => {
    const c = await criarCenarioAutenticacao(), anterior = c.usuarioComVinculos.usuario;
    c.usuarioComVinculos.usuario = Usuario.criar({ id: anterior.id, nome: anterior.nome, email: anterior.email, hashSenha: anterior.hashSenha, deveAlterarSenha: true });
    const login = await c.autenticacaoUsuario.autenticarUsuario({ email: anterior.email, senha: SENHA_TESTE });
    expect(login.resposta.deveAlterarSenha).toBe(true); expect([...c.sessoes.values()][0].estaRestrita).toBe(true);
    expect((await c.consultaIdentidade.consultarIdentidadeAutenticada(login.resposta.tokenAcesso)).deveAlterarSenha).toBe(true);
    await expect(c.renovacaoSessao.renovarSessao(login.tokenRenovacao)).rejects.toBeInstanceOf(ErroTokenAcessoInvalido);
  });
  it('vínculo inativo nega login e identidade imediatamente', async () => {
    const c = await criarCenarioAutenticacao(); const login = await c.autenticacaoUsuario.autenticarUsuario({ email: c.usuarioComVinculos.usuario.email, senha: SENHA_TESTE });
    c.usuarioComVinculos.vinculos[0].estaAtivo = false;
    await expect(c.consultaIdentidade.consultarIdentidadeAutenticada(login.resposta.tokenAcesso)).rejects.toBeInstanceOf(ErroTokenAcessoInvalido);
    await expect(c.autenticacaoUsuario.autenticarUsuario({ email: c.usuarioComVinculos.usuario.email, senha: SENHA_TESTE })).rejects.toThrow();
  });
  it.each([['errada', 'nova senha muito segura', 'nova senha muito segura', 'SENHA_ATUAL_INCORRETA'], ['senha antiga de teste', 'curta', 'curta', 'SENHA_INVALIDA'], ['senha antiga de teste', 'nova senha muito segura', 'outra', 'CONFIRMACAO_DIFERENTE'], ['senha antiga de teste', 'senha antiga de teste', 'senha antiga de teste', 'SENHA_REPETIDA']])('primeiro acesso rejeita credenciais inválidas (caso %#)', async (senhaAtual, novaSenha, confirmacaoNovaSenha, codigo) => {
    const c = criarCenarioSenhas(); const identidade = await c.consultaIdentidade.consultarIdentidadeAutenticada();
    c.consultaIdentidade.consultarIdentidadeAutenticada.mockResolvedValue(Object.assign(identidade, { deveAlterarSenha: true }));
    await expect(c.alteracao.alterarSenha('token', { senhaAtual, novaSenha, confirmacaoNovaSenha }, true)).rejects.toMatchObject({ codigo });
    expect(c.repositorio.alterarSenha).not.toHaveBeenCalled();
  });
  it('primeiro acesso exige rota própria e revoga sessões no sucesso', async () => {
    const c = criarCenarioSenhas(); c.consultaIdentidade.consultarIdentidadeAutenticada.mockResolvedValue(Object.assign(await c.consultaIdentidade.consultarIdentidadeAutenticada(), { deveAlterarSenha: true }));
    const dados = { senhaAtual: 'senha antiga de teste', novaSenha: 'nova senha muito segura', confirmacaoNovaSenha: 'nova senha muito segura' };
    await expect(c.alteracao.alterarSenha('token', dados)).rejects.toBeInstanceOf(ErroPrimeiroAcessoObrigatorio);
    await c.alteracao.alterarSenha('token', dados, true);
    expect(c.repositorio.alterarSenha).toHaveBeenCalledWith(expect.objectContaining({ primeiroAcesso: true })); expect([...c.sessoes.values()].every((ativa) => !ativa)).toBe(true);
  });
});

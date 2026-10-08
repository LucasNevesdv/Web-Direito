import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { criarAplicacao } from '../src/app.js';
import { AutenticacaoDeUsuario } from '../src/application/authentication/authenticate-user.js';
import { ErroTokenAcessoInvalido } from '../src/application/authentication/authentication-errors.js';
import { GestaoSessoes } from '../src/application/authentication/manage-sessions.js';
import { ErroGestaoSessao, SelecaoEscritorioNecessaria, type RepositorioGestaoSessoes } from '../src/application/authentication/session-management-contracts.js';
import { Sessao } from '../src/domain/sessions/session.js';
import { TokensSelecaoCriptograficos } from '../src/infrastructure/security/crypto-office-selection.js';
import { capturarMetadadosSessao } from '../src/presentation/session-metadata.js';
import { RepositorioGestaoSessoesPrisma } from '../src/infrastructure/prisma/prisma-session-management-repository.js';
import { RepositorioAutenticacaoPrisma } from '../src/infrastructure/prisma/prisma-authentication-repository.js';
import { converterSessaoEmRegistroPrisma } from '../src/infrastructure/prisma/authentication-mapper.js';
import { criarCenarioAutenticacao, SENHA_TESTE } from './support/authentication-fixture.js';
import { criarCenarioLimitador } from './support/rate-limiter-fixture.js';

const METADADOS = { navegador: 'Chrome', dispositivo: 'Windows', ipMascarado: '127.0.*.*' };
const APLICACOES: ReturnType<typeof criarAplicacao>[] = [];
afterEach(async () => { await Promise.all(APLICACOES.splice(0).map(app => app.close())); vi.restoreAllMocks(); });
async function cenario() {
  const base = await criarCenarioAutenticacao();
  const tokens = new TokensSelecaoCriptograficos();
  const repositorio: RepositorioGestaoSessoes = {
    emitirSelecao: vi.fn(async () => {}), invalidarSelecao: vi.fn(async () => {}), listar: vi.fn(async () => []), encerrar: vi.fn(async () => {}),
    selecionar: vi.fn(async (_hash, _escritorio, _agora, criar) => { const sessao = await criar(base.usuarioComVinculos); base.sessoes.set(sessao.id, sessao); }),
    trocar: vi.fn(async (_contexto, _escritorio, _agora, criar) => { const sessao = await criar(base.usuarioComVinculos); base.sessoes.set(sessao.id, sessao); }),
  };
  const gestao = new GestaoSessoes(repositorio, base.repositorio, base.consultaIdentidade, base.tokensAcesso, base.tokensRenovacao, tokens, 900, 604800);
  const autenticacao = new AutenticacaoDeUsuario(base.repositorio, base.protecaoDeSenhas, base.tokensAcesso, base.tokensRenovacao,
    { hashSenhaReferencia: base.hashSenhaReferencia, validadeAcessoSegundos: 900, validadeRenovacaoSegundos: 604800 }, undefined, gestao);
  const app = criarAplicacao({ verificarConexaoComBanco: async () => {} }, undefined, { gestaoSessoes: gestao, autenticacao,
    consultaIdentidade: base.consultaIdentidade, renovacao: base.renovacaoSessao, encerramento: base.encerramentoSessao,
    origemFrontend: 'http://localhost:5173', deveUsarCookieSeguro: false, validadeRenovacaoSegundos: 604800 }, { limitador: criarCenarioLimitador().limitador });
  APLICACOES.push(app);
  const login = () => app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'http://localhost:5173' }, payload: { email: base.usuarioComVinculos.usuario.email, senha: SENHA_TESTE } });
  return { ...base, tokens, gestao, repositorioGestao: repositorio, autenticacao, app, login };
}
describe('seleção e gestão de sessões', () => {
  it('logout não revoga sessão por conhecer somente seu identificador', async () => {
    const c = await cenario(); await c.login(); const sessao = [...c.sessoes.values()][0];
    const forjado = c.tokensRenovacao.gerarTokenDeRenovacao(sessao.id).token;
    await c.encerramentoSessao.encerrarSessao(forjado);
    expect(c.repositorio.revogarSessao).not.toHaveBeenCalled(); expect(c.sessoes.get(sessao.id)!.estaAtiva(new Date())).toBe(true);
  });
  it('emite autorização opaca de cinco minutos sem sessão nem refresh, somente vínculos ativos', async () => {
    const c = await cenario();
    c.usuarioComVinculos.vinculos.push({ escritorio: { id: randomUUID(), nome: 'Segundo', situacao: 'ATIVO' }, papel: 'ADVOGADO' },
      { escritorio: { id: randomUUID(), nome: 'Inativo', situacao: 'ATIVO' }, papel: 'ADVOGADO', estaAtivo: false });
    const resposta = await c.login(); const dados = resposta.json();
    expect(resposta.statusCode).toBe(200); expect(dados.selecaoNecessaria).toBe(true); expect(dados.escritorios).toHaveLength(2);
    expect(dados.autorizacaoSelecao).toMatch(/^[\w-]{43}$/); expect(dados.tokenAcesso).toBeUndefined(); expect(c.sessoes.size).toBe(0);
    expect(resposta.cookies[0].value).toBe('');
    const registro = vi.mocked(c.repositorioGestao.emitirSelecao).mock.calls[0][0];
    expect(registro.expiraEm.getTime() - registro.criadoEm.getTime()).toBe(300000);
    expect(registro.hash).toBe(c.tokens.calcularHash(dados.autorizacaoSelecao)); expect(JSON.stringify(registro)).not.toContain(dados.autorizacaoSelecao);
    expect((await c.app.inject({ url: '/api/v1/auth/me', headers: { authorization: `Bearer ${dados.autorizacaoSelecao}` } })).statusCode).toBe(401);
  });
  it('seleciona o único vínculo sem autorização intermediária', async () => {
    const c = await cenario(); expect((await c.login()).json().tokenAcesso).toBeTypeOf('string'); expect(c.repositorioGestao.emitirSelecao).not.toHaveBeenCalled();
  });
  it('zero vínculos nega login', async () => { const c = await cenario(); c.usuarioComVinculos.vinculos = []; expect((await c.login()).statusCode).toBe(401); });
  it('lista de escritórios trata sessão removida entre as leituras como autenticação inválida', async () => {
    const c = await cenario();
    const login = (await c.login()).json();
    const sessao = [...c.sessoes.values()][0];
    vi.mocked(c.repositorio.buscarSessaoComUsuarioPorId)
      .mockResolvedValueOnce({ sessao, usuarioComVinculos: c.usuarioComVinculos })
      .mockResolvedValueOnce(null);
    await expect(c.gestao.escritorios(login.tokenAcesso)).rejects.toBeInstanceOf(ErroTokenAcessoInvalido);
  });
  it('a seleção produz cookie e contexto corretos, sem segredo no JSON', async () => {
    const c = await cenario(); const token = c.tokens.gerar().token;
    const resposta = await c.app.inject({ method: 'POST', url: '/api/v1/auth/selecionar-escritorio', headers: { origin: 'http://localhost:5173', authorization: `Selecao ${token}` }, payload: { idEscritorio: c.usuarioComVinculos.vinculos[0].escritorio.id } });
    expect(resposta.statusCode).toBe(200); expect(resposta.cookies[0].value).not.toBe(''); expect(resposta.body).not.toMatch(/senha|Hash|tokenRenovacao/);
    expect([...c.sessoes.values()][0].obterEstadoAtualDaSessao().metadados?.ipMascarado).toBe('127.0.*.*');
  });
  it.each([['SELECAO_INVALIDA',401],['SELECAO_ENCERRADA',410],['VINCULO_PROIBIDO',403],['CONFLITO',409]] as const)('serializa %s sem detalhes internos', async (codigo, status) => {
    const c = await cenario(); vi.mocked(c.repositorioGestao.selecionar).mockRejectedValue(new ErroGestaoSessao(codigo,status));
    const resposta = await c.app.inject({ method:'POST',url:'/api/v1/auth/selecionar-escritorio',headers:{origin:'http://localhost:5173',authorization:`Selecao ${c.tokens.gerar().token}`},payload:{idEscritorio:randomUUID()} });
    expect(resposta.statusCode).toBe(status); expect(resposta.body).not.toMatch(/stack|prisma|password/i);
  });
  it.each(['escritorioId','userId','papel'])('recusa mass assignment %s', async campo => {
    const c = await cenario(); const r = await c.app.inject({method:'POST',url:'/api/v1/auth/selecionar-escritorio',headers:{origin:'http://localhost:5173',authorization:`Selecao ${c.tokens.gerar().token}`},payload:{idEscritorio:randomUUID(),[campo]:randomUUID()}});
    expect(r.statusCode).toBe(400); expect(c.repositorioGestao.selecionar).not.toHaveBeenCalled();
  });
  it('logout cancela a autorização de seleção pelo hash',async()=>{const c=await cenario();const t=c.tokens.gerar();expect((await c.app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{origin:'http://localhost:5173',authorization:`Selecao ${t.token}`}})).statusCode).toBe(204);expect(c.repositorioGestao.invalidarSelecao).toHaveBeenCalledWith(t.hash,expect.any(Date));});
  it('seleção rejeita vínculo alheio antes de salvar a sessão',async()=>{const c=await cenario();await expect(c.gestao.estabelecerContexto(c.tokens.gerar().token,randomUUID(),METADADOS)).rejects.toMatchObject({situacao:403});expect(c.sessoes.size).toBe(0);});
  it('sessão restrita não troca nem lista sessões',async()=>{
    const c=await cenario();const login=(await c.login()).json();const sessao=[...c.sessoes.values()][0];c.sessoes.set(sessao.id,Sessao.restaurar({...sessao.obterEstadoAtualDaSessao(),estaRestrita:true}));
    await expect(c.gestao.listar(login.tokenAcesso)).rejects.toThrow('PRIMEIRO_ACESSO');await expect(c.gestao.estabelecerContexto(login.tokenAcesso,randomUUID(),METADADOS,true)).rejects.toThrow('PRIMEIRO_ACESSO');
  });
  it('encerrar sessão atual limpa o cookie; alheia retorna 404; DELETE exige Origin',async()=>{
    const c=await cenario();const login=(await c.login()).json();const id=[...c.sessoes.keys()][0];
    expect((await c.app.inject({method:'DELETE',url:`/api/v1/auth/sessoes/${id}`,headers:{authorization:`Bearer ${login.tokenAcesso}`}})).statusCode).toBe(403);
    const r=await c.app.inject({method:'DELETE',url:`/api/v1/auth/sessoes/${id}`,headers:{authorization:`Bearer ${login.tokenAcesso}`,origin:'http://localhost:5173'}});
    expect(r.statusCode).toBe(204);expect(r.cookies[0].value).toBe('');
    vi.mocked(c.repositorioGestao.encerrar).mockRejectedValue(new ErroGestaoSessao('NAO_ENCONTRADO',404));
    expect((await c.app.inject({method:'DELETE',url:`/api/v1/auth/sessoes/${randomUUID()}`,headers:{authorization:`Bearer ${login.tokenAcesso}`,origin:'http://localhost:5173'}})).statusCode).toBe(404);
  });
  it('não emite sessão se a persistência da seleção falhar',async()=>{const c=await cenario();vi.mocked(c.repositorioGestao.emitirSelecao).mockRejectedValue(new Error('banco'));await expect(c.gestao.exigirSelecao(c.usuarioComVinculos)).rejects.not.toBeInstanceOf(SelecaoEscritorioNecessaria);});
});
describe('metadados seguros e atividade',()=>{
  it.each([['Mozilla Chrome/1 Windows','Chrome','Windows'],['Firefox/1 Linux','Firefox','Linux'],['Safari/1 iPhone','Safari','iOS'],['Chrome/1 Edg/1 Windows','Edge','Windows'],['<script>\nmalicioso','Desconhecido','Desconhecido']])('normaliza %s', (agente,navegador,dispositivo)=>{expect(capturarMetadadosSessao(agente,'192.168.2.5')).toEqual({navegador,dispositivo,ipMascarado:'192.168.*.*'});});
  it.each(['::1','2001:db8::1234','::ffff:127.0.0.1','invalido'])('nunca expõe IP completo %s',ip=>{expect(capturarMetadadosSessao('x'.repeat(10000),ip).ipMascarado).not.toBe(ip);});
  it('domínio rejeita metadados com controle e preserva cópia defensiva',async()=>{const c=await cenario();await c.login();const estado=[...c.sessoes.values()][0].obterEstadoAtualDaSessao();expect(()=>Sessao.restaurar({...estado,metadados:{...METADADOS,navegador:'x\n'}})).toThrow();const sessao=Sessao.restaurar({...estado,metadados:METADADOS});const copia=sessao.obterEstadoAtualDaSessao();copia.metadados!.navegador='Outro';expect(sessao.obterEstadoAtualDaSessao().metadados).toEqual(METADADOS);});
  it.each([0,299000,300001])('só tenta escrita após cinco minutos: %s ms',async atraso=>{
    const c=await cenario();await c.login();const sessao=[...c.sessoes.values()][0];
    const usuario=c.usuarioComVinculos.usuario;const escritorio=c.usuarioComVinculos.vinculos[0].escritorio;
    const registro={...converterSessaoEmRegistroPrisma(sessao),lastActivityAt:new Date(Date.now()-atraso),user:{id:usuario.id,name:usuario.nome,email:usuario.email,passwordHash:usuario.hashSenha,status:'ACTIVE',createdAt:usuario.criadoEm,updatedAt:usuario.atualizadoEm,memberships:[{office:{id:escritorio.id,name:escritorio.nome,status:'ACTIVE'},role:'OWNER',active:true}]}};
    const prisma={session:{findUnique:vi.fn(async()=>registro),updateMany:vi.fn(async()=>({count:1}))}};
    await new RepositorioAutenticacaoPrisma(prisma as unknown as PrismaClient).buscarSessaoComUsuarioPorId(sessao.id);
    expect(prisma.session.updateMany).toHaveBeenCalledTimes(atraso>=300000?1:0);
    if(atraso>=300000)expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:sessao.id,lastActivityAt:{lte:expect.any(Date)},revokedAt:null})}));
  });
  it('infraestrutura filtra sessões por usuário e classifica expiradas',async()=>{
    const usuario=randomUUID(),atual=randomUUID(),escritorio=randomUUID(),agora=new Date();
    const transacao={session:{findFirst:vi.fn(async()=>({user:{mustChangePassword:false},restricted:false})),findMany:vi.fn(async()=>[{id:atual,office:{id:escritorio,name:'Primeiro'},browser:'Chrome',device:'Windows',maskedIp:'127.0.*.*',createdAt:agora,lastActivityAt:agora,expiresAt:new Date(0),revokedAt:null}])}};
    const prisma={$transaction:async(funcao:(t:typeof transacao)=>unknown)=>funcao(transacao)};
    const resultado=await new RepositorioGestaoSessoesPrisma(prisma as unknown as PrismaClient).listar({idUsuario:usuario,idSessao:atual,idEscritorioAtivo:escritorio,papel:'PROPRIETARIO'},agora);
    expect(transacao.session.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:usuario}}));expect(resultado[0]).toMatchObject({atual:true,situacao:'EXPIRADA'});expect(JSON.stringify(resultado)).not.toMatch(/Hash|password/);
  });
});

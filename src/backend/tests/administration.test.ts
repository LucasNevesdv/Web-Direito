import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { DadosTokenAcesso } from '../src/application/authentication/authentication-contracts.js';
import { GestaoAdministracao } from '../src/application/administration/manage-administration.js';
import type { FiltroAuditoria, OperacoesAdministracao, RegistroAuditoria, RepositorioAdministracao } from '../src/application/administration/administration-contracts.js';
import { GestaoEquipe } from '../src/application/team/manage-team.js';
import type { MembroEquipe, OperacoesEquipe } from '../src/application/team/team-contracts.js';
import type { PapelVinculoEscritorio } from '../src/domain/memberships/membership.js';
import { registrarRotasAdministracao } from '../src/presentation/administration-routes.js';

const ORIGEM = 'http://localhost:5173';

function preparar(papel: PapelVinculoEscritorio) {
  const contexto: DadosTokenAcesso = { idUsuario: randomUUID(), idSessao: randomUUID(), idEscritorioAtivo: randomUUID(), papel };
  const escritorio = { id: contexto.idEscritorioAtivo, nome: 'Escritório Inicial' };
  const registro: RegistroAuditoria = { id: randomUUID(), ocorridoEm: new Date('2026-11-04T12:00:00Z'), autor: { id: contexto.idUsuario, nome: 'Pessoa' },
    acao: 'CRIADA', tipoEntidade: 'TAREFA', idEntidade: randomUUID(), anterior: null, atual: { titulo: 'x' }, detalhes: null };
  const filtrosRecebidos: FiltroAuditoria[] = [];
  const operacoes: OperacoesAdministracao = {
    autor: { idUsuario: contexto.idUsuario, papel },
    consultarEscritorio: async () => ({ ...escritorio }),
    listarAuditoria: async (filtro) => { filtrosRecebidos.push(filtro); return { registros: [registro], total: 1 }; },
    renomearEscritorio: async (nome) => { escritorio.nome = nome; return { ...escritorio }; },
    exportar: async () => ({ geradoEm: new Date(), escritorio: { ...escritorio, criadoEm: new Date() }, membros: [], tarefas: [], prazos: [], documentos: [], auditoria: [] }),
  };
  const repositorio: RepositorioAdministracao = { executar: async (_contexto, operacao) => operacao(operacoes) };
  const gestao = new GestaoAdministracao(repositorio, { validarTokenDeAcesso: async () => contexto });
  const servidor = Fastify();
  registrarRotasAdministracao(servidor, gestao, ORIGEM);
  return { servidor, escritorio, filtrosRecebidos };
}
const leitura = { authorization: 'Bearer token' };
const escrita = { authorization: 'Bearer token', origin: ORIGEM };

describe('rotas de administração', () => {
  it('exige token e restringe a auditoria a proprietário e administrador', async () => {
    const dono = preparar('PROPRIETARIO');
    expect((await dono.servidor.inject({ method: 'GET', url: '/api/v1/administracao/auditoria' })).statusCode).toBe(401);
    for (const papel of ['ADVOGADO', 'ESTAGIARIO', 'SECRETARIO'] as const) {
      const resposta = await preparar(papel).servidor.inject({ method: 'GET', url: '/api/v1/administracao/auditoria', headers: leitura });
      expect(resposta.statusCode).toBe(403);
      expect(resposta.json().erro).toBe('PROIBIDO');
    }
    const admin = await preparar('ADMINISTRADOR').servidor.inject({ method: 'GET', url: '/api/v1/administracao/auditoria', headers: leitura });
    expect(admin.statusCode).toBe(200);
    expect(admin.headers['cache-control']).toBe('no-store');
  });

  it('valida e repassa filtros e paginação da auditoria', async () => {
    const c = preparar('PROPRIETARIO');
    const consultar = (query: string) => c.servidor.inject({ method: 'GET', url: `/api/v1/administracao/auditoria?${query}`, headers: leitura });
    for (const invalida of ['tamanhoPagina=51', 'tipoEntidade=CLIENTE_X', 'idUsuario=nao-uuid', 'de=ontem', 'extra=1', 'de=2026-11-05T00:00:00Z&ate=2026-11-01T00:00:00Z']) {
      expect((await consultar(invalida)).statusCode, invalida).toBe(400);
    }
    const idUsuario = randomUUID();
    const resposta = await consultar(`pagina=2&tamanhoPagina=10&tipoEntidade=DOCUMENTO&acao=BAIXADO&idUsuario=${idUsuario}&de=2026-11-01T00:00:00.000Z`);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ total: 1, pagina: 2, tamanhoPagina: 10, registros: [{ acao: 'CRIADA', tipoEntidade: 'TAREFA' }] });
    expect(c.filtrosRecebidos.at(-1)).toEqual({ pagina: 2, tamanhoPagina: 10, tipoEntidade: 'DOCUMENTO', acao: 'BAIXADO', idUsuario, de: new Date('2026-11-01T00:00:00.000Z') });
  });

  it('renomeia o escritório exigindo origem, corpo estrito e nome válido', async () => {
    const c = preparar('ADMINISTRADOR');
    const renomear = (payload: object, headers: Record<string, string> = escrita) => c.servidor.inject({ method: 'PATCH', url: '/api/v1/administracao/escritorio', headers, payload });
    expect((await renomear({ nome: 'Novo Nome' }, { authorization: 'Bearer token', origin: 'https://malicioso.example' })).statusCode).toBe(403);
    expect((await renomear({ nome: 'Novo Nome', extra: true })).statusCode).toBe(400);
    expect((await renomear({ nome: 'x' })).statusCode).toBe(400);
    expect((await renomear({ nome: 'n'.repeat(121) })).statusCode).toBe(400);
    const ok = await renomear({ nome: '  Silva & Souza Advogados  ' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().nome).toBe('Silva & Souza Advogados');
    expect((await c.servidor.inject({ method: 'GET', url: '/api/v1/administracao/escritorio', headers: leitura })).json().nome).toBe('Silva & Souza Advogados');
    expect((await preparar('ADVOGADO').servidor.inject({ method: 'PATCH', url: '/api/v1/administracao/escritorio', headers: escrita, payload: { nome: 'Outro' } })).statusCode).toBe(403);
  });

  it('exporta os dados como anexo JSON somente para o proprietário', async () => {
    const dono = await preparar('PROPRIETARIO').servidor.inject({ method: 'GET', url: '/api/v1/administracao/exportacao', headers: leitura });
    expect(dono.statusCode).toBe(200);
    expect(dono.headers['content-type']).toMatch(/^application\/json/);
    expect(dono.headers['content-disposition']).toMatch(/^attachment; filename="webdireito-exportacao-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(dono.json().escritorio.nome).toBe('Escritório Inicial');
    expect((await preparar('ADMINISTRADOR').servidor.inject({ method: 'GET', url: '/api/v1/administracao/exportacao', headers: leitura })).statusCode).toBe(403);
  });
});

describe('proteção do proprietário (RF-115)', () => {
  function equipeCom(papelAutor: PapelVinculoEscritorio) {
    const autor = { idUsuario: randomUUID(), papel: papelAutor, permissoes: ['EQUIPE_VISUALIZAR', 'EQUIPE_CADASTRAR_USUARIO', 'EQUIPE_ALTERAR_USUARIO', 'EQUIPE_DEFINIR_PERMISSOES', 'EQUIPE_ATIVAR_INATIVAR_USUARIO'] };
    const dono: MembroEquipe = { id: randomUUID(), idUsuario: randomUUID(), nome: 'Dono', email: 'dono@example.test', papel: 'PROPRIETARIO', permissoes: [],
      estaAtivo: true, deveAlterarSenha: false, criadoEm: new Date(), versao: 0 };
    const alterar = vi.fn(async (anterior: MembroEquipe) => anterior);
    const operacoes = { autor, consultar: async () => dono, alterar } as unknown as OperacoesEquipe;
    const tokens = { validarTokenDeAcesso: async () => ({ idUsuario: autor.idUsuario, idSessao: randomUUID(), idEscritorioAtivo: randomUUID(), papel: papelAutor }), criarTokenDeAcesso: async () => '' };
    const equipe = new GestaoEquipe({ executar: async (_c, operacao) => operacao(operacoes) }, tokens, { gerarHashDaSenha: async () => '', compararSenhaComHash: async () => false });
    return { equipe, dono, alterar };
  }
  it.each(['PROPRIETARIO', 'ADMINISTRADOR'] as const)('%s não inativa nem rebaixa o proprietário', async (papel) => {
    const { equipe, dono, alterar } = equipeCom(papel);
    await expect(equipe.definirSituacao('token', dono.id, false, 0)).rejects.toMatchObject({ codigo: 'PROIBIDO' });
    await expect(equipe.alterar('token', dono.id, { papel: 'ADVOGADO', permissoes: [], versao: 0 })).rejects.toMatchObject({ codigo: 'PROIBIDO' });
    expect(alterar).not.toHaveBeenCalled();
  });
});

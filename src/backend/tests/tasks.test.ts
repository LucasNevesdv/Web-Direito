import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { dataCivilValida, hojeNoFuso, somarDias } from '../src/application/tasks/civil-date.js';
import { GestaoTarefas } from '../src/application/tasks/manage-tasks.js';
import { ErroTarefas } from '../src/application/tasks/task-policy.js';
import { LembretesDePrazos, type EnvioLembrete, type RepositorioLembretes } from '../src/application/tasks/reminders.js';
import type { AutorEscritorio, EstadoPrazo, EstadoTarefa, OperacoesTarefas, PrazoJudicial, Tarefa } from '../src/application/tasks/task-contracts.js';
import { ErroEnvioEmail } from '../src/application/passwords/recovery-email-jobs.js';
import type { PapelVinculoEscritorio } from '../src/domain/memberships/membership.js';

const AGORA = new Date('2026-10-11T15:00:00Z');
const membros = { autor: randomUUID(), outro: randomUUID(), inativo: randomUUID() };
const pessoa = (id: string) => ({ id, nome: id.slice(0, 4) });

// Repositório em memória que aplica os estados recebidos, para exercitar as regras reais do caso de uso.
function preparar(papel: PapelVinculoEscritorio = 'ADVOGADO', idUsuario = membros.autor) {
  const autor: AutorEscritorio = { idUsuario, papel };
  const tarefas = new Map<string, Tarefa>(), prazos = new Map<string, PrazoJudicial>(), historico: Array<{ id: string; acao: string }> = [];
  const aplicarTarefa = (id: string, estado: EstadoTarefa, base?: Tarefa): Tarefa => ({ id, titulo: estado.titulo, descricao: estado.descricao, situacao: estado.situacao,
    prioridade: estado.prioridade, responsavel: pessoa(estado.idResponsavel), revisor: estado.idRevisor ? pessoa(estado.idRevisor) : null,
    criador: base?.criador ?? pessoa(autor.idUsuario), prazoInterno: estado.prazoInterno, vinculo: estado.vinculo,
    conclusao: estado.conclusao ? { em: estado.conclusao.em, autor: pessoa(estado.conclusao.idAutor), observacao: estado.conclusao.observacao } : null,
    checklist: base?.checklist ?? [], versao: (base?.versao ?? -1) + 1, criadoEm: AGORA, atualizadoEm: AGORA });
  const aplicarPrazo = (id: string, estado: EstadoPrazo, base?: PrazoJudicial): PrazoJudicial => ({ id, descricao: estado.descricao, dataLimite: estado.dataLimite,
    origem: estado.origem, detalhesOrigem: estado.detalhesOrigem, situacao: estado.situacao, responsavel: pessoa(estado.idResponsavel),
    confirmadoPor: pessoa(estado.confirmacao.idAutor), confirmadoEm: estado.confirmacao.em, idTarefa: estado.idTarefa, vinculo: estado.vinculo,
    conclusao: estado.conclusao ? { em: estado.conclusao.em, autor: pessoa(estado.conclusao.idAutor), observacao: estado.conclusao.observacao } : null,
    versao: (base?.versao ?? -1) + 1, criadoEm: AGORA, atualizadoEm: AGORA });
  const naoEncontrado = () => new ErroTarefas('NAO_ENCONTRADO');
  const operacoes: OperacoesTarefas = {
    autor,
    vinculos: { existe: vi.fn(async () => false), pesquisar: vi.fn(async () => []) },
    membroAtivo: async (id) => id === membros.autor || id === membros.outro,
    listarMembros: async () => [pessoa(membros.autor), pessoa(membros.outro)],
    listarTarefas: vi.fn(async () => ({ tarefas: [...tarefas.values()], total: tarefas.size })),
    consultarTarefa: async (id) => { const tarefa = tarefas.get(id); if (!tarefa) throw naoEncontrado(); return tarefa; },
    criarTarefa: async (estado) => { const tarefa = aplicarTarefa(randomUUID(), estado); tarefas.set(tarefa.id, tarefa); historico.push({ id: tarefa.id, acao: 'CRIADA' }); return tarefa; },
    alterarTarefa: async (anterior, estado, acao) => { const tarefa = aplicarTarefa(anterior.id, estado, anterior); tarefas.set(tarefa.id, tarefa); historico.push({ id: tarefa.id, acao }); return tarefa; },
    alterarChecklist: async (anterior, alteracao) => {
      const checklist = alteracao.tipo === 'ADICIONAR' ? [...anterior.checklist, { id: randomUUID(), titulo: alteracao.titulo, concluido: false, concluidoEm: null, concluidoPor: null, posicao: anterior.checklist.length }]
        : alteracao.tipo === 'REMOVER' ? anterior.checklist.filter((item) => item.id !== alteracao.idItem)
          : anterior.checklist.map((item) => item.id === alteracao.idItem ? { ...item, concluido: alteracao.concluido } : item);
      const tarefa = { ...anterior, checklist, versao: anterior.versao + 1 }; tarefas.set(tarefa.id, tarefa); return tarefa;
    },
    historicoTarefa: async () => [],
    listarPrazos: vi.fn(async (filtro) => { const lista = [...prazos.values()].filter((prazo) => (!filtro.situacao || prazo.situacao === filtro.situacao) && (!filtro.ate || prazo.dataLimite <= filtro.ate)); return { prazos: lista, total: lista.length }; }),
    consultarPrazo: async (id) => { const prazo = prazos.get(id); if (!prazo) throw naoEncontrado(); return prazo; },
    criarPrazo: async (estado) => { const prazo = aplicarPrazo(randomUUID(), estado); prazos.set(prazo.id, prazo); return prazo; },
    alterarPrazo: async (anterior, estado, acao) => { const prazo = aplicarPrazo(anterior.id, estado, anterior); prazos.set(prazo.id, prazo); historico.push({ id: prazo.id, acao }); return prazo; },
    historicoPrazo: async () => [],
    contarTarefasDoUsuario: async () => ({ hoje: 1, atrasadas: 2, futuras: 3 }),
    listarNotificacoes: async () => ({ notificacoes: [], naoLidas: 4 }),
    marcarNotificacaoLida: async () => undefined,
  };
  const gestao = new GestaoTarefas({ executar: async (_contexto, operacao) => operacao(operacoes) },
    { validarTokenDeAcesso: async () => ({ idUsuario, idSessao: randomUUID(), idEscritorioAtivo: randomUUID(), papel }) },
    { fusoHorario: 'America/Sao_Paulo', diasPrazoCritico: 3 }, () => AGORA);
  const dadosTarefa = { titulo: '  Protocolar petição  ', descricao: '', prioridade: 'ALTA' as const, idResponsavel: membros.autor, idRevisor: membros.outro,
    prazoInterno: '2026-10-12', vinculo: null };
  const dadosPrazo = { descricao: 'Contestação', dataLimite: '2026-10-13', origem: 'INTIMACAO' as const, detalhesOrigem: '', idResponsavel: membros.outro, idTarefa: null, vinculo: null };
  return { gestao, operacoes, historico, dadosTarefa, dadosPrazo };
}

describe('datas civis', () => {
  it('valida datas reais e calcula o dia no fuso do escritório', () => {
    expect(dataCivilValida('2026-02-29')).toBe(false); expect(dataCivilValida('2028-02-29')).toBe(true);
    expect(hojeNoFuso('America/Sao_Paulo', new Date('2026-10-12T02:30:00Z'))).toBe('2026-10-11');
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
  });
});

describe('tarefas', () => {
  it('cria tarefa normalizada com responsável e revisor ativos', async () => {
    const c = preparar();
    const tarefa = await c.gestao.criarTarefa('token', c.dadosTarefa);
    expect(tarefa).toMatchObject({ titulo: 'Protocolar petição', situacao: 'PENDENTE', prioridade: 'ALTA', prazoInterno: '2026-10-12', revisor: { id: membros.outro } });
  });
  it('cria tarefa vinculada a cliente existente no mesmo escritório e rejeita cliente de outro escritório (RF-029/030)', async () => {
    const c = preparar();
    const idClienteMesmoEscritorio = randomUUID();
    const idClienteOutroEscritorio = randomUUID();
    c.operacoes.vinculos.existe = vi.fn(async (vinculo) => vinculo.tipo === 'CLIENTE' && vinculo.id === idClienteMesmoEscritorio);

    const tarefa = await c.gestao.criarTarefa('token', {
      ...c.dadosTarefa,
      vinculo: { tipo: 'CLIENTE', id: idClienteMesmoEscritorio },
    });
    expect(tarefa.vinculo).toEqual({ tipo: 'CLIENTE', id: idClienteMesmoEscritorio });

    await expect(
      c.gestao.criarTarefa('token', {
        ...c.dadosTarefa,
        vinculo: { tipo: 'CLIENTE', id: idClienteOutroEscritorio },
      }),
    ).rejects.toMatchObject({ codigo: 'VINCULO_NAO_ENCONTRADO' });
  });
  it.each([
    [{ idResponsavel: membros.inativo }, 'RESPONSAVEL_INVALIDO'], [{ idRevisor: membros.autor }, 'DADOS_INVALIDOS'],
    [{ prazoInterno: '2026-02-30' }, 'DADOS_INVALIDOS'], [{ titulo: 'ab' }, 'DADOS_INVALIDOS'],
    [{ vinculo: { tipo: 'PROCESSO' as const, id: randomUUID() } }, 'VINCULO_NAO_ENCONTRADO'],
  ])('rejeita dados inválidos (%#)', async (alteracao, codigo) => {
    const c = preparar();
    await expect(c.gestao.criarTarefa('token', { ...c.dadosTarefa, ...alteracao })).rejects.toMatchObject({ codigo });
  });
  it('conclui registrando data, autor e observação; tarefa concluída não é editada e reabertura preserva histórico', async () => {
    const c = preparar();
    const criada = await c.gestao.criarTarefa('token', c.dadosTarefa);
    const concluida = await c.gestao.alterarSituacaoTarefa('token', criada.id, { situacao: 'CONCLUIDA', observacao: ' Protocolo 123 ', versao: criada.versao });
    expect(concluida.conclusao).toEqual({ em: AGORA, autor: pessoa(membros.autor), observacao: 'Protocolo 123' });
    await expect(c.gestao.alterarTarefa('token', criada.id, { ...c.dadosTarefa, versao: concluida.versao })).rejects.toMatchObject({ codigo: 'TAREFA_ENCERRADA' });
    await expect(c.gestao.alterarChecklist('token', criada.id, { tipo: 'ADICIONAR', titulo: 'x' }, concluida.versao)).rejects.toMatchObject({ codigo: 'TAREFA_ENCERRADA' });
    await expect(c.gestao.alterarSituacaoTarefa('token', criada.id, { situacao: 'EM_ANDAMENTO', versao: concluida.versao })).rejects.toMatchObject({ codigo: 'TRANSICAO_INVALIDA' });
    const reaberta = await c.gestao.alterarSituacaoTarefa('token', criada.id, { situacao: 'PENDENTE', versao: concluida.versao });
    expect(reaberta.conclusao).toBeNull();
    expect(c.historico.map((evento) => evento.acao)).toEqual(['CRIADA', 'CONCLUIDA', 'REABERTA']);
  });
  it('rejeita versão desatualizada', async () => {
    const c = preparar();
    const criada = await c.gestao.criarTarefa('token', c.dadosTarefa);
    await expect(c.gestao.alterarSituacaoTarefa('token', criada.id, { situacao: 'EM_ANDAMENTO', versao: criada.versao + 1 })).rejects.toMatchObject({ codigo: 'CONFLITO' });
  });
  it('somente envolvidos ou gestores alteram; somente criador ou gestor cancela', async () => {
    const dono = preparar('ADVOGADO');
    const criada = await dono.gestao.criarTarefa('token', { ...dono.dadosTarefa, idRevisor: null });
    const estranho = preparar('ESTAGIARIO', membros.outro);
    await estranho.operacoes.criarTarefa({ ...criada, idResponsavel: membros.autor, idRevisor: null, conclusao: null });
    const [tarefaAlheia] = (await estranho.operacoes.listarTarefas({ periodo: 'TODAS', hoje: '', pagina: 1, tamanhoPagina: 1 })).tarefas;
    Object.assign(tarefaAlheia, { criador: pessoa(membros.autor) });
    await expect(estranho.gestao.alterarSituacaoTarefa('token', tarefaAlheia.id, { situacao: 'EM_ANDAMENTO', versao: tarefaAlheia.versao })).rejects.toMatchObject({ codigo: 'PROIBIDO' });
    Object.assign(tarefaAlheia, { responsavel: pessoa(membros.outro) });
    await estranho.gestao.alterarSituacaoTarefa('token', tarefaAlheia.id, { situacao: 'EM_ANDAMENTO', versao: tarefaAlheia.versao });
    const atual = await estranho.operacoes.consultarTarefa(tarefaAlheia.id);
    await expect(estranho.gestao.alterarSituacaoTarefa('token', atual.id, { situacao: 'CANCELADA', versao: atual.versao })).rejects.toMatchObject({ codigo: 'PROIBIDO' });
  });
  it('gerencia checklist dentro do limite', async () => {
    const c = preparar();
    let tarefa = await c.gestao.criarTarefa('token', c.dadosTarefa);
    tarefa = await c.gestao.alterarChecklist('token', tarefa.id, { tipo: 'ADICIONAR', titulo: 'Juntar procuração' }, tarefa.versao);
    tarefa = await c.gestao.alterarChecklist('token', tarefa.id, { tipo: 'MARCAR', idItem: tarefa.checklist[0].id, concluido: true }, tarefa.versao);
    expect(tarefa.checklist[0].concluido).toBe(true);
    await expect(c.gestao.alterarChecklist('token', tarefa.id, { tipo: 'REMOVER', idItem: randomUUID() }, tarefa.versao)).rejects.toMatchObject({ codigo: 'NAO_ENCONTRADO' });
  });
});

describe('prazos judiciais', () => {
  it('advogado registra prazo confirmado, separado da tarefa, e o painel o destaca como crítico', async () => {
    const c = preparar('ADVOGADO');
    const prazo = await c.gestao.criarPrazo('token', c.dadosPrazo);
    expect(prazo).toMatchObject({ situacao: 'PENDENTE', origem: 'INTIMACAO', confirmadoPor: pessoa(membros.autor), confirmadoEm: AGORA, critico: true, vencido: false });
    const painel = await c.gestao.painel('token');
    expect(painel).toMatchObject({ hoje: '2026-10-11', minhasTarefas: { hoje: 1, atrasadas: 2, futuras: 3 }, totalPrazosCriticos: 1, notificacoesNaoLidas: 4 });
    expect(c.operacoes.listarPrazos).toHaveBeenCalledWith(expect.objectContaining({ situacao: 'PENDENTE', ate: '2026-10-14' }));
  });
  it.each(['ESTAGIARIO', 'SECRETARIO'] as const)('%s não registra prazo judicial', async (papel) => {
    const c = preparar(papel);
    await expect(c.gestao.criarPrazo('token', c.dadosPrazo)).rejects.toMatchObject({ codigo: 'PROIBIDO' });
  });
  it('exige detalhar origem OUTRA e reconfirma ao alterar a data', async () => {
    const c = preparar('ADMINISTRADOR');
    await expect(c.gestao.criarPrazo('token', { ...c.dadosPrazo, origem: 'OUTRA' })).rejects.toMatchObject({ codigo: 'DADOS_INVALIDOS' });
    const prazo = await c.gestao.criarPrazo('token', c.dadosPrazo);
    const alterado = await c.gestao.alterarPrazo('token', prazo.id, { ...c.dadosPrazo, dataLimite: '2026-11-30', versao: prazo.versao });
    expect(alterado).toMatchObject({ dataLimite: '2026-11-30', critico: false });
    expect(c.historico.at(-1)?.acao).toBe('DATA_ALTERADA');
  });
  it('responsável sem papel jurídico marca cumprimento, mas não cancela', async () => {
    const advogado = preparar('ADVOGADO');
    const prazo = await advogado.gestao.criarPrazo('token', advogado.dadosPrazo);
    const secretario = preparar('SECRETARIO', membros.outro);
    await secretario.operacoes.criarPrazo({ ...advogado.dadosPrazo, situacao: 'PENDENTE', conclusao: null, confirmacao: { em: AGORA, idAutor: membros.autor } });
    const { prazos: [copia] } = await secretario.operacoes.listarPrazos({ pagina: 1, tamanhoPagina: 1 });
    await expect(secretario.gestao.alterarSituacaoPrazo('token', copia.id, { situacao: 'CANCELADO', versao: copia.versao })).rejects.toMatchObject({ codigo: 'PROIBIDO' });
    const cumprido = await secretario.gestao.alterarSituacaoPrazo('token', copia.id, { situacao: 'CUMPRIDO', observacao: 'Protocolado', versao: copia.versao });
    expect(cumprido).toMatchObject({ situacao: 'CUMPRIDO', critico: false, conclusao: { autor: pessoa(membros.outro), observacao: 'Protocolado' } });
    await expect(advogado.gestao.alterarPrazo('token', prazo.id, { ...advogado.dadosPrazo, versao: prazo.versao + 5 })).rejects.toMatchObject({ codigo: 'CONFLITO' });
  });
});

describe('lembretes', () => {
  const envio: EnvioLembrete = { id: randomUUID(), idReserva: randomUUID(), tentativas: 1, email: 'pessoa@example.test', nome: 'Pessoa <b>', escritorio: 'Escritório',
    tipo: 'PRAZO_CRITICO', escalonada: true, titulo: 'Contestação', dataLimite: '2026-10-13' };
  function preparar(falha?: Error) {
    const repositorio: RepositorioLembretes = { gerarLembretes: vi.fn(async () => 2), reservarEnvios: vi.fn(async () => [envio]),
      concluirEnvio: vi.fn(async () => undefined), registrarFalha: vi.fn(async () => undefined) };
    const email = { enviarEmail: vi.fn(async () => { if (falha) throw falha; }) };
    const politica = { fusoHorario: 'America/Sao_Paulo', diasPrazoCritico: 3, maximoTentativas: 3, atrasoInicialSegundos: 30, atrasoMaximoSegundos: 3600 };
    return { repositorio, email, lembretes: new LembretesDePrazos(repositorio, email, 'https://app.example.test', politica, () => AGORA) };
  }
  it('gera janela no fuso do escritório e envia e-mail escapado com motivo do escalonamento', async () => {
    const c = preparar();
    await c.lembretes.gerar();
    expect(c.repositorio.gerarLembretes).toHaveBeenCalledWith({ hoje: '2026-10-11', limiteTarefasProximas: '2026-10-12', limitePrazosCriticos: '2026-10-14' });
    expect(await c.lembretes.enviarPendentes(60, new AbortController().signal)).toBe(1);
    const [mensagem] = c.email.enviarEmail.mock.calls[0] as unknown as [{ html: string; texto: string; assunto: string }];
    expect(mensagem.html).toContain('Pessoa &lt;b&gt;'); expect(mensagem.texto).toContain('administrar o escritório');
    expect(mensagem.texto).toContain('13/10/2026'); expect(mensagem.texto).toContain('https://app.example.test/prazos');
    expect(c.repositorio.concluirEnvio).toHaveBeenCalledWith(envio);
  });
  it('agenda nova tentativa em falha transitória e encerra em falha definitiva', async () => {
    const transitoria = preparar(new ErroEnvioEmail(false));
    await transitoria.lembretes.enviarPendentes(60, new AbortController().signal);
    expect(transitoria.repositorio.registrarFalha).toHaveBeenCalledWith(envio, false, 30);
    const definitiva = preparar(new ErroEnvioEmail(true));
    await definitiva.lembretes.enviarPendentes(60, new AbortController().signal);
    expect(definitiva.repositorio.registrarFalha).toHaveBeenCalledWith(envio, true, 30);
    expect(definitiva.repositorio.concluirEnvio).not.toHaveBeenCalled();
  });
});

describe('rotas de tarefas', () => {
  it('valida corpo estrito, mapeia erros de negócio e exige origem em escritas', async () => {
    const { default: Fastify } = await import('fastify');
    const { registrarRotasTarefas } = await import('../src/presentation/task-routes.js');
    const c = preparar();
    const servidor = Fastify();
    registrarRotasTarefas(servidor, c.gestao, 'http://localhost:5173');
    const cabecalhos = { authorization: 'Bearer token', origin: 'http://localhost:5173' };
    const criar = (payload: object, headers: Record<string, string> = cabecalhos) => servidor.inject({ method: 'POST', url: '/api/v1/tarefas', headers, payload });
    expect((await criar({ ...c.dadosTarefa, campoExtra: true })).statusCode).toBe(400);
    expect((await criar({ ...c.dadosTarefa, idResponsavel: membros.inativo })).json()).toMatchObject({ erro: 'RESPONSAVEL_INVALIDO' });
    expect((await criar(c.dadosTarefa, { authorization: 'Bearer token', origin: 'https://malicioso.example' })).statusCode).toBe(403);
    const criada = await criar(c.dadosTarefa);
    expect(criada.statusCode).toBe(201);
    const lista = await servidor.inject({ method: 'GET', url: '/api/v1/tarefas?periodo=ATRASADAS&prioridade=ALTA', headers: { authorization: 'Bearer token' } });
    expect(lista.statusCode).toBe(200); expect(lista.headers['cache-control']).toBe('no-store');
    expect((await servidor.inject({ method: 'GET', url: `/api/v1/tarefas/${randomUUID()}`, headers: { authorization: 'Bearer token' } })).statusCode).toBe(404);
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarClienteAutenticado, renderizarComCliente, respostaJson } from '../../shared/testing';
import { PaginaPainel } from '../dashboard/dashboard-page';
import { PaginaPrazos } from './deadlines-page';
import { PaginaTarefas } from './tasks-page';

const membros = [{ id: 'usuario-1', nome: 'Maria' }, { id: 'usuario-2', nome: 'João' }];
const configuracao = { hoje: '2026-10-11', diasPrazoCritico: 3, podeGerirPrazos: true, idUsuario: 'usuario-1', membros };
const tarefa = { id: 'tarefa-1', titulo: 'Protocolar petição', descricao: '', situacao: 'PENDENTE', prioridade: 'ALTA', responsavel: membros[0], revisor: null,
  criador: membros[0], prazoInterno: '2026-10-10', vinculo: null, conclusao: null, checklist: [], versao: 3, criadoEm: '2026-10-01T12:00:00Z', podeEditar: true };
const prazo = { id: 'prazo-1', descricao: 'Contestação', dataLimite: '2026-10-13', origem: 'INTIMACAO', detalhesOrigem: '', situacao: 'PENDENTE', responsavel: membros[1],
  confirmadoPor: membros[0], confirmadoEm: '2026-10-01T12:00:00Z', idTarefa: null, vinculo: null, conclusao: null, versao: 0, critico: true, vencido: false };
const corpo = (opcoes?: RequestInit) => JSON.parse(String(opcoes?.body));

beforeEach(() => { window.history.replaceState(null, '', '/tarefas'); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('links de entrada do Dashboard', () => {
  it('mantém período e responsável e abre tarefa fora da página atual', async () => {
    window.history.replaceState(null, '', '/tarefas?periodo=FUTURAS&ate=2030-01-22&idResponsavel=usuario-2&id=tarefa-1');
    const { cliente, requisicao } = await criarClienteAutenticado((url) => {
      if (url.endsWith('/configuracao')) return respostaJson(configuracao);
      if (url.startsWith('/api/v1/tarefas?')) return respostaJson({ tarefas: [], total: 0 });
      if (url === '/api/v1/tarefas/tarefa-1') return respostaJson(tarefa);
      if (url.endsWith('/historico')) return respostaJson([]);
      return respostaJson({}, 404);
    });
    renderizarComCliente(cliente, <PaginaTarefas />);
    expect(await screen.findByRole('heading', { name: 'Protocolar petição' })).toBeTruthy();
    const consulta = requisicao.mock.calls.find(([u]) => String(u).startsWith('/api/v1/tarefas?'))!;
    const parametros = new URL(String(consulta[0]), 'http://localhost').searchParams;
    expect(parametros.get('periodo')).toBe('FUTURAS'); expect(parametros.get('ate')).toBe('2030-01-22');
    expect(parametros.get('idResponsavel')).toBe('usuario-2');
    fireEvent.click(screen.getByRole('button', { name: 'Remover limite de data' }));
    await waitFor(() => expect(requisicao.mock.calls.filter(([u]) => String(u).startsWith('/api/v1/tarefas?')).at(-1)![0]).not.toContain('ate='));
  });
  it('abre prazo por ID e mantém os limites da lista de prazos próximos', async () => {
    window.history.replaceState(null, '', '/prazos?id=prazo-1&depois=2030-01-18&ate=2030-01-22&idResponsavel=usuario-2');
    const { cliente, requisicao } = await criarClienteAutenticado((url) => {
      if (url.endsWith('/configuracao')) return respostaJson(configuracao);
      if (url.startsWith('/api/v1/prazos?')) return respostaJson({ prazos: [], total: 0 });
      if (url === '/api/v1/prazos/prazo-1') return respostaJson(prazo);
      if (url.endsWith('/historico')) return respostaJson([]);
      return respostaJson({}, 404);
    });
    renderizarComCliente(cliente, <PaginaPrazos />);
    expect(await screen.findByRole('heading', { name: 'Contestação' })).toBeTruthy();
    const consulta = requisicao.mock.calls.find(([u]) => String(u).startsWith('/api/v1/prazos?'))!;
    const parametros = new URL(String(consulta[0]), 'http://localhost').searchParams;
    expect(parametros.get('depois')).toBe('2030-01-18'); expect(parametros.get('ate')).toBe('2030-01-22');
    expect(parametros.get('idResponsavel')).toBe('usuario-2');
  });
});

describe('tarefas', () => {
  it('lista tarefas de hoje por padrão, destaca atraso e cria tarefa com campos opcionais nulos', async () => {
    const { cliente, requisicao } = await criarClienteAutenticado((url, opcoes) => {
      if (url.endsWith('/configuracao')) return respostaJson(configuracao);
      if (url.startsWith('/api/v1/tarefas?')) return respostaJson({ tarefas: [tarefa], total: 1 });
      if (url === '/api/v1/tarefas' && opcoes?.method === 'POST') return respostaJson({ ...tarefa, id: 'tarefa-2', titulo: corpo(opcoes).titulo }, 201);
      return respostaJson({}, 404);
    });
    renderizarComCliente(cliente, <PaginaTarefas />);
    expect(await screen.findByText('Protocolar petição')).toBeTruthy();
    expect(screen.getByText(/\(atrasada\)/)).toBeTruthy();
    expect(requisicao.mock.calls.some(([url]) => String(url).includes('periodo=HOJE'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Revisar contrato' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tarefa' }));
    await screen.findByText('Tarefa criada.');
    const envio = requisicao.mock.calls.find(([url, opcoes]) => url === '/api/v1/tarefas' && opcoes?.method === 'POST')!;
    expect(corpo(envio[1])).toEqual({ titulo: 'Revisar contrato', descricao: '', prioridade: 'MEDIA', idResponsavel: 'usuario-1', idRevisor: null, prazoInterno: null, vinculo: null });
  });

  it('conclui com observação e versão atual', async () => {
    const { cliente, requisicao } = await criarClienteAutenticado((url, opcoes) => {
      if (url.endsWith('/configuracao')) return respostaJson(configuracao);
      if (url.startsWith('/api/v1/tarefas?')) return respostaJson({ tarefas: [tarefa], total: 1 });
      if (url === '/api/v1/tarefas/tarefa-1') return respostaJson(tarefa);
      if (url.endsWith('/situacao')) return respostaJson({ ...tarefa, situacao: 'CONCLUIDA', versao: 4, conclusao: { em: '2026-10-11T15:00:00Z', autor: membros[0], observacao: corpo(opcoes).observacao } });
      return respostaJson({}, 404);
    });
    renderizarComCliente(cliente, <PaginaTarefas />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Concluir' }));
    fireEvent.change(screen.getByLabelText('Observação da conclusão (opcional)'), { target: { value: 'Protocolo 123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(/Observação: Protocolo 123/)).toBeTruthy();
    const envio = requisicao.mock.calls.find(([url]) => String(url).endsWith('/situacao'))!;
    expect(corpo(envio[1])).toEqual({ situacao: 'CONCLUIDA', observacao: 'Protocolo 123', versao: 3 });
  });
});

describe('prazos judiciais e painel', () => {
  it('exige confirmação da data antes de registrar prazo', async () => {
    window.history.replaceState(null, '', '/prazos');
    const { cliente, requisicao } = await criarClienteAutenticado((url, opcoes) => {
      if (url.endsWith('/configuracao')) return respostaJson(configuracao);
      if (url.startsWith('/api/v1/prazos?')) return respostaJson({ prazos: [prazo], total: 1 });
      if (url === '/api/v1/prazos' && opcoes?.method === 'POST') return respostaJson(prazo, 201);
      return respostaJson({}, 404);
    });
    renderizarComCliente(cliente, <PaginaPrazos />);
    expect(await screen.findByText('Crítico')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar prazo judicial' }));
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Réplica' } });
    fireEvent.change(screen.getByLabelText('Data limite'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar prazo' }));
    expect(await screen.findByText('Confirme que conferiu a data no documento de origem.')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Confirmo que conferi a data limite no documento de origem.'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar prazo' }));
    await screen.findByText('Prazo judicial registrado e confirmado.');
    const envio = requisicao.mock.calls.find(([url, opcoes]) => url === '/api/v1/prazos' && opcoes?.method === 'POST')!;
    expect(corpo(envio[1])).toMatchObject({ descricao: 'Réplica', dataLimite: '2026-10-20', origem: 'INTIMACAO', idResponsavel: 'usuario-1', idTarefa: null });
  });

  it('painel exibe prazos críticos e marca lembrete como lido', async () => {
    let lida = false;
    const { cliente, requisicao } = await criarClienteAutenticado((url) => {
      if (url.startsWith('/api/v1/painel/resumo?')) {
        const vazio = { total: 0, itens: [], href: '/tarefas' };
        return respostaJson({ hoje: '2026-10-11', ate: '2026-10-18', dias: 7, diasPrazoCritico: 3, fusoHorario: 'America/Sao_Paulo', membros,
          tarefas: { hoje: vazio, atrasadas: vazio, futuras: vazio }, prazosProximos: vazio, compromissos: vazio,
          clientesAtivos: null, casosAtivos: null, casosSemAtividade: null,
          prazosCriticos: { total: 1, href: '/prazos?somenteCriticos=true', itens: [{ id: prazo.id, titulo: prazo.descricao, data: prazo.dataLimite, href: '/prazos?id=prazo-1' }] } });
      }
      if (url === '/api/v1/notificacoes') return respostaJson({ notificacoes: [{ id: 'n-1', tipo: 'PRAZO_CRITICO', escalonada: true, titulo: 'Contestação',
        dataLimite: '2026-10-13', idTarefa: null, idPrazo: 'prazo-1', lidaEm: lida ? '2026-10-11T15:00:00Z' : null, criadoEm: '2026-10-11T10:00:00Z' }], naoLidas: lida ? 0 : 1 });
      if (url === '/api/v1/notificacoes/n-1/lida') { lida = true; return respostaJson(null, 204); }
      return respostaJson({}, 404);
    });
    renderizarComCliente(cliente, <PaginaPainel />);
    expect(await screen.findByText('Prazos judiciais críticos (1)')).toBeTruthy();
    expect(screen.getByText(/Prazo judicial crítico \(escalado\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como lido' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Marcar como lido' })).toBeNull());
    expect(requisicao.mock.calls.some(([url, opcoes]) => url === '/api/v1/notificacoes/n-1/lida' && opcoes?.method === 'POST')).toBe(true);
  });
});

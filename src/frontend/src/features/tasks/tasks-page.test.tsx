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
      if (url === '/api/v1/painel') return respostaJson({ hoje: '2026-10-11', diasPrazoCritico: 3, minhasTarefas: { hoje: 1, atrasadas: 2, futuras: 0 },
        prazosCriticos: [prazo], totalPrazosCriticos: 1, notificacoesNaoLidas: lida ? 0 : 1 });
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

// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarClienteAutenticado, renderizarComCliente, respostaJson } from '../../shared/testing';
import { PaginaPainel } from './dashboard-page';

function resumo() {
  const grupo = (rota: string) => ({ total: 0, itens: [] as { id: string; titulo: string; data: string; href: string }[], href: rota });
  return { hoje: '2030-01-15', ate: '2030-01-22', dias: 7, diasPrazoCritico: 3, fusoHorario: 'America/Sao_Paulo',
    responsavel: 'usuario-1', idUsuario: 'usuario-1', membros: [{ id: 'usuario-1', nome: 'Maria' }, { id: 'usuario-2', nome: 'João' }],
    tarefas: { hoje: grupo('/tarefas?periodo=HOJE&idResponsavel=usuario-1'), atrasadas: grupo('/tarefas?periodo=ATRASADAS&idResponsavel=usuario-1'),
      futuras: grupo('/tarefas?periodo=FUTURAS&ate=2030-01-22&idResponsavel=usuario-1') },
    prazosCriticos: grupo('/prazos?somenteCriticos=true'), prazosProximos: grupo('/prazos?depois=2030-01-18&ate=2030-01-22'),
    compromissos: grupo('/agenda?idParticipante=usuario-1'), casosSemAtividade: grupo('/casos?semAtividadeDesdeDias=7'),
    clientesAtivos: { total: 3, href: '/clientes?situacao=ATIVO' }, casosAtivos: { total: 5, href: '/casos?situacao=ATIVO' } };
}
beforeEach(() => { window.history.replaceState(null, '', '/painel'); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('Dashboard RF089–097', () => {
  it('mostra contagem independente da amostra e links de registro e lista filtrada', async () => {
    const dados = resumo(); dados.tarefas.atrasadas.total = 12;
    dados.tarefas.atrasadas.itens = [{ id: 't-1', titulo: 'Preparar petição', data: '2030-01-10', href: '/tarefas?id=t-1' }];
    dados.compromissos.total = 1;
    dados.compromissos.itens = [{ id: 'a-1', titulo: 'Audiência', data: '2030-01-16T01:00:00Z', href: '/agenda?id=a-1' }];
    const { cliente } = await criarClienteAutenticado((url) => respostaJson(url.startsWith('/api/v1/painel/resumo?') ? dados : { notificacoes: [], naoLidas: 0 }));
    renderizarComCliente(cliente, <PaginaPainel />);
    expect(await screen.findByText('Tarefas atrasadas (12)')).toBeTruthy();
    expect(screen.getByText('Exibindo os 1 primeiros de 12 registros.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Preparar petição' }).getAttribute('href')).toBe('/tarefas?id=t-1');
    expect(screen.getByRole('link', { name: 'Ver tarefas futuras' }).getAttribute('href')).toContain('ate=2030-01-22');
    expect(screen.getByRole('link', { name: 'Audiência' }).getAttribute('href')).toBe('/agenda?id=a-1');
    expect(within(screen.getByRole('region', { name: 'Compromissos próximos' })).getByText(/15\/01\/2030.*22:00/)).toBeTruthy();
  });

  it('envia filtros e não mantém dados anteriores quando a nova consulta falha', async () => {
    const { cliente, requisicao } = await criarClienteAutenticado((url) => {
      if (url.includes('dias=30')) return respostaJson({ mensagem: 'Consulta indisponível.' }, 503);
      return respostaJson(url.startsWith('/api/v1/painel/resumo?') ? resumo() : { notificacoes: [], naoLidas: 0 });
    });
    renderizarComCliente(cliente, <PaginaPainel />);
    await screen.findByText('Tarefas para hoje (0)');
    fireEvent.change(screen.getByLabelText('Responsável'), { target: { value: 'usuario-2' } });
    await waitFor(() => expect(requisicao.mock.calls.some(([u]) => String(u).includes('responsavel=usuario-2'))).toBe(true));
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '30' } });
    await screen.findByText('Consulta indisponível.');
    expect(screen.queryByText('Tarefas para hoje (0)')).toBeNull();
    expect(requisicao.mock.calls.some(([u]) => String(u).includes('dias=30&responsavel=usuario-2'))).toBe(true);
  });

  it('descarta resposta antiga que termina depois do filtro mais recente', async () => {
    let terminar!: (r: Response) => void;
    const { cliente, requisicao } = await criarClienteAutenticado((url) => {
      if (url.includes('dias=30')) return new Promise<Response>((resolve) => { terminar = resolve; });
      const dados = resumo(); if (url.includes('dias=90')) dados.tarefas.hoje.total = 9;
      return respostaJson(url.startsWith('/api/v1/painel/resumo?') ? dados : { notificacoes: [], naoLidas: 0 });
    });
    renderizarComCliente(cliente, <PaginaPainel />); await screen.findByText('Tarefas para hoje (0)');
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '30' } });
    await waitFor(() => expect(requisicao.mock.calls.some(([u]) => String(u).includes('dias=30'))).toBe(true));
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '90' } });
    await screen.findByText('Tarefas para hoje (9)');
    await act(async () => { terminar(respostaJson(resumo())); });
    expect(screen.getByText('Tarefas para hoje (9)')).toBeTruthy();
  });

  it('distingue ausência de permissão de zero e mantém o painel se lembretes falham', async () => {
    const { cliente } = await criarClienteAutenticado((url) => {
      if (url === '/api/v1/notificacoes') return respostaJson({ mensagem: 'Lembretes indisponíveis.' }, 503);
      return respostaJson({ ...resumo(), clientesAtivos: null, casosAtivos: null, casosSemAtividade: null });
    });
    renderizarComCliente(cliente, <PaginaPainel />);
    await screen.findByText('Tarefas para hoje (0)');
    expect(screen.getAllByText('Sem permissão para visualizar.')).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Casos sem movimentação' })).toBeNull();
    expect(screen.getByText('Lembretes indisponíveis.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^Clientes ativos/ })).toBeNull();
  });
});

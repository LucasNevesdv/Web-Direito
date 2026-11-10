// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarClienteAutenticado, renderizarComCliente, respostaJson } from '../../shared/testing';
import { PaginaAgenda } from './agenda-page';
import { FormularioCompromisso } from './appointment-form';
import type { Compromisso } from './agenda-types';

const config = { hoje: '2030-01-15', fusoHorario: 'America/Sao_Paulo', idUsuario: 'usuario-1', membros: [{ id: 'usuario-1', nome: 'Maria' }] };
const evento: Compromisso = { id: 'evento-1', titulo: 'Audiência inicial', descricao: '', tipo: 'AUDIENCIA', inicio: '2030-01-15T12:00:00.000Z', fim: '2030-01-15T13:00:00.000Z',
  local: 'Sala 1', linkRemoto: '', participantes: config.membros, criador: config.membros[0], vinculo: null, rotuloVinculo: null, lembreteMinutos: 15,
  situacao: 'AGENDADO', versao: 2, podeEditar: true, podeCancelar: true };
beforeEach(() => window.history.replaceState(null, '', '/agenda'));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Agenda', () => {
  it('impede dois envios enquanto a gravação do compromisso está pendente', async () => {
    let terminar!: (r: Response) => void;
    const aoSalvar = vi.fn();
    const { cliente, requisicao } = await criarClienteAutenticado(() => new Promise<Response>((resolve) => { terminar = resolve; }));
    renderizarComCliente(cliente, <FormularioCompromisso evento={null} configuracao={config} dia={config.hoje} aoSalvar={aoSalvar} aoFechar={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Reunião única' } });
    const form = screen.getByRole('button', { name: 'Salvar compromisso' }).closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    await waitFor(() => expect(requisicao.mock.calls.filter(([u, op]) => u === '/api/v1/agenda' && op?.method === 'POST')).toHaveLength(1));
    await act(async () => { terminar(respostaJson(evento, 201)); });
    await waitFor(() => expect(aoSalvar).toHaveBeenCalledTimes(1));
  });

  it('preserva a janela do painel, mostra lista paginada e retorna ao calendário', async () => {
    const inicio = '2030-01-15T12:00:00.000Z', fim = '2030-04-15T12:00:00.000Z';
    window.history.replaceState(null, '', '/agenda?' + new URLSearchParams({ inicioPainel: inicio, fimPainel: fim, idParticipante: 'usuario-1' }));
    const { cliente, requisicao } = await criarClienteAutenticado((url) => {
      if (url.endsWith('/configuracao')) return respostaJson(config);
      if (url.endsWith('/lembretes')) return respostaJson([]);
      if (url.includes('/itens-civis?')) return respostaJson({ itens: [], total: 0 });
      if (url.includes('/agenda/proximos?') || url.includes('/agenda?')) return respostaJson({ compromissos: [evento], total: 101 });
      return respostaJson({}, 404);
    });
    renderizarComCliente(cliente, <PaginaAgenda />);
    expect(await screen.findByLabelText('Compromissos do painel')).toBeTruthy();
    const url = String(requisicao.mock.calls.find(([u]) => String(u).includes('/agenda/proximos?'))![0]);
    const q = new URL(url, 'http://localhost').searchParams;
    expect(q.get('inicio')).toBe(inicio); expect(q.get('fim')).toBe(fim); expect(q.get('idParticipante')).toBe('usuario-1');
    expect(requisicao.mock.calls.some(([u]) => String(u).includes('/itens-civis?'))).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Próxima página' }));
    await waitFor(() => expect(requisicao.mock.calls.some(([u]) => String(u).includes('pagina=2'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao calendário' }));
    expect(await screen.findByLabelText('Calendário')).toBeTruthy();
    expect(window.location.search).not.toContain('inicioPainel');
  });
  it('abre registro por URL, mostra histórico e permite escolher as três visões e filtros', async () => {
    window.history.replaceState(null, '', '/agenda?id=evento-1');
    const { cliente, requisicao } = await criarClienteAutenticado((url) => {
      if (url.endsWith('/configuracao')) return respostaJson(config);
      if (url.endsWith('/lembretes')) return respostaJson([]);
      if (url.includes('/itens-civis?')) return respostaJson({ itens: [{ id: 'prazo-1', titulo: 'Prazo de contestação', data: '2030-01-15', origem: 'PRAZO', responsavel: config.membros[0] }], total: 1 });
      if (url.includes('/agenda?')) return respostaJson({ compromissos: [evento], total: 1 });
      if (url.endsWith('/historico')) return respostaJson([{ id: 'h1', autor: config.membros[0], acao: 'CRIADO', criadoEm: evento.inicio }]);
      if (url.endsWith('/evento-1')) return respostaJson(evento);
      return respostaJson({}, 404);
    });
    renderizarComCliente(cliente, <PaginaAgenda />);
    expect(await screen.findByRole('heading', { name: 'Audiência inicial' })).toBeTruthy();
    expect(await screen.findByText('Prazo de contestação')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Visualização'), { target: { value: 'DIA' } });
    await waitFor(() => expect(screen.getByLabelText('Calendário').children.length).toBe(1));
    fireEvent.change(screen.getByLabelText('Visualização'), { target: { value: 'MES' } });
    await waitFor(() => expect(screen.getByLabelText('Calendário').children.length).toBe(42));
    fireEvent.change(screen.getByLabelText('Profissional'), { target: { value: 'usuario-1' } });
    fireEvent.change(screen.getByLabelText('Tipo de compromisso'), { target: { value: 'AUDIENCIA' } });
    await waitFor(() => expect(requisicao.mock.calls.some(([url]) => String(url).includes('idParticipante=usuario-1') && String(url).includes('tipo=AUDIENCIA'))).toBe(true));
  });
  it('só reenvia sobreposição após confirmação explícita e envia horários no fuso correto', async () => {
    let tentativas = 0;
    const { cliente, requisicao } = await criarClienteAutenticado((url) => {
      if (url === '/api/v1/agenda') return ++tentativas === 1 ? respostaJson({ erro: 'CONFLITO_HORARIO', mensagem: 'Confirme a sobreposição.' }, 409) : respostaJson(evento, 201);
      return respostaJson([], 200);
    });
    const salvar = vi.fn();
    renderizarComCliente(cliente, <FormularioCompromisso evento={null} configuracao={config} dia={config.hoje} aoSalvar={salvar} aoFechar={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Reunião de equipe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar compromisso' }));
    expect(await screen.findByText('Confirme a sobreposição.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Salvar compromisso' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Confirmo que desejo salvar mesmo com a sobreposição de horários.'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar compromisso' }));
    await waitFor(() => expect(salvar).toHaveBeenCalledOnce());
    const corpo = JSON.parse(String(requisicao.mock.calls.filter(([url]) => String(url) === '/api/v1/agenda').at(-1)?.[1]?.body));
    expect(corpo.confirmarConflito).toBe(true); expect(corpo.inicio).toBe('2030-01-15T12:00:00.000Z');
  });
  it('mostra falha de gravação sem fechar o formulário nem anunciar sucesso', async () => {
    const { cliente } = await criarClienteAutenticado(() => respostaJson({ mensagem: 'Banco indisponível.' }, 503));
    const salvar = vi.fn();
    renderizarComCliente(cliente, <FormularioCompromisso evento={null} configuracao={config} dia={config.hoje} aoSalvar={salvar} aoFechar={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Não perder dados' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar compromisso' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Banco indisponível.');
    expect(salvar).not.toHaveBeenCalled(); expect(screen.getByLabelText('Título')).toHaveProperty('value', 'Não perder dados');
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarClienteAutenticado, IDENTIDADE_TESTE, renderizarComCliente, respostaJson } from '../../shared/testing';
import { PaginaAdministracao } from './admin-page';

const PROPRIETARIO = { ...IDENTIDADE_TESTE, escritorio: { ...IDENTIDADE_TESTE.escritorio, papel: 'PROPRIETARIO' } };
const ADMINISTRADOR = { ...IDENTIDADE_TESTE, escritorio: { ...IDENTIDADE_TESTE.escritorio, papel: 'ADMINISTRADOR' } };
const registro = (acao: string, tipoEntidade: string, nome = 'Maria') => ({ id: `${acao}-${tipoEntidade}`, ocorridoEm: '2026-11-04T12:00:00Z',
  autor: { id: 'usuario-1', nome }, acao, tipoEntidade, idEntidade: 'entidade-1', anterior: null, atual: null, detalhes: null });

function rotasAdministracao(total = 1) {
  return (url: string, opcoes?: RequestInit) => {
    if (url === '/api/v1/administracao/escritorio' && opcoes?.method === 'PATCH') {
      const { nome } = JSON.parse(String(opcoes.body)) as { nome: string };
      return nome.trim().length < 2 ? respostaJson({ erro: 'DADOS_INVALIDOS', mensagem: 'Confira os dados informados.' }, 400) : respostaJson({ id: 'escritorio-1', nome: nome.trim() });
    }
    if (url === '/api/v1/administracao/escritorio') return respostaJson({ id: 'escritorio-1', nome: 'Escritório Teste' });
    if (url.startsWith('/api/v1/administracao/auditoria?')) {
      const pagina = new URL(url, 'http://local').searchParams.get('pagina');
      const registros = pagina === '2' ? [registro('BAIXADO', 'DOCUMENTO', 'João')] : [registro('SESSAO_INICIADA', 'SESSAO')];
      return respostaJson({ registros, total, pagina: Number(pagina), tamanhoPagina: 20 });
    }
    if (url === '/api/v1/administracao/exportacao') return new Response(new Blob(['{}']), { status: 200 });
    return respostaJson({}, 404);
  };
}

beforeEach(() => { window.history.replaceState(null, '', '/administracao'); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('administração', () => {
  it('lista o histórico com filtros e paginação', async () => {
    const { cliente, requisicao } = await criarClienteAutenticado(rotasAdministracao(25), PROPRIETARIO);
    renderizarComCliente(cliente, <PaginaAdministracao />);
    expect(await screen.findByText('Sessão iniciada')).toBeTruthy();
    expect(screen.getByText('Página 1 de 2')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Tipo de registro'), { target: { value: 'DOCUMENTO' } });
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    await waitFor(() => {
      const url = String(requisicao.mock.calls.at(-1)![0]);
      expect(url).toContain('tipoEntidade=DOCUMENTO');
      expect(new URL(url, 'http://local').searchParams.get('de')).toBe(new Date(2026, 10, 1).toISOString());
    });

    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(await screen.findByText('Baixado')).toBeTruthy();
    expect(screen.getByText('João')).toBeTruthy();
    expect(screen.getByText('Página 2 de 2')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Próxima' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('renomeia o escritório e mostra erros da API', async () => {
    const { cliente, requisicao } = await criarClienteAutenticado(rotasAdministracao(), ADMINISTRADOR);
    renderizarComCliente(cliente, <PaginaAdministracao />);
    const campo = await screen.findByLabelText('Nome do escritório') as HTMLInputElement;
    await waitFor(() => expect(campo.value).toBe('Escritório Teste'));

    fireEvent.change(campo, { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByText('Confira os dados informados.')).toBeTruthy();

    fireEvent.change(campo, { target: { value: 'Silva Advogados' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByText('Nome do escritório atualizado.')).toBeTruthy();
    const envio = requisicao.mock.calls.filter(([url, opcoes]) => url === '/api/v1/administracao/escritorio' && opcoes?.method === 'PATCH').at(-1)!;
    expect(JSON.parse(String(envio[1]!.body))).toEqual({ nome: 'Silva Advogados' });
    expect(screen.queryByRole('button', { name: /Exportar dados/ })).toBeNull();
  });

  it('exporta os dados com autenticação quando o usuário é proprietário', async () => {
    const { cliente, requisicao } = await criarClienteAutenticado(rotasAdministracao(), PROPRIETARIO);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:teste'), revokeObjectURL: vi.fn() }));
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderizarComCliente(cliente, <PaginaAdministracao />);
    fireEvent.click(await screen.findByRole('button', { name: 'Exportar dados (JSON)' }));
    await waitFor(() => expect(clique).toHaveBeenCalledOnce());
    const chamada = requisicao.mock.calls.find(([url]) => url === '/api/v1/administracao/exportacao')!;
    expect(new Headers(chamada[1]!.headers).get('Authorization')).toBe('Bearer token-teste');
  });

  it('não consulta a administração quando o papel não permite', async () => {
    const { cliente, requisicao } = await criarClienteAutenticado(rotasAdministracao());
    renderizarComCliente(cliente, <PaginaAdministracao />);
    expect(await screen.findByText('Somente proprietário e administrador acessam a administração do escritório.')).toBeTruthy();
    expect(requisicao.mock.calls.some(([url]) => String(url).startsWith('/api/v1/administracao'))).toBe(false);
  });
});

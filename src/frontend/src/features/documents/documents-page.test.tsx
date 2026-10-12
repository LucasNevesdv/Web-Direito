// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarClienteAutenticado, renderizarComCliente, respostaJson } from '../../shared/testing';
import { PaginaDocumentos } from './documents-page';

const pessoa = { id: 'usuario-1', nome: 'Maria' };
const versao = { numero: 2, nomeOriginal: 'contrato.pdf', tipoConteudo: 'application/pdf', tamanhoBytes: 2048, enviadoPor: pessoa, criadoEm: '2026-10-10T12:00:00Z' };
const documento = { id: 'doc-1', nome: 'Contrato de honorários', descricao: '', categoria: 'CONTRATO', confidencial: false, ativo: true, vinculo: null, versaoAtual: versao,
  criador: pessoa, inativadoEm: null, versao: 5, atualizadoEm: '2026-10-10T12:00:00Z', podeAlterar: true, podeAlterarSituacao: true };

beforeEach(() => { window.history.replaceState(null, '', '/documentos'); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('documentos', () => {
  it('envia metadados antes do arquivo e baixa versão anterior com autenticação', async () => {
    const { cliente, requisicao } = await criarClienteAutenticado((url, opcoes) => {
      if (url.startsWith('/api/v1/documentos?')) return respostaJson({ documentos: [documento], total: 1 });
      if (url === '/api/v1/documentos' && opcoes?.method === 'POST') return respostaJson(documento, 201);
      if (url === '/api/v1/documentos/doc-1') return respostaJson({ ...documento, versoes: [versao, { ...versao, numero: 1, nomeOriginal: 'contrato-antigo.pdf' }] });
      if (url.includes('/download')) return new Response(new Blob(['conteúdo']), { status: 200 });
      return respostaJson({}, 404);
    });
    const criarUrl = vi.fn(() => 'blob:teste');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: criarUrl, revokeObjectURL: vi.fn() }));
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderizarComCliente(cliente, <PaginaDocumentos />);
    expect(await screen.findByText('Contrato de honorários')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar documento' }));
    const arquivo = new File(['pdf'], 'procuracao.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Arquivo'), { target: { files: [arquivo] } });
    expect((screen.getByLabelText('Nome do documento') as HTMLInputElement).value).toBe('procuracao');
    fireEvent.click(screen.getByLabelText(/^Confidencial/));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await screen.findByText('Documento enviado.');
    const envio = requisicao.mock.calls.find(([url, opcoes]) => url === '/api/v1/documentos' && opcoes?.method === 'POST')!;
    const formulario = envio[1]!.body as FormData;
    expect([...formulario.keys()]).toEqual(['nome', 'descricao', 'categoria', 'confidencial', 'arquivo']);
    expect(formulario.get('confidencial')).toBe('true');
    expect(new Headers(envio[1]!.headers).get('Content-Type')).toBeNull();

    fireEvent.click(await screen.findByText('contrato-antigo.pdf').then((celula) => celula.parentElement!.querySelector('button')!));
    await waitFor(() => expect(clique).toHaveBeenCalledOnce());
    const download = requisicao.mock.calls.find(([url]) => String(url).includes('/download'))!;
    expect(download[0]).toBe('/api/v1/documentos/doc-1/download?versao=1');
    expect(new Headers(download[1]!.headers).get('Authorization')).toBe('Bearer token-teste');
  });

  it('inativa somente após confirmação e informa preservação do histórico', async () => {
    const { cliente, requisicao } = await criarClienteAutenticado((url) => {
      if (url.startsWith('/api/v1/documentos?')) return respostaJson({ documentos: [documento], total: 1 });
      if (url === '/api/v1/documentos/doc-1') return respostaJson({ ...documento, versoes: [versao] });
      if (url.endsWith('/inativar')) return respostaJson({ ...documento, ativo: false, versao: 6 });
      return respostaJson({}, 404);
    });
    renderizarComCliente(cliente, <PaginaDocumentos />);
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    expect(screen.getByText(/versões e histórico são preservados/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await screen.findByText('Documento inativado.');
    const envio = requisicao.mock.calls.find(([url]) => String(url).endsWith('/inativar'))!;
    expect(JSON.parse(String(envio[1]!.body))).toEqual({ versao: 5 });
  });
});

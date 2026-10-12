// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClienteAutenticacao } from '../../shared/auth/auth-client';
import { ProvedorAutenticacao } from '../../shared/auth/auth-context';
import { PaginaSenhas } from './password-pages';
const REQUISICAO = vi.fn<typeof fetch>();
let cliente: ClienteAutenticacao;
beforeEach(async () => {
  vi.stubGlobal('fetch', REQUISICAO); REQUISICAO.mockReset().mockResolvedValue(new Response('{}', { status: 401 }));
  cliente = new ClienteAutenticacao(REQUISICAO); await cliente.restaurarSessao(); REQUISICAO.mockReset();
  window.history.replaceState(null, '', '/recuperar-senha');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const renderizar = (finalidade: 'recuperar' | 'redefinir' | 'alterar') => render(<ProvedorAutenticacao cliente={cliente}><PaginaSenhas finalidade={finalidade} /></ProvedorAutenticacao>);
describe('telas de senhas', () => {
  it('valida email por campo antes de enviar', () => {
    renderizar('recuperar'); fireEvent.click(screen.getByRole('button', { name: 'Recuperar senha' }));
    expect(screen.getByRole('alert').textContent).toBe('Informe um e-mail válido.'); expect(REQUISICAO).not.toHaveBeenCalled();
  });
  it('normaliza email, impede duplicidade e mostra confirmação genérica', async () => {
    let concluir!: (r: Response) => void;
    REQUISICAO.mockReturnValue(new Promise((resolver) => { concluir = resolver; }));
    renderizar('recuperar'); fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' PESSOA@EXAMPLE.TEST ' } });
    const formulario = document.querySelector('form')!; fireEvent.submit(formulario); fireEvent.submit(formulario);
    expect(REQUISICAO).toHaveBeenCalledTimes(1); expect(JSON.parse(REQUISICAO.mock.calls[0][1]!.body as string)).toEqual({ email: 'pessoa@example.test' });
    concluir(new Response('{}', { status: 202 })); await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Se houver uma conta elegível'));
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
  it('trata token ausente sem formulário', () => {
    renderizar('redefinir'); expect(screen.getByRole('alert').textContent).toContain('Link inválido, utilizado ou expirado'); expect(document.querySelector('form')).toBeNull();
  });
  it('valida senha e confirmação, com autocomplete correto', () => {
    renderizar('alterar'); fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'curta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' })); expect(screen.getAllByRole('alert')).toHaveLength(3);
    expect(screen.getByLabelText('Nova senha').getAttribute('autocomplete')).toBe('new-password');
    expect(screen.getByLabelText('Senha atual').getAttribute('autocomplete')).toBe('current-password');
    expect(REQUISICAO).not.toHaveBeenCalled();
  });
  it('trata limite e falha de rede sem mostrar dados internos', async () => {
    REQUISICAO.mockResolvedValue(new Response('{}', { status: 429 })); renderizar('recuperar');
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'pessoa@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar senha' })); await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Muitas tentativas'));
    REQUISICAO.mockRejectedValue(new Error('segredo')); fireEvent.click(screen.getByRole('button', { name: 'Recuperar senha' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Não foi possível concluir')); expect(document.body.textContent).not.toContain('segredo');
  });
});

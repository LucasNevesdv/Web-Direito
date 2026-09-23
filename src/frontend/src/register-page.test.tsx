// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { RegisterPage } from './register-page';

const password = 'uma-senha-segura-123';
const fetchMock = vi.fn<typeof fetch>();

function response(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fillForm(overrides: Partial<Record<string, string>> = {}) {
  const values = {
    'Nome do escritório': '  Escritório Exemplo  ',
    'Nome do administrador': '  Maria Silva  ',
    'E-mail': '  MARIA@EXAMPLE.COM  ',
    Senha: password,
    'Confirme a senha': password,
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(response(201));
  vi.stubGlobal('fetch', fetchMock);
  window.history.replaceState({}, '', '/register');
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('cadastro do escritório e de seu administrador', () => {
  it('abre o formulário em /register e oferece acesso pela página inicial', () => {
    const view = render(<App />);
    expect(screen.getByRole('heading', { name: 'Crie seu escritório' })).toBeTruthy();
    view.unmount();
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(screen.getByRole('link', { name: 'Criar escritório' }).getAttribute('href')).toBe('/register');
  });

  it('apresenta erros por campo e foca o primeiro campo obrigatório', async () => {
    render(<RegisterPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(screen.getAllByRole('alert')).toHaveLength(5);
    expect(screen.getByLabelText('Nome do escritório').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Nome do escritório'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['Nome do escritório', 'A', 'Informe um nome de escritório entre 2 e 120 caracteres.'],
    ['Nome do escritório', 'A'.repeat(121), 'Informe um nome de escritório entre 2 e 120 caracteres.'],
    ['Nome do administrador', 'A', 'Informe um nome de administrador entre 2 e 120 caracteres.'],
    ['Nome do administrador', 'A'.repeat(121), 'Informe um nome de administrador entre 2 e 120 caracteres.'],
    ['E-mail', 'endereco-invalido', 'Informe um e-mail válido com até 254 caracteres.'],
    ['E-mail', `${'a'.repeat(243)}@example.com`, 'Informe um e-mail válido com até 254 caracteres.'],
    ['Senha', 'curta', 'A senha deve ter entre 12 e 128 caracteres.'],
    ['Senha', 's'.repeat(129), 'A senha deve ter entre 12 e 128 caracteres.'],
  ])('rejeita %s fora dos limites: %s', async (field, value, message) => {
    render(<RegisterPage />);
    fillForm({ [field]: value });
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(screen.getByText(message)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('impede o envio quando a confirmação de senha é diferente', async () => {
    render(<RegisterPage />);
    fillForm({ 'Confirme a senha': 'outra-senha-valida' });
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(screen.getByText('As senhas devem ser iguais.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envia somente os quatro campos permitidos com nomes e e-mail normalizados', async () => {
    render(<RegisterPage />);
    fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        officeName: 'Escritório Exemplo',
        adminName: 'Maria Silva',
        email: 'maria@example.com',
        password,
      }),
    });
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir para o login' }).getAttribute('href')).toBe('/login');
    expect(screen.queryByLabelText('Senha')).toBeNull();
  });

  it('aceita senhas dentro dos limites medidos em caracteres Unicode', async () => {
    render(<RegisterPage />);
    const unicodePassword = '🔐'.repeat(128);
    fillForm({ Senha: unicodePassword, 'Confirme a senha': unicodePassword });
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('desabilita campos e envio e impede requisições duplicadas enquanto aguarda', async () => {
    let finishRequest!: (value: Response) => void;
    fetchMock.mockReturnValue(new Promise((resolve) => { finishRequest = resolve; }));
    render(<RegisterPage />);
    fillForm();
    const form = screen.getByRole('button', { name: 'Criar escritório' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    const button = screen.getByRole('button', { name: 'Criando escritório…' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect((screen.getByRole('group') as HTMLFieldSetElement).disabled).toBe(true);
    expect(form.getAttribute('aria-busy')).toBe('true');
    expect(fetchMock).toHaveBeenCalledOnce();
    finishRequest(response(201));
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('informa conflito de e-mail e permite uma nova tentativa', async () => {
    fetchMock.mockResolvedValueOnce(response(409, { error: 'EMAIL_ALREADY_REGISTERED' }));
    render(<RegisterPage />);
    fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(await screen.findByText('Este e-mail já está cadastrado. Use outro e-mail.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Criar escritório' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'outra@example.com' } });
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('mapeia erros de validação do servidor sem apresentar o conteúdo recebido', async () => {
    fetchMock.mockResolvedValueOnce(response(400, {
      error: 'VALIDATION_ERROR',
      message: 'detalhe-interno-indesejado',
      fields: { email: 'detalhe-interno-indesejado', password: 'detalhe-interno-indesejado' },
    }));
    render(<RegisterPage />);
    fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(await screen.findByText('Informe um e-mail válido com até 254 caracteres.')).toBeTruthy();
    expect(screen.getByText('A senha deve ter entre 12 e 128 caracteres.')).toBeTruthy();
    expect(screen.queryByText(/detalhe-interno-indesejado/)).toBeNull();
  });

  it('exibe mensagem genérica quando a API falha sem mostrar detalhes internos', async () => {
    fetchMock.mockResolvedValueOnce(response(500, { message: 'segredo-interno' }));
    render(<RegisterPage />);
    fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(await screen.findByText('Não foi possível criar o escritório. Tente novamente em instantes.')).toBeTruthy();
    expect(screen.queryByText(/segredo-interno/)).toBeNull();
  });

  it('trata falha de rede e libera o formulário para nova tentativa', async () => {
    fetchMock.mockRejectedValueOnce(new Error('detalhe da conexão'));
    render(<RegisterPage />);
    fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(await screen.findByText('Não foi possível criar o escritório. Tente novamente em instantes.')).toBeTruthy();
    expect((screen.getByRole('group') as HTMLFieldSetElement).disabled).toBe(false);
    expect(screen.queryByText(/detalhe da conexão/)).toBeNull();
  });

  it('permite preencher e enviar o cadastro usando o teclado', async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);
    screen.getByLabelText('Nome do escritório').focus();
    await user.keyboard('Escritorio Exemplo');
    await user.tab();
    await user.keyboard('Maria Silva');
    await user.tab();
    await user.keyboard('maria@example.com');
    await user.tab();
    await user.keyboard(password);
    await user.tab();
    await user.keyboard(password);
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('não grava credenciais em armazenamento do navegador nem no console', async () => {
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    const logSpy = vi.spyOn(console, 'log');
    const errorSpy = vi.spyOn(console, 'error');
    render(<RegisterPage />);
    fillForm();
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    expect(storageSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

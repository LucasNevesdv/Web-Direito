// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Aplicacao } from '../../app';
import { PaginaCadastro } from './register-page';

const SENHA = 'uma-senha-segura-123';
const FETCH_SIMULADO = vi.fn<typeof fetch>();

function criarRespostaHttp(situacao: number, corpo: unknown = {}) {
  return new Response(JSON.stringify(corpo), {
    status: situacao,
    headers: { 'Content-Type': 'application/json' },
  });
}

function preencherFormulario(substituicoes: Partial<Record<string, string>> = {}) {
  const valores = {
    'Nome do escritório': '  Escritório Exemplo  ',
    'Nome do administrador': '  Maria Silva  ',
    'E-mail': '  MARIA@EXAMPLE.COM  ',
    Senha: SENHA,
    'Confirme a senha': SENHA,
    ...substituicoes,
  };
  for (const [rotulo, valor] of Object.entries(valores)) {
    fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
  }
}

beforeEach(() => {
  FETCH_SIMULADO.mockReset().mockResolvedValue(criarRespostaHttp(201));
  vi.stubGlobal('fetch', FETCH_SIMULADO);
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
    const visualizacao = render(<Aplicacao />);
    expect(screen.getByRole('heading', { name: 'Crie seu escritório' })).toBeTruthy();
    visualizacao.unmount();
    window.history.replaceState({}, '', '/');
    render(<Aplicacao />);
    expect(screen.getByRole('link', { name: 'Criar escritório' }).getAttribute('href')).toBe('/register');
  });

  it('apresenta erros por campo e foca o primeiro campo obrigatório', async () => {
    render(<PaginaCadastro />);
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(screen.getAllByRole('alert')).toHaveLength(5);
    expect(screen.getByLabelText('Nome do escritório').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Nome do escritório'));
    expect(FETCH_SIMULADO).not.toHaveBeenCalled();
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
  ])('rejeita %s fora dos limites: %s', async (campo, valor, mensagem) => {
    render(<PaginaCadastro />);
    preencherFormulario({ [campo]: valor });
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(screen.getByText(mensagem)).toBeTruthy();
    expect(FETCH_SIMULADO).not.toHaveBeenCalled();
  });

  it('impede o envio quando a confirmação de senha é diferente', async () => {
    render(<PaginaCadastro />);
    preencherFormulario({ 'Confirme a senha': 'outra-senha-valida' });
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(screen.getByText('As senhas devem ser iguais.')).toBeTruthy();
    expect(FETCH_SIMULADO).not.toHaveBeenCalled();
  });

  it('envia somente os quatro campos permitidos com nomes e e-mail normalizados', async () => {
    render(<PaginaCadastro />);
    preencherFormulario();
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(FETCH_SIMULADO).toHaveBeenCalledOnce();
    expect(FETCH_SIMULADO).toHaveBeenCalledWith('/api/v1/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nomeEscritorio: 'Escritório Exemplo',
        nomeAdministrador: 'Maria Silva',
        email: 'maria@example.com',
        senha: SENHA,
      }),
    });
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir para o login' }).getAttribute('href')).toBe('/login');
    expect(screen.queryByLabelText('Senha')).toBeNull();
  });

  it('aceita senhas dentro dos limites medidos em caracteres Unicode', async () => {
    render(<PaginaCadastro />);
    const senhaUnicode = '🔐'.repeat(128);
    preencherFormulario({ Senha: senhaUnicode, 'Confirme a senha': senhaUnicode });
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(FETCH_SIMULADO).toHaveBeenCalledOnce();
  });

  it('desabilita campos e envio e impede requisições duplicadas enquanto aguarda', async () => {
    let finalizarRequisicao!: (valor: Response) => void;
    FETCH_SIMULADO.mockReturnValue(new Promise((resolver) => { finalizarRequisicao = resolver; }));
    render(<PaginaCadastro />);
    preencherFormulario();
    const formulario = screen.getByRole('button', { name: 'Criar escritório' }).closest('form')!;
    fireEvent.submit(formulario);
    fireEvent.submit(formulario);
    const botao = screen.getByRole('button', { name: 'Criando escritório…' }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect((screen.getByRole('group') as HTMLFieldSetElement).disabled).toBe(true);
    expect(formulario.getAttribute('aria-busy')).toBe('true');
    expect(FETCH_SIMULADO).toHaveBeenCalledOnce();
    finalizarRequisicao(criarRespostaHttp(201));
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('informa conflito de e-mail e permite uma nova tentativa', async () => {
    FETCH_SIMULADO.mockResolvedValueOnce(criarRespostaHttp(409, { erro: 'EMAIL_JA_CADASTRADO' }));
    render(<PaginaCadastro />);
    preencherFormulario();
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(await screen.findByText('Este e-mail já está cadastrado. Use outro e-mail.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Criar escritório' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'outra@example.com' } });
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(FETCH_SIMULADO).toHaveBeenCalledTimes(2);
  });

  it('mapeia erros de validação do servidor sem apresentar o conteúdo recebido', async () => {
    FETCH_SIMULADO.mockResolvedValueOnce(criarRespostaHttp(400, {
      erro: 'ERRO_VALIDACAO',
      mensagem: 'detalhe-interno-indesejado',
      campos: { email: 'detalhe-interno-indesejado', senha: 'detalhe-interno-indesejado' },
    }));
    render(<PaginaCadastro />);
    preencherFormulario();
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(await screen.findByText('Informe um e-mail válido com até 254 caracteres.')).toBeTruthy();
    expect(screen.getByText('A senha deve ter entre 12 e 128 caracteres.')).toBeTruthy();
    expect(screen.queryByText(/detalhe-interno-indesejado/)).toBeNull();
  });

  it('exibe mensagem genérica quando a API falha sem mostrar detalhes internos', async () => {
    FETCH_SIMULADO.mockResolvedValueOnce(criarRespostaHttp(500, { mensagem: 'segredo-interno' }));
    render(<PaginaCadastro />);
    preencherFormulario();
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(await screen.findByText('Não foi possível criar o escritório. Tente novamente em instantes.')).toBeTruthy();
    expect(screen.queryByText(/segredo-interno/)).toBeNull();
  });

  it('trata falha de rede e libera o formulário para nova tentativa', async () => {
    FETCH_SIMULADO.mockRejectedValueOnce(new Error('detalhe da conexão'));
    render(<PaginaCadastro />);
    preencherFormulario();
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    expect(await screen.findByText('Não foi possível criar o escritório. Tente novamente em instantes.')).toBeTruthy();
    expect((screen.getByRole('group') as HTMLFieldSetElement).disabled).toBe(false);
    expect(screen.queryByText(/detalhe da conexão/)).toBeNull();
  });

  it('permite preencher e enviar o cadastro usando o teclado', async () => {
    const usuario = userEvent.setup();
    render(<PaginaCadastro />);
    screen.getByLabelText('Nome do escritório').focus();
    await usuario.keyboard('Escritorio Exemplo');
    await usuario.tab();
    await usuario.keyboard('Maria Silva');
    await usuario.tab();
    await usuario.keyboard('maria@example.com');
    await usuario.tab();
    await usuario.keyboard(SENHA);
    await usuario.tab();
    await usuario.keyboard(SENHA);
    await usuario.keyboard('{Enter}');
    expect(await screen.findByRole('status')).toBeTruthy();
  });

  it('não grava credenciais em armazenamento do navegador nem no console', async () => {
    const observadorArmazenamento = vi.spyOn(Storage.prototype, 'setItem');
    const observadorLogs = vi.spyOn(console, 'log');
    const observadorErros = vi.spyOn(console, "error");
    render(<PaginaCadastro />);
    preencherFormulario();
    await userEvent.click(screen.getByRole('button', { name: 'Criar escritório' }));
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    expect(observadorArmazenamento).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(observadorLogs).not.toHaveBeenCalled();
    expect(observadorErros).not.toHaveBeenCalled();
  });
});

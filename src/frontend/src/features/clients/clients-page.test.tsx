// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarClienteAutenticado, renderizarComCliente, respostaJson } from '../../shared/testing';
import { PaginaClientes, type ClienteItem } from './clients-page';

const clienteMock: ClienteItem = {
  id: 'cliente-1',
  tipoPessoa: 'PESSOA_FISICA',
  nome: 'Carlos Eduardo Santos',
  nomeSocial: null,
  documento: '11144477735',
  email: 'carlos@example.test',
  telefone: '11988887777',
  situacao: 'ATIVO',
  idVinculoResponsavel: null,
  versao: 0,
  criadoEm: '2026-10-29T10:00:00Z',
  atualizadoEm: '2026-10-29T10:00:00Z',
};

beforeEach(() => {
  window.history.replaceState(null, '', '/clientes');
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PaginaClientes (Frontend)', () => {
  it('carrega e lista os clientes cadastrados', async () => {
    const { cliente } = await criarClienteAutenticado((url) => {
      if (url.startsWith('/api/v1/clientes?')) {
        return respostaJson({ clientes: [clienteMock], total: 1 });
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaClientes />);

    expect(await screen.findByText('Carlos Eduardo Santos')).toBeTruthy();
    expect(screen.getByText('111.444.777-35')).toBeTruthy();
    expect(screen.getByText('carlos@example.test')).toBeTruthy();
    expect(screen.getByText('Ativo')).toBeTruthy();
  });

  it('abre modal e cadastra cliente pessoa física com sucesso', async () => {
    let cadastroEnviado: unknown = null;
    const { cliente } = await criarClienteAutenticado((url, opcoes) => {
      if (url.startsWith('/api/v1/clientes?')) {
        return respostaJson({ clientes: [], total: 0 });
      }
      if (url === '/api/v1/clientes' && opcoes?.method === 'POST') {
        cadastroEnviado = JSON.parse(opcoes.body as string);
        return respostaJson({ ...clienteMock, nome: 'Beatriz Lima' }, 201);
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaClientes />);

    fireEvent.click(await screen.findByRole('button', { name: 'Novo cliente' }));
    expect(screen.getByText('Novo Cliente')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Beatriz Lima' } });
    fireEvent.change(screen.getByLabelText(/CPF/i), { target: { value: '11144477735' } });
    fireEvent.change(screen.getByLabelText(/E-mail/i), { target: { value: 'beatriz@example.test' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));

    await waitFor(() => {
      expect(cadastroEnviado).toMatchObject({
        nome: 'Beatriz Lima',
        documento: '11144477735',
        email: 'beatriz@example.test',
        tipoPessoa: 'PESSOA_FISICA',
      });
    });
  });

  it('exibe alerta de possíveis duplicidades e permite confirmar (RF-027)', async () => {
    let segundaTentativa: unknown = null;
    let chamouPrimeiraVez = false;

    const { cliente } = await criarClienteAutenticado((url, opcoes) => {
      if (url.startsWith('/api/v1/clientes?')) {
        return respostaJson({ clientes: [], total: 0 });
      }
      if (url === '/api/v1/clientes' && opcoes?.method === 'POST') {
        if (!chamouPrimeiraVez) {
          chamouPrimeiraVez = true;
          return respostaJson(
            {
              erro: 'POSSIVEL_DUPLICIDADE',
              mensagem: 'Clientes semelhantes encontrados.',
              duplicidades: [
                {
                  id: 'c-existente',
                  nome: 'Carlos Eduardo Santos',
                  documentoMascarado: '111.***.***-35',
                  motivos: ['NOME_IDENTICO'],
                },
              ],
            },
            409,
          );
        }
        segundaTentativa = JSON.parse(opcoes.body as string);
        return respostaJson(clienteMock, 201);
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaClientes />);

    fireEvent.click(await screen.findByRole('button', { name: 'Novo cliente' }));
    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Carlos Eduardo Santos' } });
    fireEvent.change(screen.getByLabelText(/CPF/i), { target: { value: '11144477735' } });

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));

    expect(await screen.findByText(/Foram encontrados clientes semelhantes/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cadastro mesmo assim' }));

    await waitFor(() => {
      expect(segundaTentativa).toMatchObject({
        confirmarDuplicidadePotencial: true,
      });
    });
  });

  it('inativa cliente com diálogo de confirmação e motivo (RF-025, DP-10)', async () => {
    let corpoInativar: unknown = null;
    const { cliente } = await criarClienteAutenticado((url, opcoes) => {
      if (url.startsWith('/api/v1/clientes?')) {
        return respostaJson({ clientes: [clienteMock], total: 1 });
      }
      if (url === '/api/v1/clientes/cliente-1/inativar' && opcoes?.method === 'POST') {
        corpoInativar = JSON.parse(opcoes.body as string);
        return respostaJson({ ...clienteMock, situacao: 'INATIVO', versao: 1 });
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaClientes />);

    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    expect(screen.getByText('Inativar Cliente')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Motivo/i), { target: { value: 'Cliente finalizou processos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(corpoInativar).toEqual({
        versao: 0,
        motivo: 'Cliente finalizou processos',
      });
    });
  });

  it('abre gaveta da linha do tempo e lista eventos históricos (RF-026)', async () => {
    const { cliente } = await criarClienteAutenticado((url) => {
      if (url.startsWith('/api/v1/clientes?')) {
        return respostaJson({ clientes: [clienteMock], total: 1 });
      }
      if (url === '/api/v1/clientes/cliente-1/linha-do-tempo') {
        return respostaJson([
          {
            id: 'ev-1',
            idAutor: 'usr-1',
            nomeAutor: 'Dr. Roberto',
            acao: 'CLIENTE_CRIADO',
            criadoEm: '2026-10-29T10:00:00Z',
          },
        ]);
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaClientes />);

    fireEvent.click(await screen.findByRole('button', { name: 'Histórico' }));

    expect(await screen.findByText('Linha do Tempo')).toBeTruthy();
    expect(screen.getByText('Cliente cadastrado')).toBeTruthy();
    expect(screen.getByText(/Dr\. Roberto/)).toBeTruthy();
  });
});

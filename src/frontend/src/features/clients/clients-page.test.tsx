// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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

  it('permite adicionar contatos iniciais no cadastro de novo cliente (RF-019)', async () => {
    let corpoEnviado: Record<string, unknown> | null = null;
    const { cliente } = await criarClienteAutenticado((url, opcoes) => {
      if (url.startsWith('/api/v1/clientes?')) {
        return respostaJson({ clientes: [], total: 0 });
      }
      if (url === '/api/v1/clientes' && opcoes?.method === 'POST') {
        corpoEnviado = JSON.parse(opcoes.body as string);
        return respostaJson(clienteMock, 201);
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaClientes />);

    fireEvent.click(await screen.findByRole('button', { name: 'Novo cliente' }));

    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Empresa Teste' } });
    fireEvent.change(screen.getByLabelText(/CPF/i), { target: { value: '11144477735' } });

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar contato inicial' }));

    fireEvent.change(screen.getByLabelText(/Nome do contato/i), { target: { value: 'Rodrigo Santos' } });
    fireEvent.change(screen.getByLabelText(/Cargo ou Relação/i), { target: { value: 'Gerente' } });
    const camposTelefone = screen.getAllByLabelText(/Telefone/i);
    fireEvent.change(camposTelefone[1], { target: { value: '11988889999' } });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar à lista' }));

    expect(screen.getByText('Rodrigo Santos')).toBeTruthy();
    expect(screen.getByText(/Gerente/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }));

    await waitFor(() => {
      expect(corpoEnviado).toMatchObject({
        nome: 'Empresa Teste',
        contatosIniciais: [
          {
            nome: 'Rodrigo Santos',
            cargoOuRelacao: 'Gerente',
            telefone: '11988889999',
            email: null,
            observacao: null,
          },
        ],
      });
    });
  });

  it('gerencia contatos na edição do cliente incluindo adição e exclusão (RF-019)', async () => {
    let contatoCriado: Record<string, unknown> | null = null;
    let contatoExcluidoId: string | null = null;

    const clienteDetalheComContatos = {
      ...clienteMock,
      observacoesInternas: 'Anotação interna',
      contatos: [
        {
          id: 'contato-1',
          nome: 'Mariana Souza',
          cargoOuRelacao: 'Financeiro',
          email: 'mariana@example.test',
          telefone: '11977778888',
          observacao: 'Contato principal',
          criadoEm: '2026-10-29T10:00:00Z',
          atualizadoEm: '2026-10-29T10:00:00Z',
        },
      ],
    };

    const { cliente } = await criarClienteAutenticado((url, opcoes) => {
      if (url.startsWith('/api/v1/clientes?')) {
        return respostaJson({ clientes: [clienteMock], total: 1 });
      }
      if (url === '/api/v1/clientes/cliente-1' && (!opcoes?.method || opcoes.method === 'GET')) {
        return respostaJson(clienteDetalheComContatos);
      }
      if (url === '/api/v1/clientes/cliente-1/contatos' && opcoes?.method === 'POST') {
        contatoCriado = JSON.parse(opcoes.body as string);
        return respostaJson({ id: 'contato-2', ...contatoCriado }, 201);
      }
      if (url === '/api/v1/clientes/cliente-1/contatos/contato-1' && opcoes?.method === 'DELETE') {
        contatoExcluidoId = 'contato-1';
        return respostaJson({}, 204);
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaClientes />);

    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));

    // Trocar para a aba de Contatos Relacionados
    fireEvent.click(await screen.findByRole('button', { name: /Contatos Relacionados/i }));

    expect(screen.getByText('Mariana Souza')).toBeTruthy();
    expect(screen.getByText('Financeiro')).toBeTruthy();

    // Adicionar novo contato
    fireEvent.click(screen.getByRole('button', { name: '+ Novo contato' }));

    expect(screen.getByText('Novo Contato Relacionado')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Nome completo do contato'), {
      target: { value: 'Lucas Ferreira' },
    });
    fireEvent.change(screen.getByPlaceholderText('(11) 98888-7777'), {
      target: { value: '11999990000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar contato' }));

    await waitFor(() => {
      expect(contatoCriado).toMatchObject({
        nome: 'Lucas Ferreira',
        telefone: '11999990000',
      });
    });

    // Excluir contato existente
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(screen.getByText('Excluir Contato')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    await waitFor(() => {
      expect(contatoExcluidoId).toBe('contato-1');
    });
  });

  it('executa verificação manual de duplicidades pelo botão no formulário (RF-027)', async () => {
    let corpoDuplicidade: Record<string, unknown> | null = null;

    const { cliente } = await criarClienteAutenticado((url, opcoes) => {
      if (url.startsWith('/api/v1/clientes?')) {
        return respostaJson({ clientes: [], total: 0 });
      }
      if (url === '/api/v1/clientes/verificar-duplicidades' && opcoes?.method === 'POST') {
        corpoDuplicidade = JSON.parse(opcoes.body as string);
        return respostaJson({
          duplicidades: [
            {
              id: 'c-existente',
              nome: 'Carlos Eduardo Santos',
              documentoMascarado: '111.***.***-35',
              motivos: ['DOCUMENTO_IDENTICO'],
            },
          ],
        });
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaClientes />);

    fireEvent.click(await screen.findByRole('button', { name: 'Novo cliente' }));

    fireEvent.change(screen.getByLabelText(/Nome completo/i), { target: { value: 'Carlos Eduardo Santos' } });
    fireEvent.change(screen.getByLabelText(/CPF/i), { target: { value: '11144477735' } });

    fireEvent.click(screen.getByRole('button', { name: 'Verificar duplicidades' }));

    await waitFor(() => {
      expect(corpoDuplicidade).toMatchObject({
        nome: 'Carlos Eduardo Santos',
        documento: '11144477735',
      });
    });

    expect(await screen.findByText(/Atenção: Foram encontrados clientes semelhantes neste escritório:/i)).toBeTruthy();
  });

  it('abre modal de vínculos e exibe documentos, tarefas e prazos (RF-029 / RF-030)', async () => {
    let consultouVinculos = false;

    const { cliente } = await criarClienteAutenticado((url) => {
      if (url.startsWith('/api/v1/clientes?')) {
        return respostaJson({ clientes: [clienteMock], total: 1 });
      }
      if (url === '/api/v1/clientes/cliente-1/vinculos') {
        consultouVinculos = true;
        return respostaJson({
          casos: [],
          processos: [],
          documentos: [
            {
              id: 'doc-1',
              nome: 'Contrato de Prestação.pdf',
              categoria: 'CONTRATO',
              criadoEm: '2026-10-30T10:00:00Z',
            },
          ],
          tarefas: [
            {
              id: 'tarefa-1',
              titulo: 'Protocolar petição inicial',
              situacao: 'PENDENTE',
              prazo: '2026-11-15',
            },
          ],
          compromissos: [
            {
              id: 'prazo-1',
              descricao: 'Prazo da Contestação',
              data: '2026-11-20',
              situacao: 'PENDENTE',
            },
          ],
        });
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaClientes />);

    expect(await screen.findByText('Carlos Eduardo Santos')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Vínculos' }));

    expect(screen.getByText('Vínculos do Cliente')).toBeTruthy();

    await waitFor(() => {
      expect(consultouVinculos).toBe(true);
    });

    expect(await screen.findByText('Contrato de Prestação.pdf')).toBeTruthy();
    expect(screen.getByText('Contrato')).toBeTruthy();
    expect(screen.getByText('Protocolar petição inicial')).toBeTruthy();
    expect(screen.getByText('Prazo da Contestação')).toBeTruthy();
    expect(screen.getByText('Nenhum caso ou processo vinculado a este cliente.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByText('Vínculos do Cliente')).toBeNull();
  });

  it('permite alternar para a aba Vínculos dentro do modal de edição (RF-029 / RF-030)', async () => {
    let consultouVinculos = false;

    const { cliente } = await criarClienteAutenticado((url) => {
      if (url.startsWith('/api/v1/clientes?')) {
        return respostaJson({ clientes: [clienteMock], total: 1 });
      }
      if (url === '/api/v1/clientes/cliente-1') {
        return respostaJson({
          ...clienteMock,
          endereco: null,
          observacoesInternas: null,
          contatos: [],
        });
      }
      if (url === '/api/v1/clientes/cliente-1/vinculos') {
        consultouVinculos = true;
        return respostaJson({
          casos: [],
          processos: [],
          documentos: [],
          tarefas: [],
          compromissos: [],
        });
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaClientes />);

    expect(await screen.findByText('Carlos Eduardo Santos')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(await screen.findByText('Editar Cliente')).toBeTruthy();

    const modal = screen.getByRole('dialog');
    const abaVinculos = within(modal).getByRole('button', { name: 'Vínculos' });
    fireEvent.click(abaVinculos);

    await waitFor(() => {
      expect(consultouVinculos).toBe(true);
    });

    expect(await screen.findByText('Nenhum documento vinculado a este cliente.')).toBeTruthy();
    expect(screen.getByText('Nenhuma tarefa vinculada a este cliente.')).toBeTruthy();
    expect(screen.getByText('Nenhum prazo judicial vinculado a este cliente.')).toBeTruthy();
  });
});

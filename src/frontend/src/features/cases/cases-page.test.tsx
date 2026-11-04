// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarClienteAutenticado, renderizarComCliente, respostaJson } from '../../shared/testing';
import { PaginaCasos, type CasoItem, type CasoDetalhe } from './cases-page';

const casoMock: CasoItem = {
  id: 'caso-1',
  idEscritorio: 'escritorio-1',
  titulo: 'Ação de Cobrança Extrajudicial',
  natureza: 'EXTRAJUDICIAL',
  areaJuridica: 'CIVEL',
  prioridade: 'MEDIA',
  situacao: 'ATIVO',
  idVinculoResponsavel: null,
  nomeResponsavel: null,
  valorCausaCentavos: 1500000,
  valorEnvolvidoCentavos: 1800000,
  clientes: [
    {
      id: 'cliente-1',
      nome: 'Carlos Eduardo Santos',
      documento: '11144477735',
      tipoPessoa: 'PESSOA_FISICA',
    },
  ],
  quantidadeProcessos: 0,
  versao: 0,
  ultimaAtividadeEm: '2026-11-04T12:00:00Z',
  criadoEm: '2026-11-04T12:00:00Z',
  atualizadoEm: '2026-11-04T12:00:00Z',
};

const casoDetalheMock: CasoDetalhe = {
  ...casoMock,
  descricao: 'Dossiê sobre cobrança de valores em aberto.',
  equipe: [],
  partes: [
    {
      id: 'parte-1',
      idEscritorio: 'escritorio-1',
      idCaso: 'caso-1',
      tipoParticipacao: 'PARTE_CONTRARIA',
      nome: 'Empresa Devedora Ltda',
      documento: '11222333000181',
      oab: null,
      contato: 'financeiro@devedora.test',
      observacao: null,
      criadoEm: '2026-11-04T12:00:00Z',
      atualizadoEm: '2026-11-04T12:00:00Z',
    },
  ],
  processos: [],
};

beforeEach(() => {
  window.history.replaceState(null, '', '/casos');
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PaginaCasos (Frontend)', () => {
  it('carrega e lista casos ativos', async () => {
    const { cliente } = await criarClienteAutenticado((url) => {
      if (url.startsWith('/api/v1/casos?')) {
        return respostaJson({ casos: [casoMock], total: 1 });
      }
      if (url.startsWith('/api/v1/clientes?')) {
        return respostaJson({ clientes: [] });
      }
      if (url === '/api/v1/equipe') {
        return respostaJson({ membros: [] });
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaCasos />);

    expect(await screen.findByText('Ação de Cobrança Extrajudicial')).toBeTruthy();
    expect(screen.getByText('Carlos Eduardo Santos')).toBeTruthy();
    expect(screen.getByText('Sem responsável')).toBeTruthy();
    expect(screen.getByText('R$ 15.000,00')).toBeTruthy();
    expect(screen.getByText('Ativo')).toBeTruthy();
  });

  it('permite aplicar filtro rápido Sem responsável (RF-047)', async () => {
    let urlChamada = '';
    const { cliente } = await criarClienteAutenticado((url) => {
      if (url.startsWith('/api/v1/casos?')) {
        urlChamada = url;
        return respostaJson({ casos: [casoMock], total: 1 });
      }
      return respostaJson({ clientes: [], membros: [] });
    });

    renderizarComCliente(cliente, <PaginaCasos />);

    const botaoSemResp = await screen.findByRole('button', { name: /Sem responsável/i });
    fireEvent.click(botaoSemResp);

    await waitFor(() => {
      expect(urlChamada).toContain('semResponsavel=true');
    });
  });

  it('permite aplicar filtro rápido Sem atividade recente (RF-048)', async () => {
    let urlChamada = '';
    const { cliente } = await criarClienteAutenticado((url) => {
      if (url.startsWith('/api/v1/casos?')) {
        urlChamada = url;
        return respostaJson({ casos: [], total: 0 });
      }
      return respostaJson({ clientes: [], membros: [] });
    });

    renderizarComCliente(cliente, <PaginaCasos />);

    const botaoSemAtividade = await screen.findByRole('button', { name: /Sem atividade recente/i });
    fireEvent.click(botaoSemAtividade);

    await waitFor(() => {
      expect(urlChamada).toContain('semAtividadeDesdeDias=30');
    });
  });

  it('permite aplicar filtro rápido Arquivados (RF-046)', async () => {
    let urlChamada = '';
    const { cliente } = await criarClienteAutenticado((url) => {
      if (url.startsWith('/api/v1/casos?')) {
        urlChamada = url;
        return respostaJson({ casos: [], total: 0 });
      }
      return respostaJson({ clientes: [], membros: [] });
    });

    renderizarComCliente(cliente, <PaginaCasos />);

    const botaoArquivados = await screen.findByRole('button', { name: /^Arquivados/i });
    fireEvent.click(botaoArquivados);

    await waitFor(() => {
      expect(urlChamada).toContain('situacao=ARQUIVADO');
    });
  });

  it('abre modal e cadastra novo caso com sucesso', async () => {
    let corpoEnviado: unknown = null;
    const { cliente } = await criarClienteAutenticado((url, opcoes) => {
      if (url.startsWith('/api/v1/casos?')) {
        return respostaJson({ casos: [], total: 0 });
      }
      if (url.startsWith('/api/v1/clientes?')) {
        return respostaJson({
          clientes: [{ id: 'cliente-1', nome: 'Carlos Eduardo Santos', documento: '11144477735' }],
        });
      }
      if (url === '/api/v1/equipe') {
        return respostaJson({
          membros: [
            { id: 'vinculo-1', nome: 'Dra. Alice Advogada', papel: 'ADVOGADO', estaAtivo: true },
          ],
        });
      }
      if (url === '/api/v1/casos' && opcoes?.method === 'POST') {
        corpoEnviado = JSON.parse(opcoes.body as string);
        return respostaJson(casoDetalheMock, 201);
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaCasos />);

    fireEvent.click(await screen.findByRole('button', { name: 'Novo caso' }));
    expect(screen.getByText('Novo Caso')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Título \/ Dossiê/i), {
      target: { value: 'Ação Revisional de Juros' },
    });
    fireEvent.change(screen.getByLabelText(/Valor da Causa/i), {
      target: { value: '50000,00' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar caso' }));

    await waitFor(() => {
      expect(corpoEnviado).toMatchObject({
        titulo: 'Ação Revisional de Juros',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        valorCausaCentavos: 5000000,
        idsClientes: ['cliente-1'],
      });
    });
  });

  it('exibe detalhes do caso e permite arquivar (RF-046)', async () => {
    let arquivou = false;
    const { cliente } = await criarClienteAutenticado((url, opcoes) => {
      if (url.startsWith('/api/v1/casos?')) {
        return respostaJson({ casos: [casoMock], total: 1 });
      }
      if (url === '/api/v1/casos/caso-1') {
        return respostaJson(casoDetalheMock);
      }
      if (url === '/api/v1/casos/caso-1/linha-do-tempo') {
        return respostaJson([
          {
            id: 'evt-1',
            idAutor: 'user-1',
            nomeAutor: 'Dra. Alice',
            acao: 'CASO_CRIADO',
            anterior: null,
            atual: { titulo: casoMock.titulo },
            criadoEm: '2026-11-04T12:00:00Z',
          },
        ]);
      }
      if (url === '/api/v1/casos/caso-1/arquivar' && opcoes?.method === 'POST') {
        arquivou = true;
        return respostaJson({ ...casoDetalheMock, situacao: 'ARQUIVADO', versao: 1 });
      }
      return respostaJson({ clientes: [], membros: [] });
    });

    renderizarComCliente(cliente, <PaginaCasos />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes' }));

    expect(await screen.findByText('Dossiê sobre cobrança de valores em aberto.')).toBeTruthy();

    // Navega para aba de partes
    fireEvent.click(screen.getByRole('button', { name: /Partes Envolvidas/i }));
    expect(await screen.findByText('Empresa Devedora Ltda')).toBeTruthy();

    // Navega para aba de linha do tempo
    fireEvent.click(screen.getByRole('button', { name: 'Linha do Tempo' }));
    expect(await screen.findByText('CASO_CRIADO')).toBeTruthy();

    // Retorna para aba de informações gerais e arquiva
    fireEvent.click(screen.getByRole('button', { name: 'Informações Gerais' }));
    fireEvent.click(screen.getByRole('button', { name: /Arquivar caso/i }));

    await waitFor(() => {
      expect(arquivou).toBe(true);
    });
  });
});

// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarClienteAutenticado, renderizarComCliente, respostaJson } from '../../shared/testing';
import { PaginaCasos, type CasoItem, type CasoDetalhe, type ProcessoResumo, type MovimentacaoProcessoItem } from './cases-page';

function gerarCnjValido(seq = 1, ano = 2026): { formatado: string; digitos: string } {
  const s = String(seq).padStart(7, '0');
  const a = String(ano);
  const j = '8';
  const tr = '26';
  const o = '0100';
  const base = `${s}${a}${j}${tr}${o}00`;
  const resto = BigInt(base) % 97n;
  const dd = (98n - resto).toString().padStart(2, '0');
  return {
    digitos: `${s}${dd}${a}${j}${tr}${o}`,
    formatado: `${s}-${dd}.${a}.${j}.${tr}.${o}`,
  };
}

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
      if (url.startsWith('/api/v1/equipe/usuarios')) {
        return respostaJson({ usuarios: [] });
      }
      return respostaJson({}, 404);
    });

    renderizarComCliente(cliente, <PaginaCasos />);

    expect(await screen.findByText('Ação de Cobrança Extrajudicial')).toBeTruthy();
    expect(screen.getByText('Carlos Eduardo Santos')).toBeTruthy();
    expect(screen.getAllByText('Sem responsável')[0]).toBeTruthy();
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
      if (url.startsWith('/api/v1/equipe/usuarios')) {
        return respostaJson({
          usuarios: [
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

  it('exibe processos vinculados e permite ver movimentações (RF-038..RF-043)', async () => {
    const cnj1 = gerarCnjValido(1);
    const processoMock: ProcessoResumo = {
      id: 'proc-1',
      numeroCnj: cnj1.digitos,
      numeroCnjFormatado: cnj1.formatado,
      relacaoComCaso: 'PRINCIPAL',
      tribunal: 'TJSP',
      comarca: 'São Paulo',
      vara: '1ª Vara Cível',
      instancia: 'PRIMEIRA_INSTANCIA',
      faseProcessual: 'CONHECIMENTO',
      versao: 0,
    };

    const movMock: MovimentacaoProcessoItem = {
      id: 'mov-1',
      idEscritorio: 'escritorio-1',
      idCaso: 'caso-1',
      idProcesso: 'proc-1',
      idAutor: 'user-1',
      nomeAutor: 'Dra. Alice',
      ocorridaEm: '2026-11-05T10:00:00Z',
      descricao: 'Juntada de petição inicial e documentos comprobatórios.',
      criadoEm: '2026-11-05T10:00:00Z',
    };

    const casoComProcesso: CasoDetalhe = {
      ...casoDetalheMock,
      processos: [processoMock],
    };

    const { cliente } = await criarClienteAutenticado((url) => {
      if (url.startsWith('/api/v1/casos?')) {
        return respostaJson({ casos: [{ ...casoMock, quantidadeProcessos: 1 }], total: 1 });
      }
      if (url === '/api/v1/casos/caso-1') {
        return respostaJson(casoComProcesso);
      }
      if (url === '/api/v1/casos/caso-1/processos/proc-1/movimentacoes') {
        return respostaJson({ movimentacoes: [movMock], total: 1 });
      }
      return respostaJson({ clientes: [], membros: [] });
    });

    renderizarComCliente(cliente, <PaginaCasos />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes' }));
    expect(await screen.findByText('Dossiê sobre cobrança de valores em aberto.')).toBeTruthy();

    // Navega para aba de processos
    fireEvent.click(await screen.findByRole('button', { name: /Processos \(1\)/i }));
    expect(await screen.findByText(cnj1.formatado)).toBeTruthy();
    expect(screen.getByText('Principal')).toBeTruthy();
    expect(screen.getByText('1ª Instância')).toBeTruthy();
    expect(screen.getByText('Conhecimento')).toBeTruthy();
    expect(screen.getByText('TJSP')).toBeTruthy();
    expect(screen.getByText('São Paulo')).toBeTruthy();
    expect(screen.getByText('1ª Vara Cível')).toBeTruthy();

    // Clica para ver movimentações
    fireEvent.click(screen.getByRole('button', { name: 'Ver movimentações' }));
    expect(await screen.findByText('Juntada de petição inicial e documentos comprobatórios.')).toBeTruthy();
  });

  it('permite vincular novo processo com validação Mod 97-10 em tempo real (RF-038..RF-042)', async () => {
    let corpoEnviado: unknown = null;
    const cnjNovo = gerarCnjValido(2);
    const { cliente } = await criarClienteAutenticado((url, opcoes) => {
      if (url.startsWith('/api/v1/casos?')) {
        return respostaJson({ casos: [casoMock], total: 1 });
      }
      if (url === '/api/v1/casos/caso-1') {
        return respostaJson(casoDetalheMock);
      }
      if (url === '/api/v1/casos/caso-1/processos' && opcoes?.method === 'POST') {
        corpoEnviado = JSON.parse(opcoes.body as string);
        return respostaJson({
          id: 'proc-novo',
          numeroCnj: cnjNovo.digitos,
          numeroCnjFormatado: cnjNovo.formatado,
          relacaoComCaso: 'PRINCIPAL',
          tribunal: 'TJSP',
          comarca: 'São Paulo',
          vara: '2ª Vara Cível',
          instancia: 'PRIMEIRA_INSTANCIA',
          faseProcessual: 'CONHECIMENTO',
          versao: 0,
        }, 201);
      }
      return respostaJson({ clientes: [], membros: [] });
    });

    renderizarComCliente(cliente, <PaginaCasos />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes' }));
    fireEvent.click(await screen.findByRole('button', { name: /Processos \(0\)/i }));

    fireEvent.click(screen.getByRole('button', { name: '+ Vincular processo' }));
    expect(await screen.findByText('Vincular Processo ao Caso')).toBeTruthy();

    // Digita CNJ com formatação e validação Mod 97
    const inputCnj = screen.getByLabelText(/Número CNJ/i);
    fireEvent.change(inputCnj, { target: { value: cnjNovo.digitos } });
    expect(await screen.findByText(/Número CNJ válido \(Mod 97-10\)/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Tribunal \*/i), { target: { value: 'TJSP' } });
    fireEvent.change(screen.getByLabelText(/Comarca \/ Foro/i), { target: { value: 'São Paulo' } });
    fireEvent.change(screen.getByLabelText(/Vara \/ Câmara/i), { target: { value: '2ª Vara Cível' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar processo' }));

    await waitFor(() => {
      expect(corpoEnviado).toMatchObject({
        numeroCnj: cnjNovo.digitos,
        relacaoComCaso: 'PRINCIPAL',
        tribunal: 'TJSP',
        comarca: 'São Paulo',
        vara: '2ª Vara Cível',
        instancia: 'PRIMEIRA_INSTANCIA',
        faseProcessual: 'CONHECIMENTO',
      });
    });
  });

  it('permite registrar movimentação manual no processo vinculado (RF-043)', async () => {
    let corpoEnviado: unknown = null;
    const cnj1 = gerarCnjValido(1);
    const processoMock: ProcessoResumo = {
      id: 'proc-1',
      numeroCnj: cnj1.digitos,
      numeroCnjFormatado: cnj1.formatado,
      relacaoComCaso: 'PRINCIPAL',
      tribunal: 'TJSP',
      instancia: 'PRIMEIRA_INSTANCIA',
      faseProcessual: 'CONHECIMENTO',
      versao: 0,
    };

    const casoComProcesso: CasoDetalhe = {
      ...casoDetalheMock,
      processos: [processoMock],
    };

    const { cliente } = await criarClienteAutenticado((url, opcoes) => {
      if (url.startsWith('/api/v1/casos?')) {
        return respostaJson({ casos: [{ ...casoMock, quantidadeProcessos: 1 }], total: 1 });
      }
      if (url === '/api/v1/casos/caso-1') {
        return respostaJson(casoComProcesso);
      }
      if (url === '/api/v1/casos/caso-1/processos/proc-1/movimentacoes' && opcoes?.method === 'POST') {
        corpoEnviado = JSON.parse(opcoes.body as string);
        return respostaJson({
          id: 'mov-1',
          idEscritorio: 'escritorio-1',
          idCaso: 'caso-1',
          idProcesso: 'proc-1',
          idAutor: 'user-1',
          ocorridaEm: '2026-11-05T12:00:00.000Z',
          descricao: 'Decisão interlocutória deferindo tutela de urgência.',
          criadoEm: '2026-11-05T12:00:00.000Z',
        }, 201);
      }
      if (url === '/api/v1/casos/caso-1/processos/proc-1/movimentacoes') {
        return respostaJson({ movimentacoes: [], total: 0 });
      }
      if (url === '/api/v1/casos/caso-1/linha-do-tempo') {
        return respostaJson([]);
      }
      return respostaJson({ clientes: [], membros: [] });
    });

    renderizarComCliente(cliente, <PaginaCasos />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes' }));
    fireEvent.click(await screen.findByRole('button', { name: /Processos \(1\)/i }));

    fireEvent.click(screen.getByRole('button', { name: '+ Movimentação' }));
    expect(await screen.findByText('Registrar Movimentação Manual')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Descrição da Movimentação \*/i), {
      target: { value: 'Decisão interlocutória deferindo tutela de urgência.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar movimentação' }));

    await waitFor(() => {
      expect(corpoEnviado).toMatchObject({
        descricao: 'Decisão interlocutória deferindo tutela de urgência.',
      });
    });
  });

  it('permite filtrar linha do tempo por processo vinculado (RF-044)', async () => {
    let urlLinhaTempoChamada = '';
    const cnj1 = gerarCnjValido(1);
    const processoMock: ProcessoResumo = {
      id: 'proc-1',
      numeroCnj: cnj1.digitos,
      numeroCnjFormatado: cnj1.formatado,
      relacaoComCaso: 'PRINCIPAL',
      tribunal: 'TJSP',
      instancia: 'PRIMEIRA_INSTANCIA',
      faseProcessual: 'CONHECIMENTO',
    };

    const casoComProcesso: CasoDetalhe = {
      ...casoDetalheMock,
      processos: [processoMock],
    };

    const { cliente } = await criarClienteAutenticado((url) => {
      if (url.startsWith('/api/v1/casos?')) {
        return respostaJson({ casos: [{ ...casoMock, quantidadeProcessos: 1 }], total: 1 });
      }
      if (url === '/api/v1/casos/caso-1') {
        return respostaJson(casoComProcesso);
      }
      if (url.startsWith('/api/v1/casos/caso-1/linha-do-tempo')) {
        urlLinhaTempoChamada = url;
        return respostaJson([]);
      }
      return respostaJson({ clientes: [], membros: [] });
    });

    renderizarComCliente(cliente, <PaginaCasos />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Linha do Tempo' }));

    const selectFiltro = await screen.findByLabelText(/Filtrar por processo:/i);
    fireEvent.change(selectFiltro, { target: { value: 'proc-1' } });

    await waitFor(() => {
      expect(urlLinhaTempoChamada).toBe('/api/v1/casos/caso-1/linha-do-tempo?idProcesso=proc-1');
    });
  });
});

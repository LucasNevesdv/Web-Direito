import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GestaoClientes } from '../../src/application/clients/manage-clients.js';
import { RepositorioClientesEmMemoria } from '../support/in-memory-clients-repository.js';
import type { TokensAcesso } from '../../src/application/authentication/authentication-contracts.js';

const CPF_TESTE = '11144477735';
const CNPJ_TESTE = '00000000000191';

describe('Gestão de Clientes (Casos de Uso / Aplicação)', () => {
  let repo: RepositorioClientesEmMemoria;
  let tokens: TokensAcesso;
  let gestao: GestaoClientes;
  let idEscritorioA: string;
  let idEscritorioB: string;
  let idUsuarioProprietario: string;

  beforeEach(() => {
    repo = new RepositorioClientesEmMemoria();
    idEscritorioA = randomUUID();
    idEscritorioB = randomUUID();
    idUsuarioProprietario = randomUUID();

    tokens = {
      validarTokenDeAcesso: vi.fn(async (token: string) => {
        if (token === 'token-escritorio-b') {
          return {
            idUsuario: randomUUID(),
            idEscritorioAtivo: idEscritorioB,
            idSessao: randomUUID(),
            papel: 'PROPRIETARIO' as const,
          };
        }
        if (token === 'token-secretario') {
          return {
            idUsuario: randomUUID(),
            idEscritorioAtivo: idEscritorioA,
            idSessao: randomUUID(),
            papel: 'SECRETARIO' as const,
          };
        }
        return {
          idUsuario: idUsuarioProprietario,
          idEscritorioAtivo: idEscritorioA,
          idSessao: randomUUID(),
          papel: 'PROPRIETARIO' as const,
        };
      }),
      criarTokenDeAcesso: vi.fn(async () => 'novo-token'),
    };

    gestao = new GestaoClientes(repo, tokens);
  });

  it('cadastra cliente PF com sucesso e grava evento na linha do tempo', async () => {
    const cliente = await gestao.cadastrarCliente('token-proprietario', {
      tipoPessoa: 'PESSOA_FISICA',
      nome: 'Carlos da Silva',
      documento: CPF_TESTE,
      email: 'carlos@example.test',
      observacoesInternas: 'Cliente VIP',
    });

    expect(cliente.id).toBeDefined();
    expect(cliente.nome).toBe('Carlos da Silva');
    expect(cliente.documento).toBe(CPF_TESTE);
    expect(cliente.observacoesInternas).toBe('Cliente VIP');
    expect(cliente.situacao).toBe('ATIVO');

    const linhaTempo = await gestao.consultarLinhaDoTempo('token-proprietario', cliente.id);
    expect(linhaTempo).toHaveLength(1);
    expect(linhaTempo[0]!.acao).toBe('CLIENTE_CRIADO');
  });

  it('bloqueia cadastro com mesmo CPF dentro do mesmo escritório (RF-028)', async () => {
    await gestao.cadastrarCliente('token-proprietario', {
      tipoPessoa: 'PESSOA_FISICA',
      nome: 'Carlos da Silva',
      documento: CPF_TESTE,
    });

    await expect(
      gestao.cadastrarCliente('token-proprietario', {
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Outro Carlos',
        documento: CPF_TESTE,
      }),
    ).rejects.toMatchObject({
      codigo: 'DOCUMENTO_JA_CADASTRADO',
      situacao: 409,
    });
  });

  it('permite o mesmo CPF/CNPJ em escritórios distintos (RF-028 / RNF-001)', async () => {
    const clienteA = await gestao.cadastrarCliente('token-proprietario', {
      tipoPessoa: 'PESSOA_FISICA',
      nome: 'Cliente Escritório A',
      documento: CPF_TESTE,
    });

    const clienteB = await gestao.cadastrarCliente('token-escritorio-b', {
      tipoPessoa: 'PESSOA_FISICA',
      nome: 'Cliente Escritório B',
      documento: CPF_TESTE,
    });

    expect(clienteA.id).not.toBe(clienteB.id);
    expect(clienteA.documento).toBe(CPF_TESTE);
    expect(clienteB.documento).toBe(CPF_TESTE);

    // Listagem do escritório A não vê cliente do escritório B
    const listaA = await gestao.listarClientes('token-proprietario', {
      pagina: 1,
      tamanhoPagina: 10,
      pesquisa: '',
    });
    expect(listaA.clientes).toHaveLength(1);
    expect(listaA.clientes[0]!.id).toBe(clienteA.id);

    // Consulta direta pelo escritório B buscando ID do A retorna 404 (RN-004)
    await expect(gestao.consultarCliente('token-escritorio-b', clienteA.id)).rejects.toMatchObject({
      codigo: 'NAO_ENCONTRADO',
      situacao: 404,
    });
  });

  it('detecta duplicidade potencial e bloqueia até confirmação explícita (RF-027)', async () => {
    await gestao.cadastrarCliente('token-proprietario', {
      tipoPessoa: 'PESSOA_FISICA',
      nome: 'Mariana Souza',
      documento: CPF_TESTE,
      email: 'mariana@empresa.test',
      telefone: '11988887777',
    });

    // Tentativa com mesmo nome e email (mas documento fictício diferente se houvesse, ou CNPJ)
    const cnpj = CNPJ_TESTE;
    await expect(
      gestao.cadastrarCliente('token-proprietario', {
        tipoPessoa: 'PESSOA_JURIDICA',
        nome: 'Mariana Souza',
        documento: cnpj,
        email: 'mariana@empresa.test',
      }),
    ).rejects.toMatchObject({
      codigo: 'POSSIVEL_DUPLICIDADE',
      situacao: 409,
    });

    // Ao enviar confirmarDuplicidadePotencial: true, o cadastro prossegue
    const cadastrado = await gestao.cadastrarCliente('token-proprietario', {
      tipoPessoa: 'PESSOA_JURIDICA',
      nome: 'Mariana Souza',
      documento: cnpj,
      email: 'mariana@empresa.test',
      confirmarDuplicidadePotencial: true,
    });

    expect(cadastrado.id).toBeDefined();
    expect(cadastrado.documento).toBe(cnpj);
  });

  it('valida responsável elegível (PROPRIETARIO, ADMINISTRADOR, ADVOGADO) e rejeita estagiário', async () => {
    const idAdvogado = randomUUID();
    const idEstagiario = randomUUID();

    repo.adicionarMembro({
      id: idAdvogado,
      idEscritorio: idEscritorioA,
      nome: 'Dr. Roberto',
      papel: 'ADVOGADO',
      ativo: true,
    });

    repo.adicionarMembro({
      id: idEstagiario,
      idEscritorio: idEscritorioA,
      nome: 'Estagiário Lucas',
      papel: 'ESTAGIARIO',
      ativo: true,
    });

    // Advogado é aceito
    const cliente = await gestao.cadastrarCliente('token-proprietario', {
      tipoPessoa: 'PESSOA_FISICA',
      nome: 'Cliente do Dr. Roberto',
      documento: CPF_TESTE,
      idVinculoResponsavel: idAdvogado,
    });
    expect(cliente.idVinculoResponsavel).toBe(idAdvogado);

    // Estagiário é rejeitado com RESPONSAVEL_INVALIDO (DP-04)
    await expect(
      gestao.cadastrarCliente('token-proprietario', {
        tipoPessoa: 'PESSOA_JURIDICA',
        nome: 'Empresa do Lucas',
        documento: CNPJ_TESTE,
        idVinculoResponsavel: idEstagiario,
      }),
    ).rejects.toMatchObject({
      codigo: 'RESPONSAVEL_INVALIDO',
      situacao: 400,
    });
  });

  it('oculta observações internas se o autor não possuir permissão (RN-009)', async () => {
    const cliente = await gestao.cadastrarCliente('token-proprietario', {
      tipoPessoa: 'PESSOA_FISICA',
      nome: 'Cliente Confidencial',
      documento: CPF_TESTE,
      observacoesInternas: 'Anotações sigilosas do advogado',
    });

    // Consultando como proprietário: exibe observações
    const detalheProprietario = await gestao.consultarCliente('token-proprietario', cliente.id);
    expect(detalheProprietario.observacoesInternas).toBe('Anotações sigilosas do advogado');

    // Consultando com token que não tem CLIENTE_VISUALIZAR_OBSERVACOES (ex: secretário simulado)
    repo.adicionarMembro({
      id: randomUUID(),
      idEscritorio: idEscritorioA,
      nome: 'Secretário',
      papel: 'SECRETARIO',
      ativo: true,
    });

    const detalheSecretario = await gestao.consultarCliente('token-secretario', cliente.id);
    expect(detalheSecretario.observacoesInternas).toBeNull();
  });

  it('aplica CAS na edição e detecta conflito de versão (RF-024)', async () => {
    const cliente = await gestao.cadastrarCliente('token-proprietario', {
      tipoPessoa: 'PESSOA_FISICA',
      nome: 'Nome Original',
      documento: CPF_TESTE,
    });

    // Edição com versão correta (0)
    const atualizado = await gestao.editarCliente('token-proprietario', cliente.id, {
      nome: 'Nome Alterado',
      documento: CPF_TESTE,
      versao: 0,
    });
    expect(atualizado.nome).toBe('Nome Alterado');
    expect(atualizado.versao).toBe(1);

    // Tentativa com versão defasada (0 novamente) -> 409 CONFLITO
    await expect(
      gestao.editarCliente('token-proprietario', cliente.id, {
        nome: 'Outra alteração',
        documento: CPF_TESTE,
        versao: 0,
      }),
    ).rejects.toMatchObject({
      codigo: 'CONFLITO',
      situacao: 409,
    });
  });

  it('inativa e reativa cliente preservando dados e registrando histórico (RF-025, RN-005, DP-10)', async () => {
    const cliente = await gestao.cadastrarCliente('token-proprietario', {
      tipoPessoa: 'PESSOA_FISICA',
      nome: 'Cliente para Inativar',
      documento: CPF_TESTE,
    });

    const inativado = await gestao.definirSituacaoCliente(
      'token-proprietario',
      cliente.id,
      false,
      0,
      'Cliente rescindiu contrato',
    );
    expect(inativado.situacao).toBe('INATIVO');
    expect(inativado.versao).toBe(1);

    const reativado = await gestao.definirSituacaoCliente(
      'token-proprietario',
      cliente.id,
      true,
      1,
      'Cliente recontratou',
    );
    expect(reativado.situacao).toBe('ATIVO');
    expect(reativado.versao).toBe(2);

    const linhaTempo = await gestao.consultarLinhaDoTempo('token-proprietario', cliente.id);
    const acoes = linhaTempo.map((e) => e.acao);
    expect(acoes).toContain('CLIENTE_INATIVADO');
    expect(acoes).toContain('CLIENTE_REATIVADO');
  });
});

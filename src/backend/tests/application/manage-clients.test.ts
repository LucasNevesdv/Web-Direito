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

  describe('Contatos Relacionados (RF-019)', () => {
    it('adiciona, edita e remove contatos com gravação atômica na linha do tempo', async () => {
      const cliente = await gestao.cadastrarCliente('token-proprietario', {
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Cliente com Contatos',
        documento: CPF_TESTE,
      });

      // 1. Adicionar contato
      const contatoCriado = await gestao.adicionarContato('token-proprietario', cliente.id, {
        nome: 'Sócio Representante',
        cargoOuRelacao: 'Sócio',
        email: 'socio@empresa.test',
        telefone: '11988887777',
        observacao: 'Contato principal',
      });

      expect(contatoCriado.id).toBeDefined();
      expect(contatoCriado.nome).toBe('Sócio Representante');
      expect(contatoCriado.cargoOuRelacao).toBe('Sócio');

      // Verifica detalhe do cliente contendo o contato
      const detalheAposAdd = await gestao.consultarCliente('token-proprietario', cliente.id);
      expect(detalheAposAdd.contatos).toHaveLength(1);
      expect(detalheAposAdd.contatos[0]!.id).toBe(contatoCriado.id);

      // 2. Editar contato
      const contatoAtualizado = await gestao.editarContato(
        'token-proprietario',
        cliente.id,
        contatoCriado.id,
        {
          nome: 'Sócio Administrador',
          cargoOuRelacao: 'Diretor Geral',
          email: 'diretor@empresa.test',
          telefone: '11988887777',
        },
      );

      expect(contatoAtualizado.nome).toBe('Sócio Administrador');
      expect(contatoAtualizado.cargoOuRelacao).toBe('Diretor Geral');

      // 3. Remover contato
      await gestao.removerContato('token-proprietario', cliente.id, contatoCriado.id);

      const detalheAposRemocao = await gestao.consultarCliente('token-proprietario', cliente.id);
      expect(detalheAposRemocao.contatos).toHaveLength(0);

      // 4. Linha do tempo gravou CONTATO_ADICIONADO, CONTATO_ATUALIZADO e CONTATO_REMOVIDO
      const linhaTempo = await gestao.consultarLinhaDoTempo('token-proprietario', cliente.id);
      const acoes = linhaTempo.map((e) => e.acao);
      expect(acoes).toContain('CONTATO_ADICIONADO');
      expect(acoes).toContain('CONTATO_ATUALIZADO');
      expect(acoes).toContain('CONTATO_REMOVIDO');
    });

    it('bloqueia operações de contatos em cliente de outro escritório (404 / RNF-001)', async () => {
      const clienteA = await gestao.cadastrarCliente('token-proprietario', {
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Cliente do Escritório A',
        documento: CPF_TESTE,
      });

      const contato = await gestao.adicionarContato('token-proprietario', clienteA.id, {
        nome: 'Contato A',
        email: 'contato@a.test',
      });

      // Tentativa do Escritório B de adicionar contato no cliente do Escritório A
      await expect(
        gestao.adicionarContato('token-escritorio-b', clienteA.id, {
          nome: 'Invasor B',
          email: 'b@b.test',
        }),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });

      // Tentativa do Escritório B de editar contato do Escritório A
      await expect(
        gestao.editarContato('token-escritorio-b', clienteA.id, contato.id, {
          nome: 'Novo Nome',
          email: 'b@b.test',
        }),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });

      // Tentativa do Escritório B de remover contato do Escritório A
      await expect(
        gestao.removerContato('token-escritorio-b', clienteA.id, contato.id),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });
    });

    it('rejeita contato inexistente com 404', async () => {
      const cliente = await gestao.cadastrarCliente('token-proprietario', {
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Cliente Teste',
        documento: CPF_TESTE,
      });

      await expect(
        gestao.editarContato('token-proprietario', cliente.id, randomUUID(), {
          nome: 'Contato Fantasma',
          email: 'fantasma@test.com',
        }),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });

      await expect(
        gestao.removerContato('token-proprietario', cliente.id, randomUUID()),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });
    });
  });

  describe('Detecção de Duplicidades (RF-027)', () => {
    it('verificarDuplicidades identifica documento, nome, email e telefone no escritório', async () => {
      await gestao.cadastrarCliente('token-proprietario', {
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Renata Albuquerque',
        documento: CPF_TESTE,
        email: 'renata@albuquerque.adv.br',
        telefone: '11977776666',
      });

      // 1. Duplicidade exata de documento
      const dupDoc = await gestao.verificarDuplicidades('token-proprietario', {
        documento: CPF_TESTE,
        nome: 'Outra Pessoa',
      });
      expect(dupDoc.duplicidades).toHaveLength(1);
      expect(dupDoc.duplicidades[0]!.motivos).toContain('DOCUMENTO_IDENTICO');

      // 2. Duplicidade por nome idêntico
      const dupNome = await gestao.verificarDuplicidades('token-proprietario', {
        documento: CNPJ_TESTE,
        nome: '  Renata Albuquerque  ',
      });
      expect(dupNome.duplicidades).toHaveLength(1);
      expect(dupNome.duplicidades[0]!.motivos).toContain('NOME_IDENTICO');

      // 3. Duplicidade por e-mail
      const dupEmail = await gestao.verificarDuplicidades('token-proprietario', {
        documento: CNPJ_TESTE,
        nome: 'Nome Diferente',
        email: 'RENATA@ALBUQUERQUE.ADV.BR',
      });
      expect(dupEmail.duplicidades).toHaveLength(1);
      expect(dupEmail.duplicidades[0]!.motivos).toContain('EMAIL_IDENTICO');

      // 4. Duplicidade por telefone
      const dupTel = await gestao.verificarDuplicidades('token-proprietario', {
        documento: CNPJ_TESTE,
        nome: 'Nome Diferente',
        telefone: '(11) 97777-6666',
      });
      expect(dupTel.duplicidades).toHaveLength(1);
      expect(dupTel.duplicidades[0]!.motivos).toContain('TELEFONE_IDENTICO');

      // 5. Isolamento: Escritório B não vê clientes do Escritório A na verificação
      const dupEscritorioB = await gestao.verificarDuplicidades('token-escritorio-b', {
        documento: CPF_TESTE,
        nome: 'Renata Albuquerque',
        email: 'renata@albuquerque.adv.br',
      });
      expect(dupEscritorioB.duplicidades).toHaveLength(0);
    });
  });

  describe('consultarVinculos (RF-029 / RF-030)', () => {
    it('retorna os vínculos consolidados do cliente com documentos, tarefas e prazos', async () => {
      const cliente = await gestao.cadastrarCliente('token-proprietario', {
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Cliente Com Vinculos',
        documento: CPF_TESTE,
      });

      repo.adicionarDocumento({
        id: randomUUID(),
        idEscritorio: idEscritorioA,
        idCliente: cliente.id,
        nome: 'Contrato de Honorários.pdf',
        categoria: 'CONTRATO',
        ativo: true,
      });

      repo.adicionarTarefa({
        id: randomUUID(),
        idEscritorio: idEscritorioA,
        idCliente: cliente.id,
        titulo: 'Protocolar procuração',
        situacao: 'PENDENTE',
        prazo: '2026-11-20',
      });

      repo.adicionarCompromisso({
        id: randomUUID(),
        idEscritorio: idEscritorioA,
        idCliente: cliente.id,
        descricao: 'Audiência de Conciliação',
        situacao: 'PENDENTE',
        data: '2026-11-25',
      });

      const vinculos = await gestao.consultarVinculos('token-proprietario', cliente.id);

      expect(vinculos.documentos).toHaveLength(1);
      expect(vinculos.documentos[0]!.nome).toBe('Contrato de Honorários.pdf');
      expect(vinculos.documentos[0]!.categoria).toBe('CONTRATO');

      expect(vinculos.tarefas).toHaveLength(1);
      expect(vinculos.tarefas[0]!.titulo).toBe('Protocolar procuração');
      expect(vinculos.tarefas[0]!.prazo).toBe('2026-11-20');

      expect(vinculos.compromissos).toHaveLength(1);
      expect(vinculos.compromissos[0]!.descricao).toBe('Audiência de Conciliação');
      expect(vinculos.compromissos[0]!.data).toBe('2026-11-25');

      expect(vinculos.casos).toEqual([]);
      expect(vinculos.processos).toEqual([]);
    });

    it('impede que Escritório B consulte vínculos de cliente do Escritório A (RN-001 / RNF-001)', async () => {
      const cliente = await gestao.cadastrarCliente('token-proprietario', {
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Cliente Escritório A',
        documento: CPF_TESTE,
      });

      await expect(
        gestao.consultarVinculos('token-escritorio-b', cliente.id),
      ).rejects.toMatchObject({
        codigo: 'NAO_ENCONTRADO',
        situacao: 404,
      });
    });

    it('exige permissão CLIENTE_VISUALIZAR para consultar vínculos', async () => {
      const cliente = await gestao.cadastrarCliente('token-proprietario', {
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Cliente Permissao',
        documento: CPF_TESTE,
      });

      tokens.validarTokenDeAcesso = vi.fn(async () => ({
        idUsuario: randomUUID(),
        idEscritorioAtivo: idEscritorioA,
        idSessao: randomUUID(),
        papel: 'SECRETARIO' as const,
      }));

      repo.adicionarMembro({
        id: randomUUID(),
        idEscritorio: idEscritorioA,
        nome: 'Membro Sem Permissao',
        papel: 'SECRETARIO',
        ativo: true,
        permissoes: [],
      });

      await expect(
        gestao.consultarVinculos('token-secretario', cliente.id),
      ).rejects.toMatchObject({
        codigo: 'PROIBIDO',
        situacao: 403,
      });
    });
  });
});

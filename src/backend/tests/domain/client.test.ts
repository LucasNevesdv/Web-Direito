import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Cliente } from '../../src/domain/clients/client.js';
import { ContatoCliente } from '../../src/domain/clients/client-contact.js';
import { EventoLinhaTempoCliente } from '../../src/domain/clients/client-timeline-event.js';
import { ErroClienteInvalido } from '../../src/domain/clients/invalid-client-error.js';

const CPF_VALIDO = '11144477735';
const CNPJ_VALIDO = '00000000000191';

describe('Entidade Cliente (Domínio)', () => {
  it('cria cliente pessoa física com dados válidos e normalizações', () => {
    const idEscritorio = randomUUID();
    const cliente = Cliente.criar({
      idEscritorio,
      tipoPessoa: 'PESSOA_FISICA',
      nome: '  João da Silva  ',
      nomeSocial: '  Joãozinho  ',
      documento: '111.444.777-35',
      email: '  JOAO@SILVA.COM.BR  ',
      telefone: ' (11) 98765-4321 ',
      endereco: {
        cep: '01001-000',
        logradouro: ' Praça da Sé ',
        numero: ' 100 ',
        complemento: ' Sala 1 ',
        bairro: ' Sé ',
        cidade: ' São Paulo ',
        uf: 'sp',
      },
      observacoesInternas: ' Cliente preferencial. ',
    });

    expect(cliente.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i);
    expect(cliente.idEscritorio).toBe(idEscritorio);
    expect(cliente.tipoPessoa).toBe('PESSOA_FISICA');
    expect(cliente.nome).toBe('João da Silva');
    expect(cliente.nomeSocial).toBe('Joãozinho');
    expect(cliente.documento).toBe(CPF_VALIDO);
    expect(cliente.email).toBe('joao@silva.com.br');
    expect(cliente.telefone).toBe('11987654321');
    expect(cliente.endereco).toEqual({
      cep: '01001000',
      logradouro: 'Praça da Sé',
      numero: '100',
      complemento: 'Sala 1',
      bairro: 'Sé',
      cidade: 'São Paulo',
      uf: 'SP',
    });
    expect(cliente.observacoesInternas).toBe('Cliente preferencial.');
    expect(cliente.situacao).toBe('ATIVO');
    expect(cliente.versao).toBe(0);
    expect(cliente.criadoEm).toBeInstanceOf(Date);
    expect(cliente.atualizadoEm).toBeInstanceOf(Date);
  });

  it('cria cliente pessoa jurídica com CNPJ válido', () => {
    const idEscritorio = randomUUID();
    const cliente = Cliente.criar({
      idEscritorio,
      tipoPessoa: 'PESSOA_JURIDICA',
      nome: 'Empresa Modelo Ltda',
      nomeSocial: 'Modelo Serviços',
      documento: '00.000.000/0001-91',
    });

    expect(cliente.tipoPessoa).toBe('PESSOA_JURIDICA');
    expect(cliente.nome).toBe('Empresa Modelo Ltda');
    expect(cliente.nomeSocial).toBe('Modelo Serviços');
    expect(cliente.documento).toBe(CNPJ_VALIDO);
    expect(cliente.email).toBeNull();
    expect(cliente.telefone).toBeNull();
    expect(cliente.endereco).toBeNull();
  });

  it('rejeita CPF com dígitos repetidos', () => {
    expect(() =>
      Cliente.criar({
        idEscritorio: randomUUID(),
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Teste',
        documento: '111.111.111-11',
      }),
    ).toThrowError(new ErroClienteInvalido('documento'));
  });

  it('rejeita CPF com dígito verificador incorreto', () => {
    expect(() =>
      Cliente.criar({
        idEscritorio: randomUUID(),
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Teste',
        documento: '11144477736',
      }),
    ).toThrowError(new ErroClienteInvalido('documento'));
  });

  it('rejeita CNPJ com dígitos repetidos ou inválidos', () => {
    expect(() =>
      Cliente.criar({
        idEscritorio: randomUUID(),
        tipoPessoa: 'PESSOA_JURIDICA',
        nome: 'Empresa',
        documento: '00000000000000',
      }),
    ).toThrowError(new ErroClienteInvalido('documento'));

    expect(() =>
      Cliente.criar({
        idEscritorio: randomUUID(),
        tipoPessoa: 'PESSOA_JURIDICA',
        nome: 'Empresa',
        documento: '00000000000192',
      }),
    ).toThrowError(new ErroClienteInvalido('documento'));
  });

  it('rejeita nome menor que 2 caracteres ou maior que 150', () => {
    expect(() =>
      Cliente.criar({
        idEscritorio: randomUUID(),
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'A',
        documento: CPF_VALIDO,
      }),
    ).toThrowError(new ErroClienteInvalido('nome'));

    expect(() =>
      Cliente.criar({
        idEscritorio: randomUUID(),
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'A'.repeat(151),
        documento: CPF_VALIDO,
      }),
    ).toThrowError(new ErroClienteInvalido('nome'));
  });

  it('rejeita e-mail inválido', () => {
    expect(() =>
      Cliente.criar({
        idEscritorio: randomUUID(),
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Teste',
        documento: CPF_VALIDO,
        email: 'invalido@',
      }),
    ).toThrowError(new ErroClienteInvalido('email'));
  });

  it('rejeita telefone inválido (menos de 10 dígitos ou mais de 15)', () => {
    expect(() =>
      Cliente.criar({
        idEscritorio: randomUUID(),
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Teste',
        documento: CPF_VALIDO,
        telefone: '123456789',
      }),
    ).toThrowError(new ErroClienteInvalido('telefone'));
  });

  it('rejeita UF inválida no endereço', () => {
    expect(() =>
      Cliente.criar({
        idEscritorio: randomUUID(),
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Teste',
        documento: CPF_VALIDO,
        endereco: {
          cep: null,
          logradouro: null,
          numero: null,
          complemento: null,
          bairro: null,
          cidade: null,
          uf: 'XX',
        },
      }),
    ).toThrowError(new ErroClienteInvalido('endereco'));
  });

  it('rejeita observações com mais de 4000 caracteres', () => {
    expect(() =>
      Cliente.criar({
        idEscritorio: randomUUID(),
        tipoPessoa: 'PESSOA_FISICA',
        nome: 'Teste',
        documento: CPF_VALIDO,
        observacoesInternas: 'A'.repeat(4001),
      }),
    ).toThrowError(new ErroClienteInvalido('observacoesInternas'));
  });
});

describe('Entidade ContatoCliente (Domínio)', () => {
  it('cria contato com e-mail ou telefone', () => {
    const contato = ContatoCliente.criar({
      idEscritorio: randomUUID(),
      idCliente: randomUUID(),
      nome: 'Maria Silva',
      cargoOuRelacao: 'Cônjuge',
      email: 'maria@example.test',
      telefone: '11999998888',
      observacao: 'Ligar após 18h',
    });

    expect(contato.nome).toBe('Maria Silva');
    expect(contato.cargoOuRelacao).toBe('Cônjuge');
    expect(contato.email).toBe('maria@example.test');
    expect(contato.telefone).toBe('11999998888');
    expect(contato.observacao).toBe('Ligar após 18h');
  });

  it('rejeita contato sem e-mail nem telefone', () => {
    expect(() =>
      ContatoCliente.criar({
        idEscritorio: randomUUID(),
        idCliente: randomUUID(),
        nome: 'Maria Silva',
        email: null,
        telefone: null,
      }),
    ).toThrowError(new ErroClienteInvalido('contato'));
  });

  it('atualiza dados de contato preservando id, cliente e escritório', () => {
    const idEscritorio = randomUUID();
    const idCliente = randomUUID();
    const original = ContatoCliente.criar({
      idEscritorio,
      idCliente,
      nome: 'Contato Inicial',
      cargoOuRelacao: 'Diretor',
      email: 'contato@empresa.test',
    });

    const atualizado = original.atualizar({
      nome: 'Contato Modificado',
      cargoOuRelacao: 'Gerente',
      email: 'gerente@empresa.test',
      telefone: '11987654321',
      observacao: 'Novo responsável financeiro',
    });

    expect(atualizado.id).toBe(original.id);
    expect(atualizado.idEscritorio).toBe(idEscritorio);
    expect(atualizado.idCliente).toBe(idCliente);
    expect(atualizado.nome).toBe('Contato Modificado');
    expect(atualizado.cargoOuRelacao).toBe('Gerente');
    expect(atualizado.email).toBe('gerente@empresa.test');
    expect(atualizado.telefone).toBe('11987654321');
    expect(atualizado.observacao).toBe('Novo responsável financeiro');
    expect(atualizado.atualizadoEm.getTime()).toBeGreaterThanOrEqual(original.criadoEm.getTime());
  });

  it('rejeita atualização de contato com nome inválido ou removendo todos os meios', () => {
    const contato = ContatoCliente.criar({
      idEscritorio: randomUUID(),
      idCliente: randomUUID(),
      nome: 'Contato Teste',
      email: 'teste@empresa.test',
    });

    expect(() =>
      contato.atualizar({
        nome: 'X',
        email: 'teste@empresa.test',
      }),
    ).toThrowError(new ErroClienteInvalido('nome'));

    expect(() =>
      contato.atualizar({
        nome: 'Nome Correto',
        email: null,
        telefone: null,
      }),
    ).toThrowError(new ErroClienteInvalido('contato'));
  });

  it('rejeita cargoOuRelacao ou observacao além dos limites', () => {
    expect(() =>
      ContatoCliente.criar({
        idEscritorio: randomUUID(),
        idCliente: randomUUID(),
        nome: 'Contato Limite',
        email: 'limite@empresa.test',
        cargoOuRelacao: 'C'.repeat(81),
      }),
    ).toThrowError(new ErroClienteInvalido('contato'));

    expect(() =>
      ContatoCliente.criar({
        idEscritorio: randomUUID(),
        idCliente: randomUUID(),
        nome: 'Contato Limite',
        email: 'limite@empresa.test',
        observacao: 'O'.repeat(501),
      }),
    ).toThrowError(new ErroClienteInvalido('contato'));
  });
});

describe('Entidade EventoLinhaTempoCliente (Domínio)', () => {
  it('cria evento de linha do tempo com dados válidos', () => {
    const evento = EventoLinhaTempoCliente.criar({
      idEscritorio: randomUUID(),
      idCliente: randomUUID(),
      idAutor: randomUUID(),
      acao: 'CLIENTE_CRIADO',
      atual: { situacao: 'ATIVO' },
    });

    expect(evento.acao).toBe('CLIENTE_CRIADO');
    expect(evento.atual).toEqual({ situacao: 'ATIVO' });
    expect(evento.criadoEm).toBeInstanceOf(Date);
  });
});

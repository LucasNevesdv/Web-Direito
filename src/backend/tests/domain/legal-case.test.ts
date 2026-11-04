import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Caso } from '../../src/domain/cases/legal-case.js';
import { ParteEnvolvidaCaso } from '../../src/domain/cases/case-party.js';
import { EventoLinhaTempoCaso } from '../../src/domain/cases/case-timeline-event.js';
import { ErroCasoInvalido } from '../../src/domain/cases/invalid-case-error.js';

describe('Entidade Caso (Domínio)', () => {
  const idEscritorio = randomUUID();
  const idCliente = randomUUID();

  it('cria caso judicial válido com sucesso', () => {
    const caso = Caso.criar({
      idEscritorio,
      titulo: 'Ação Revisional de Contrato',
      descricao: 'Dossiê inicial de revisão de juros abusivos.',
      natureza: 'JUDICIAL',
      areaJuridica: 'CIVEL',
      prioridade: 'ALTA',
      valorCausaCentavos: 500000,
      valorEnvolvidoCentavos: 750000,
      idsClientes: [idCliente],
    });

    expect(caso.id).toBeTruthy();
    expect(caso.idEscritorio).toBe(idEscritorio.toLowerCase());
    expect(caso.titulo).toBe('Ação Revisional de Contrato');
    expect(caso.natureza).toBe('JUDICIAL');
    expect(caso.areaJuridica).toBe('CIVEL');
    expect(caso.prioridade).toBe('ALTA');
    expect(caso.situacao).toBe('ATIVO');
    expect(caso.valorCausaCentavos).toBe(500000);
    expect(caso.valorEnvolvidoCentavos).toBe(750000);
    expect(caso.idsClientes).toEqual([idCliente.toLowerCase()]);
    expect(caso.idsVinculosEquipe).toEqual([]);
    expect(caso.versao).toBe(0);
    expect(caso.criadoEm).toBeInstanceOf(Date);
    expect(caso.atualizadoEm).toBeInstanceOf(Date);
    expect(caso.ultimaAtividadeEm).toBeInstanceOf(Date);
  });

  it('exige pelo menos um cliente vinculado (DP-06 / RF-032)', () => {
    expect(() =>
      Caso.criar({
        idEscritorio,
        titulo: 'Caso Sem Clientes',
        natureza: 'CONSULTIVO',
        areaJuridica: 'TRIBUTARIO',
        idsClientes: [],
      }),
    ).toThrowError(ErroCasoInvalido);
  });

  it('rejeita título com menos de 3 ou mais de 160 caracteres (RF-035)', () => {
    expect(() =>
      Caso.criar({
        idEscritorio,
        titulo: 'AB',
        natureza: 'EXTRAJUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente],
      }),
    ).toThrowError(ErroCasoInvalido);

    expect(() =>
      Caso.criar({
        idEscritorio,
        titulo: 'A'.repeat(161),
        natureza: 'EXTRAJUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente],
      }),
    ).toThrowError(ErroCasoInvalido);
  });

  it('rejeita valores negativos ou que ultrapassam o limite seguro (RF-037)', () => {
    expect(() =>
      Caso.criar({
        idEscritorio,
        titulo: 'Caso Valor Negativo',
        natureza: 'JUDICIAL',
        areaJuridica: 'TRABALHISTA',
        valorCausaCentavos: -10,
        idsClientes: [idCliente],
      }),
    ).toThrowError(ErroCasoInvalido);

    expect(() =>
      Caso.criar({
        idEscritorio,
        titulo: 'Caso Valor Fracionado',
        natureza: 'JUDICIAL',
        areaJuridica: 'TRABALHISTA',
        valorCausaCentavos: 10.5,
        idsClientes: [idCliente],
      }),
    ).toThrowError(ErroCasoInvalido);
  });

  it('impede duplicidade de clientes ou membros de equipe', () => {
    expect(() =>
      Caso.criar({
        idEscritorio,
        titulo: 'Caso Duplicidade',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente, idCliente],
      }),
    ).toThrowError(ErroCasoInvalido);

    const idMembro = randomUUID();
    expect(() =>
      Caso.criar({
        idEscritorio,
        titulo: 'Caso Duplicidade Membro',
        natureza: 'JUDICIAL',
        areaJuridica: 'CIVEL',
        idsClientes: [idCliente],
        idsVinculosEquipe: [idMembro, idMembro],
      }),
    ).toThrowError(ErroCasoInvalido);
  });

  it('transições de estado: arquivar e reabrir caso (RF-046)', () => {
    const caso = Caso.criar({
      idEscritorio,
      titulo: 'Caso Para Arquivamento',
      natureza: 'EXTRAJUDICIAL',
      areaJuridica: 'IMOBILIARIO',
      idsClientes: [idCliente],
    });

    const arquivado = caso.arquivar();
    expect(arquivado.situacao).toBe('ARQUIVADO');
    expect(arquivado.versao).toBe(1);

    // Rejeita arquivar novamente
    expect(() => arquivado.arquivar()).toThrowError(ErroCasoInvalido);

    // Reabre
    const reaberto = arquivado.reabrir();
    expect(reaberto.situacao).toBe('ATIVO');
    expect(reaberto.versao).toBe(2);

    // Rejeita reabrir caso já ativo
    expect(() => reaberto.reabrir()).toThrowError(ErroCasoInvalido);
  });

  it('bloqueia edição de caso arquivado (DP-08)', () => {
    const caso = Caso.criar({
      idEscritorio,
      titulo: 'Caso Arquivado Bloqueado',
      natureza: 'JUDICIAL',
      areaJuridica: 'CIVEL',
      idsClientes: [idCliente],
    });

    const arquivado = caso.arquivar();
    expect(() => arquivado.editar({ titulo: 'Novo Título' })).toThrowError(ErroCasoInvalido);
  });

  it('edita com sucesso caso ativo incrementando versão', () => {
    const caso = Caso.criar({
      idEscritorio,
      titulo: 'Título Original',
      natureza: 'JUDICIAL',
      areaJuridica: 'CIVEL',
      prioridade: 'BAIXA',
      idsClientes: [idCliente],
    });

    const editado = caso.editar({
      titulo: 'Título Modificado',
      prioridade: 'URGENTE',
    });

    expect(editado.titulo).toBe('Título Modificado');
    expect(editado.prioridade).toBe('URGENTE');
    expect(editado.versao).toBe(1);
    expect(editado.natureza).toBe('JUDICIAL');
  });
});

describe('Entidade ParteEnvolvidaCaso (Domínio)', () => {
  const idEscritorio = randomUUID();
  const idCaso = randomUUID();

  it('cria parte contrária com sucesso validando CPF e OAB', () => {
    const parte = ParteEnvolvidaCaso.criar({
      idEscritorio,
      idCaso,
      tipoParticipacao: 'ADVOGADO_CONTRARIO',
      nome: 'Dr. Rivaldo Silveira',
      documento: '11144477735',
      oab: 'SP-123456',
      contato: 'rivaldo@adv.test',
      observacao: 'Patrono da requerida',
    });

    expect(parte.id).toBeTruthy();
    expect(parte.nome).toBe('Dr. Rivaldo Silveira');
    expect(parte.tipoParticipacao).toBe('ADVOGADO_CONTRARIO');
    expect(parte.documento).toBe('11144477735');
    expect(parte.oab).toBe('SP-123456');
  });

  it('rejeita CPF inválido para parte envolvida', () => {
    expect(() =>
      ParteEnvolvidaCaso.criar({
        idEscritorio,
        idCaso,
        tipoParticipacao: 'PARTE_CONTRARIA',
        nome: 'Empresa Devedora',
        documento: '11122233344', // CPF inválido
      }),
    ).toThrowError(ErroCasoInvalido);
  });
});

describe('Entidade EventoLinhaTempoCaso (Domínio)', () => {
  it('cria evento imutável com ação e payload', () => {
    const idEscritorio = randomUUID();
    const idCaso = randomUUID();
    const idAutor = randomUUID();

    const evento = EventoLinhaTempoCaso.criar({
      idEscritorio,
      idCaso,
      idAutor,
      acao: 'CASO_CRIADO',
      atual: { titulo: 'Caso Teste' },
    });

    expect(evento.id).toBeTruthy();
    expect(evento.acao).toBe('CASO_CRIADO');
    expect(evento.atual).toEqual({ titulo: 'Caso Teste' });
    expect(evento.anterior).toBeNull();
  });
});

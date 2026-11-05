import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Processo } from '../../src/domain/cases/legal-process.js';
import { MovimentacaoProcesso } from '../../src/domain/cases/process-movement.js';
import { ErroProcessoInvalido } from '../../src/domain/cases/invalid-process-error.js';

describe('Processo e Movimentação — Domain (Slice 2)', () => {
  // Gera um CNJ matematicamente válido para testes
  function gerarCnjValido(seq = 1, ano = 2024, j = 8, tr = 26, o = 100): { formatado: string; digitos: string } {
    const s = String(seq).padStart(7, '0');
    const a = String(ano);
    const seg = String(j);
    const tribunal = String(tr).padStart(2, '0');
    const origem = String(o).padStart(4, '0');

    const dd = Processo.calcularDigitoVerificador(s, a, seg, tribunal, origem);
    const digitos = `${s}${dd}${a}${seg}${tribunal}${origem}`;
    const formatado = `${s}-${dd}.${a}.${seg}.${tribunal}.${origem}`;
    return { formatado, digitos };
  }

  describe('Validação e Normalização do Número CNJ (Res. 65/2008 - Mod 97-10)', () => {
    it('deve calcular corretamente o dígito verificador e validar o CNJ gerado', () => {
      const { digitos, formatado } = gerarCnjValido(1234, 2023, 8, 26, 100);

      expect(Processo.validarNumeroCnj(digitos)).toBe(true);
      expect(Processo.validarNumeroCnj(formatado)).toBe(true);
      expect(Processo.normalizarNumeroCnj(formatado)).toBe(digitos);
      expect(Processo.formatarNumeroCnj(digitos)).toBe(formatado);
    });

    it('deve rejeitar CNJ com dígitos verificadores alterados (off-by-one)', () => {
      const { digitos } = gerarCnjValido(1234, 2023, 8, 26, 100);
      const ddOriginal = digitos.slice(7, 9);
      const ddAlterado = String((parseInt(ddOriginal, 10) + 1) % 97).padStart(2, '0');
      const cnjInvalido = digitos.slice(0, 7) + ddAlterado + digitos.slice(9);

      expect(Processo.validarNumeroCnj(cnjInvalido)).toBe(false);
    });

    it('deve rejeitar CNJ com sequencial zerado', () => {
      const dd = Processo.calcularDigitoVerificador('0000000', 2024, 8, 26, 100);
      const cnjZerado = `0000000${dd}20248260100`;
      expect(Processo.validarNumeroCnj(cnjZerado)).toBe(false);
    });

    it('deve rejeitar CNJ com segmento judiciário inválido (ex.: 0)', () => {
      const cnj = '00012345620240260100';
      expect(Processo.validarNumeroCnj(cnj)).toBe(false);
    });

    it('deve rejeitar CNJ com tamanho diferente de 20 dígitos', () => {
      expect(Processo.validarNumeroCnj('123456')).toBe(false);
      expect(Processo.validarNumeroCnj('123456789012345678901')).toBe(false);
      expect(() => Processo.normalizarNumeroCnj('12345')).toThrow(ErroProcessoInvalido);
    });
  });

  describe('Entidade Processo', () => {
    it('deve criar uma instância de Processo com dados válidos', () => {
      const { formatado, digitos } = gerarCnjValido(555, 2024, 8, 26, 100);
      const idEscritorio = randomUUID();
      const idCaso = randomUUID();

      const processo = Processo.criar({
        idEscritorio,
        idCaso,
        numeroCnj: formatado,
        relacaoComCaso: 'PRINCIPAL',
        tribunal: 'TJSP',
        comarca: 'São Paulo',
        vara: '1ª Vara Cível',
        instancia: 'PRIMEIRA_INSTANCIA',
        faseProcessual: 'CONHECIMENTO',
      });

      expect(processo.id).toBeDefined();
      expect(processo.idEscritorio).toBe(idEscritorio);
      expect(processo.idCaso).toBe(idCaso);
      expect(processo.numeroCnj).toBe(digitos);
      expect(processo.obterNumeroFormatado()).toBe(formatado);
      expect(processo.tribunal).toBe('TJSP');
      expect(processo.comarca).toBe('São Paulo');
      expect(processo.vara).toBe('1ª Vara Cível');
      expect(processo.instancia).toBe('PRIMEIRA_INSTANCIA');
      expect(processo.faseProcessual).toBe('CONHECIMENTO');
      expect(processo.versao).toBe(0);
    });

    it('deve lançar erro ao criar Processo com CNJ inválido', () => {
      expect(() =>
        Processo.criar({
          idEscritorio: randomUUID(),
          idCaso: randomUUID(),
          numeroCnj: '00000000000000000000',
          tribunal: 'TJSP',
          instancia: 'PRIMEIRA_INSTANCIA',
          faseProcessual: 'CONHECIMENTO',
        }),
      ).toThrow(ErroProcessoInvalido);
    });

    it('deve lançar erro ao criar Processo com tribunal curto ou vazio', () => {
      const { digitos } = gerarCnjValido(1);
      expect(() =>
        Processo.criar({
          idEscritorio: randomUUID(),
          idCaso: randomUUID(),
          numeroCnj: digitos,
          tribunal: ' ',
          instancia: 'PRIMEIRA_INSTANCIA',
          faseProcessual: 'CONHECIMENTO',
        }),
      ).toThrow(ErroProcessoInvalido);
    });

    it('deve editar campos e incrementar versão via CAS', () => {
      const { digitos } = gerarCnjValido(10);
      const processo = Processo.criar({
        idEscritorio: randomUUID(),
        idCaso: randomUUID(),
        numeroCnj: digitos,
        tribunal: 'TJSP',
        instancia: 'PRIMEIRA_INSTANCIA',
        faseProcessual: 'CONHECIMENTO',
      });

      const editado = processo.editar({
        faseProcessual: 'RECURSAL',
        instancia: 'SEGUNDA_INSTANCIA',
        tribunal: 'TJSP - 2ª Câmara',
      });

      expect(editado.versao).toBe(1);
      expect(editado.faseProcessual).toBe('RECURSAL');
      expect(editado.instancia).toBe('SEGUNDA_INSTANCIA');
      expect(editado.tribunal).toBe('TJSP - 2ª Câmara');
      expect(editado.numeroCnj).toBe(processo.numeroCnj);
    });

    it('deve alterar a fase processual via método dedicado', () => {
      const { digitos } = gerarCnjValido(20);
      const processo = Processo.criar({
        idEscritorio: randomUUID(),
        idCaso: randomUUID(),
        numeroCnj: digitos,
        tribunal: 'TRF-3',
        instancia: 'PRIMEIRA_INSTANCIA',
        faseProcessual: 'CONHECIMENTO',
      });

      const comNovaFase = processo.alterarFase('CUMPRIMENTO_SENTENCA');
      expect(comNovaFase.faseProcessual).toBe('CUMPRIMENTO_SENTENCA');
      expect(comNovaFase.versao).toBe(1);
    });
  });

  describe('Entidade MovimentacaoProcesso', () => {
    it('deve criar movimentação com dados válidos', () => {
      const idEscritorio = randomUUID();
      const idCaso = randomUUID();
      const idProcesso = randomUUID();
      const idAutor = randomUUID();
      const ocorridaEm = new Date('2024-05-10T14:30:00Z');

      const mov = MovimentacaoProcesso.criar({
        idEscritorio,
        idCaso,
        idProcesso,
        idAutor,
        ocorridaEm,
        descricao: 'Juntada de petição de manifestação sobre laudo pericial.',
      });

      expect(mov.id).toBeDefined();
      expect(mov.idEscritorio).toBe(idEscritorio);
      expect(mov.idCaso).toBe(idCaso);
      expect(mov.idProcesso).toBe(idProcesso);
      expect(mov.idAutor).toBe(idAutor);
      expect(mov.ocorridaEm).toEqual(ocorridaEm);
      expect(mov.descricao).toBe('Juntada de petição de manifestação sobre laudo pericial.');
      expect(mov.criadoEm).toBeInstanceOf(Date);
    });

    it('deve rejeitar descrição muito curta (< 3 caracteres)', () => {
      expect(() =>
        MovimentacaoProcesso.criar({
          idEscritorio: randomUUID(),
          idCaso: randomUUID(),
          idProcesso: randomUUID(),
          idAutor: randomUUID(),
          ocorridaEm: new Date(),
          descricao: 'ab',
        }),
      ).toThrow(ErroProcessoInvalido);
    });

    it('deve rejeitar descrição muito longa (> 2000 caracteres)', () => {
      expect(() =>
        MovimentacaoProcesso.criar({
          idEscritorio: randomUUID(),
          idCaso: randomUUID(),
          idProcesso: randomUUID(),
          idAutor: randomUUID(),
          ocorridaEm: new Date(),
          descricao: 'a'.repeat(2001),
        }),
      ).toThrow(ErroProcessoInvalido);
    });
  });
});

import { randomUUID } from 'node:crypto';
import { ErroProcessoInvalido } from './invalid-process-error.js';

export const RELACOES_PROCESSO_CASO = [
  'PRINCIPAL',
  'RECURSO',
  'INCIDENTE',
  'EXECUCAO_CUMPRIMENTO',
] as const;

export type RelacaoProcessoCaso = (typeof RELACOES_PROCESSO_CASO)[number];

export const INSTANCIAS_PROCESSO = [
  'PRIMEIRA_INSTANCIA',
  'SEGUNDA_INSTANCIA',
  'TRIBUNAL_SUPERIOR',
  'ADMINISTRATIVA',
] as const;

export type InstanciaProcesso = (typeof INSTANCIAS_PROCESSO)[number];

export const FASES_PROCESSUAIS = [
  'CONHECIMENTO',
  'LIQUIDACAO',
  'CUMPRIMENTO_SENTENCA',
  'EXECUCAO',
  'RECURSAL',
  'SUSPENSO',
  'ARQUIVADO',
] as const;

export type FaseProcessual = (typeof FASES_PROCESSUAIS)[number];

export interface PropriedadesProcesso {
  id: string;
  idEscritorio: string;
  idCaso: string;
  numeroCnj: string;
  relacaoComCaso: RelacaoProcessoCaso;
  tribunal: string;
  comarca?: string | null;
  vara?: string | null;
  instancia: InstanciaProcesso;
  faseProcessual: FaseProcessual;
  versao: number;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface DadosCriarProcesso {
  id?: string;
  idEscritorio: string;
  idCaso: string;
  numeroCnj: string;
  relacaoComCaso?: RelacaoProcessoCaso;
  tribunal: string;
  comarca?: string | null;
  vara?: string | null;
  instancia: InstanciaProcesso;
  faseProcessual: FaseProcessual;
  versao?: number;
  criadoEm?: Date;
  atualizadoEm?: Date;
}

export interface DadosEdicaoProcessoDominio {
  relacaoComCaso?: RelacaoProcessoCaso;
  tribunal?: string;
  comarca?: string | null;
  vara?: string | null;
  instancia?: InstanciaProcesso;
  faseProcessual?: FaseProcessual;
  versao?: number;
}

export class Processo {
  readonly id: string;
  readonly idEscritorio: string;
  readonly idCaso: string;
  readonly numeroCnj: string;
  readonly relacaoComCaso: RelacaoProcessoCaso;
  readonly tribunal: string;
  readonly comarca: string | null;
  readonly vara: string | null;
  readonly instancia: InstanciaProcesso;
  readonly faseProcessual: FaseProcessual;
  readonly versao: number;
  readonly criadoEm: Date;
  readonly atualizadoEm: Date;

  constructor(props: PropriedadesProcesso) {
    if (!props.id || typeof props.id !== 'string') {
      throw new ErroProcessoInvalido('id', 'O identificador do processo é obrigatório.');
    }
    if (!props.idEscritorio || typeof props.idEscritorio !== 'string') {
      throw new ErroProcessoInvalido('idEscritorio', 'O escritório vinculado é obrigatório.');
    }
    if (!props.idCaso || typeof props.idCaso !== 'string') {
      throw new ErroProcessoInvalido('idCaso', 'O caso vinculado é obrigatório.');
    }

    const cnjNormalizado = Processo.normalizarNumeroCnj(props.numeroCnj);
    if (!Processo.validarNumeroCnj(cnjNormalizado)) {
      throw new ErroProcessoInvalido(
        'numeroCnj',
        'O número CNJ informado não é válido segundo o padrão da Resolução CNJ nº 65/2008 (Mod 97-10).',
      );
    }

    if (!RELACOES_PROCESSO_CASO.includes(props.relacaoComCaso)) {
      throw new ErroProcessoInvalido('relacaoComCaso', 'A relação do processo com o caso é inválida.');
    }

    const tribunalNormalizado = props.tribunal?.trim();
    if (!tribunalNormalizado || tribunalNormalizado.length < 2 || tribunalNormalizado.length > 60) {
      throw new ErroProcessoInvalido('tribunal', 'O tribunal deve ter entre 2 e 60 caracteres.');
    }

    let comarcaNormalizada: string | null = null;
    if (props.comarca !== undefined && props.comarca !== null) {
      const c = props.comarca.trim();
      if (c.length > 0) {
        if (c.length < 2 || c.length > 120) {
          throw new ErroProcessoInvalido('comarca', 'A comarca deve ter entre 2 e 120 caracteres.');
        }
        comarcaNormalizada = c;
      }
    }

    let varaNormalizada: string | null = null;
    if (props.vara !== undefined && props.vara !== null) {
      const v = props.vara.trim();
      if (v.length > 0) {
        if (v.length < 2 || v.length > 120) {
          throw new ErroProcessoInvalido('vara', 'A vara deve ter entre 2 e 120 caracteres.');
        }
        varaNormalizada = v;
      }
    }

    if (!INSTANCIAS_PROCESSO.includes(props.instancia)) {
      throw new ErroProcessoInvalido('instancia', 'A instância do processo é inválida.');
    }

    if (!FASES_PROCESSUAIS.includes(props.faseProcessual)) {
      throw new ErroProcessoInvalido('faseProcessual', 'A fase processual é inválida.');
    }

    if (typeof props.versao !== 'number' || !Number.isInteger(props.versao) || props.versao < 0) {
      throw new ErroProcessoInvalido('versao', 'A versão deve ser um inteiro não-negativo.');
    }

    if (!(props.criadoEm instanceof Date) || isNaN(props.criadoEm.getTime())) {
      throw new ErroProcessoInvalido('criadoEm', 'A data de criação é inválida.');
    }

    if (!(props.atualizadoEm instanceof Date) || isNaN(props.atualizadoEm.getTime())) {
      throw new ErroProcessoInvalido('atualizadoEm', 'A data de atualização é inválida.');
    }

    this.id = props.id;
    this.idEscritorio = props.idEscritorio;
    this.idCaso = props.idCaso;
    this.numeroCnj = cnjNormalizado;
    this.relacaoComCaso = props.relacaoComCaso;
    this.tribunal = tribunalNormalizado;
    this.comarca = comarcaNormalizada;
    this.vara = varaNormalizada;
    this.instancia = props.instancia;
    this.faseProcessual = props.faseProcessual;
    this.versao = props.versao;
    this.criadoEm = props.criadoEm;
    this.atualizadoEm = props.atualizadoEm;
  }

  static normalizarNumeroCnj(valor: string): string {
    if (!valor || typeof valor !== 'string') {
      throw new ErroProcessoInvalido('numeroCnj', 'O número CNJ é obrigatório.');
    }
    const digitos = valor.replace(/\D/g, '');
    if (digitos.length !== 20) {
      throw new ErroProcessoInvalido('numeroCnj', 'O número CNJ deve conter exatamente 20 dígitos numéricos.');
    }
    return digitos;
  }

  static validarNumeroCnj(valor: string): boolean {
    if (!valor || typeof valor !== 'string') return false;
    const digitos = valor.replace(/\D/g, '');
    if (digitos.length !== 20) return false;

    const sequencial = digitos.slice(0, 7);
    const digitoVerificador = digitos.slice(7, 9);
    const ano = parseInt(digitos.slice(9, 13), 10);
    const segmento = digitos.slice(13, 14);
    const tribunal = digitos.slice(14, 16);
    const origem = digitos.slice(16, 20);

    if (sequencial === '0000000') return false;

    const anoAtual = new Date().getFullYear();
    if (isNaN(ano) || ano < 1900 || ano > anoAtual + 1) return false;

    if (!/^[1-9]$/.test(segmento)) return false;

    const blocoSemDigito = `${sequencial}${ano}${segmento}${tribunal}${origem}00`;
    const resto = BigInt(blocoSemDigito) % 97n;
    const ddCalculado = (98n - resto).toString().padStart(2, '0');

    return digitoVerificador === ddCalculado;
  }

  static calcularDigitoVerificador(
    sequencial: string,
    ano: string | number,
    segmento: string | number,
    tribunal: string | number,
    origem: string | number,
  ): string {
    const s = String(sequencial).replace(/\D/g, '').padStart(7, '0');
    const a = String(ano).replace(/\D/g, '').padStart(4, '0');
    const j = String(segmento).replace(/\D/g, '').slice(0, 1);
    const tr = String(tribunal).replace(/\D/g, '').padStart(2, '0');
    const o = String(origem).replace(/\D/g, '').padStart(4, '0');

    const bloco = `${s}${a}${j}${tr}${o}00`;
    const resto = BigInt(bloco) % 97n;
    return (98n - resto).toString().padStart(2, '0');
  }

  static formatarNumeroCnj(valor: string): string {
    const d = valor.replace(/\D/g, '');
    if (d.length !== 20) return valor;
    return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
  }

  static criar(dados: DadosCriarProcesso): Processo {
    const agora = new Date();
    return new Processo({
      id: dados.id ?? randomUUID(),
      idEscritorio: dados.idEscritorio,
      idCaso: dados.idCaso,
      numeroCnj: dados.numeroCnj,
      relacaoComCaso: dados.relacaoComCaso ?? 'PRINCIPAL',
      tribunal: dados.tribunal,
      comarca: dados.comarca ?? null,
      vara: dados.vara ?? null,
      instancia: dados.instancia,
      faseProcessual: dados.faseProcessual,
      versao: dados.versao ?? 0,
      criadoEm: dados.criadoEm ?? agora,
      atualizadoEm: dados.atualizadoEm ?? agora,
    });
  }

  static restaurar(props: PropriedadesProcesso): Processo {
    return new Processo(props);
  }

  obterNumeroFormatado(): string {
    return Processo.formatarNumeroCnj(this.numeroCnj);
  }

  editar(dados: DadosEdicaoProcessoDominio): Processo {
    const agora = new Date();
    return new Processo({
      id: this.id,
      idEscritorio: this.idEscritorio,
      idCaso: this.idCaso,
      numeroCnj: this.numeroCnj,
      relacaoComCaso: dados.relacaoComCaso ?? this.relacaoComCaso,
      tribunal: dados.tribunal ?? this.tribunal,
      comarca: dados.comarca !== undefined ? dados.comarca : this.comarca,
      vara: dados.vara !== undefined ? dados.vara : this.vara,
      instancia: dados.instancia ?? this.instancia,
      faseProcessual: dados.faseProcessual ?? this.faseProcessual,
      versao: this.versao + 1,
      criadoEm: this.criadoEm,
      atualizadoEm: agora,
    });
  }

  alterarFase(novaFase: FaseProcessual): Processo {
    return this.editar({ faseProcessual: novaFase });
  }
}

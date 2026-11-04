import { randomUUID } from 'node:crypto';
import { ErroCasoInvalido } from './invalid-case-error.js';

export const TIPOS_PARTICIPACAO_CASO = [
  'PARTE_CONTRARIA',
  'ADVOGADO_CONTRARIO',
  'TERCEIRO_INTERESSADO',
  'TESTEMUNHA',
  'PERITO',
  'OUTRO',
] as const;

export type TipoParticipacaoCaso = (typeof TIPOS_PARTICIPACAO_CASO)[number];

export interface EstadoParteEnvolvidaCaso {
  id: string;
  idEscritorio: string;
  idCaso: string;
  tipoParticipacao: TipoParticipacaoCaso;
  nome: string;
  documento?: string | null;
  oab?: string | null;
  contato?: string | null;
  observacao?: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

const PADRAO_UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

function validarCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf)) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += Number.parseInt(cpf[i]!, 10) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== Number.parseInt(cpf[9]!, 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += Number.parseInt(cpf[i]!, 10) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === Number.parseInt(cpf[10]!, 10);
}

function validarCnpj(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let soma = 0;
  for (let i = 0; i < 12; i++) {
    soma += Number.parseInt(cnpj[i]!, 10) * pesos1[i]!;
  }
  let resto = soma % 11;
  const digito1 = resto < 2 ? 0 : 11 - resto;
  if (digito1 !== Number.parseInt(cnpj[12]!, 10)) return false;

  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  soma = 0;
  for (let i = 0; i < 13; i++) {
    soma += Number.parseInt(cnpj[i]!, 10) * pesos2[i]!;
  }
  resto = soma % 11;
  const digito2 = resto < 2 ? 0 : 11 - resto;
  return digito2 === Number.parseInt(cnpj[13]!, 10);
}

export class ParteEnvolvidaCaso {
  readonly #id: string;
  readonly #idEscritorio: string;
  readonly #idCaso: string;
  readonly #tipoParticipacao: TipoParticipacaoCaso;
  readonly #nome: string;
  readonly #documento: string | null;
  readonly #oab: string | null;
  readonly #contato: string | null;
  readonly #observacao: string | null;
  readonly #criadoEm: number;
  readonly #atualizadoEm: number;

  private constructor(estado: EstadoParteEnvolvidaCaso) {
    if (typeof estado.id !== 'string' || !PADRAO_UUID.test(estado.id)) {
      throw new ErroCasoInvalido('id');
    }
    if (typeof estado.idEscritorio !== 'string' || !PADRAO_UUID.test(estado.idEscritorio)) {
      throw new ErroCasoInvalido('idEscritorio');
    }
    if (typeof estado.idCaso !== 'string' || !PADRAO_UUID.test(estado.idCaso)) {
      throw new ErroCasoInvalido('id');
    }
    if (!TIPOS_PARTICIPACAO_CASO.includes(estado.tipoParticipacao)) {
      throw new ErroCasoInvalido('tipoParticipacao');
    }

    const nome = ParteEnvolvidaCaso.normalizarNome(estado.nome);
    const documento = ParteEnvolvidaCaso.normalizarDocumento(estado.documento);
    const oab = ParteEnvolvidaCaso.normalizarOab(estado.oab);
    const contato = ParteEnvolvidaCaso.normalizarContato(estado.contato);
    const observacao = ParteEnvolvidaCaso.normalizarObservacao(estado.observacao);

    if (!(estado.criadoEm instanceof Date) || !Number.isFinite(estado.criadoEm.getTime())) {
      throw new ErroCasoInvalido('criadoEm');
    }
    if (
      !(estado.atualizadoEm instanceof Date) ||
      !Number.isFinite(estado.atualizadoEm.getTime()) ||
      estado.atualizadoEm.getTime() < estado.criadoEm.getTime()
    ) {
      throw new ErroCasoInvalido('atualizadoEm');
    }

    this.#id = estado.id.toLowerCase();
    this.#idEscritorio = estado.idEscritorio.toLowerCase();
    this.#idCaso = estado.idCaso.toLowerCase();
    this.#tipoParticipacao = estado.tipoParticipacao;
    this.#nome = nome;
    this.#documento = documento;
    this.#oab = oab;
    this.#contato = contato;
    this.#observacao = observacao;
    this.#criadoEm = estado.criadoEm.getTime();
    this.#atualizadoEm = estado.atualizadoEm.getTime();
  }

  static normalizarNome(nomeInformado: unknown): string {
    if (typeof nomeInformado !== 'string') {
      throw new ErroCasoInvalido('nome');
    }
    const nome = nomeInformado.trim();
    const tamanho = Array.from(nome).length;
    if (tamanho < 2 || tamanho > 150) {
      throw new ErroCasoInvalido('nome');
    }
    return nome;
  }

  static normalizarDocumento(docInformado: unknown): string | null {
    if (docInformado === null || docInformado === undefined) {
      return null;
    }
    if (typeof docInformado !== 'string') {
      throw new ErroCasoInvalido('documento');
    }
    const digitos = docInformado.replace(/\D/g, '');
    if (digitos.length === 0) {
      return null;
    }
    if (digitos.length === 11) {
      if (!validarCpf(digitos)) {
        throw new ErroCasoInvalido('documento');
      }
      return digitos;
    }
    if (digitos.length === 14) {
      if (!validarCnpj(digitos)) {
        throw new ErroCasoInvalido('documento');
      }
      return digitos;
    }
    throw new ErroCasoInvalido('documento');
  }

  static normalizarOab(oabInformada: unknown): string | null {
    if (oabInformada === null || oabInformada === undefined) {
      return null;
    }
    if (typeof oabInformada !== 'string') {
      throw new ErroCasoInvalido('oab');
    }
    const limpo = oabInformada.trim();
    if (limpo.length === 0) {
      return null;
    }
    if (Array.from(limpo).length > 20) {
      throw new ErroCasoInvalido('oab');
    }
    return limpo;
  }

  static normalizarContato(contatoInformado: unknown): string | null {
    if (contatoInformado === null || contatoInformado === undefined) {
      return null;
    }
    if (typeof contatoInformado !== 'string') {
      throw new ErroCasoInvalido('contato');
    }
    const limpo = contatoInformado.trim();
    if (limpo.length === 0) {
      return null;
    }
    if (Array.from(limpo).length > 200) {
      throw new ErroCasoInvalido('contato');
    }
    return limpo;
  }

  static normalizarObservacao(obsInformada: unknown): string | null {
    if (obsInformada === null || obsInformada === undefined) {
      return null;
    }
    if (typeof obsInformada !== 'string') {
      throw new ErroCasoInvalido('observacao');
    }
    const limpo = obsInformada.trim();
    if (limpo.length === 0) {
      return null;
    }
    if (Array.from(limpo).length > 500) {
      throw new ErroCasoInvalido('observacao');
    }
    return limpo;
  }

  static criar(entrada: {
    idEscritorio: string;
    idCaso: string;
    tipoParticipacao: TipoParticipacaoCaso;
    nome: string;
    documento?: string | null;
    oab?: string | null;
    contato?: string | null;
    observacao?: string | null;
    id?: string;
  }): ParteEnvolvidaCaso {
    const agora = new Date();
    return new ParteEnvolvidaCaso({
      id: entrada.id === undefined ? randomUUID() : entrada.id,
      idEscritorio: entrada.idEscritorio,
      idCaso: entrada.idCaso,
      tipoParticipacao: entrada.tipoParticipacao,
      nome: entrada.nome,
      documento: entrada.documento,
      oab: entrada.oab,
      contato: entrada.contato,
      observacao: entrada.observacao,
      criadoEm: agora,
      atualizadoEm: agora,
    });
  }

  static restaurar(estado: EstadoParteEnvolvidaCaso): ParteEnvolvidaCaso {
    return new ParteEnvolvidaCaso(estado);
  }

  atualizar(dados: {
    tipoParticipacao?: TipoParticipacaoCaso;
    nome?: string;
    documento?: string | null;
    oab?: string | null;
    contato?: string | null;
    observacao?: string | null;
  }): ParteEnvolvidaCaso {
    const agora = new Date();
    return new ParteEnvolvidaCaso({
      id: this.#id,
      idEscritorio: this.#idEscritorio,
      idCaso: this.#idCaso,
      tipoParticipacao: dados.tipoParticipacao ?? this.#tipoParticipacao,
      nome: dados.nome ?? this.#nome,
      documento: dados.documento !== undefined ? dados.documento : this.#documento,
      oab: dados.oab !== undefined ? dados.oab : this.#oab,
      contato: dados.contato !== undefined ? dados.contato : this.#contato,
      observacao: dados.observacao !== undefined ? dados.observacao : this.#observacao,
      criadoEm: new Date(this.#criadoEm),
      atualizadoEm: agora,
    });
  }

  get id(): string { return this.#id; }
  get idEscritorio(): string { return this.#idEscritorio; }
  get idCaso(): string { return this.#idCaso; }
  get tipoParticipacao(): TipoParticipacaoCaso { return this.#tipoParticipacao; }
  get nome(): string { return this.#nome; }
  get documento(): string | null { return this.#documento; }
  get oab(): string | null { return this.#oab; }
  get contato(): string | null { return this.#contato; }
  get observacao(): string | null { return this.#observacao; }
  get criadoEm(): Date { return new Date(this.#criadoEm); }
  get atualizadoEm(): Date { return new Date(this.#atualizadoEm); }
}

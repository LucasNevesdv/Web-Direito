import { randomUUID } from 'node:crypto';
import { ErroClienteInvalido } from './invalid-client-error.js';

export interface EstadoContatoCliente {
  id: string;
  idEscritorio: string;
  idCliente: string;
  nome: string;
  cargoOuRelacao?: string | null;
  email?: string | null;
  telefone?: string | null;
  observacao?: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

const PADRAO_UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const PADRAO_EMAIL_LOCAL = /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+$/;
const PADRAO_SEGMENTO_DOMINIO_EMAIL = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/;

export class ContatoCliente {
  readonly #id: string;
  readonly #idEscritorio: string;
  readonly #idCliente: string;
  readonly #nome: string;
  readonly #cargoOuRelacao: string | null;
  readonly #email: string | null;
  readonly #telefone: string | null;
  readonly #observacao: string | null;
  readonly #criadoEm: number;
  readonly #atualizadoEm: number;

  private constructor(estado: EstadoContatoCliente) {
    if (typeof estado.id !== 'string' || !PADRAO_UUID.test(estado.id)) {
      throw new ErroClienteInvalido('id');
    }
    if (typeof estado.idEscritorio !== 'string' || !PADRAO_UUID.test(estado.idEscritorio)) {
      throw new ErroClienteInvalido('idEscritorio');
    }
    if (typeof estado.idCliente !== 'string' || !PADRAO_UUID.test(estado.idCliente)) {
      throw new ErroClienteInvalido('id');
    }

    const nome = ContatoCliente.normalizarNome(estado.nome);
    const cargoOuRelacao = ContatoCliente.normalizarCargoOuRelacao(estado.cargoOuRelacao);
    const email = ContatoCliente.normalizarEmail(estado.email);
    const telefone = ContatoCliente.normalizarTelefone(estado.telefone);
    const observacao = ContatoCliente.normalizarObservacao(estado.observacao);

    if (!email && !telefone) {
      throw new ErroClienteInvalido('contato');
    }

    if (!(estado.criadoEm instanceof Date) || !Number.isFinite(estado.criadoEm.getTime())) {
      throw new ErroClienteInvalido('criadoEm');
    }
    if (
      !(estado.atualizadoEm instanceof Date) ||
      !Number.isFinite(estado.atualizadoEm.getTime()) ||
      estado.atualizadoEm.getTime() < estado.criadoEm.getTime()
    ) {
      throw new ErroClienteInvalido('atualizadoEm');
    }

    this.#id = estado.id.toLowerCase();
    this.#idEscritorio = estado.idEscritorio.toLowerCase();
    this.#idCliente = estado.idCliente.toLowerCase();
    this.#nome = nome;
    this.#cargoOuRelacao = cargoOuRelacao;
    this.#email = email;
    this.#telefone = telefone;
    this.#observacao = observacao;
    this.#criadoEm = estado.criadoEm.getTime();
    this.#atualizadoEm = estado.atualizadoEm.getTime();
  }

  static normalizarNome(nomeInformado: unknown): string {
    if (typeof nomeInformado !== 'string') {
      throw new ErroClienteInvalido('nome');
    }
    const nome = nomeInformado.trim();
    const tamanho = Array.from(nome).length;
    if (tamanho < 2 || tamanho > 120) {
      throw new ErroClienteInvalido('nome');
    }
    return nome;
  }

  static normalizarCargoOuRelacao(cargoInformado: unknown): string | null {
    if (cargoInformado === null || cargoInformado === undefined) {
      return null;
    }
    if (typeof cargoInformado !== 'string') {
      throw new ErroClienteInvalido('contato');
    }
    const limpo = cargoInformado.trim();
    if (limpo.length === 0) {
      return null;
    }
    const tamanho = Array.from(limpo).length;
    if (tamanho < 2 || tamanho > 80) {
      throw new ErroClienteInvalido('contato');
    }
    return limpo;
  }

  static normalizarEmail(emailInformado: unknown): string | null {
    if (emailInformado === null || emailInformado === undefined) {
      return null;
    }
    if (typeof emailInformado !== 'string') {
      throw new ErroClienteInvalido('email');
    }
    const email = emailInformado.trim().toLowerCase();
    if (email.length === 0) {
      return null;
    }
    const partes = email.split('@');
    const [parteLocalDoEmail = '', dominio = ''] = partes;
    const segmentosDominio = dominio.split('.');
    if (
      email.length > 254 ||
      partes.length !== 2 ||
      parteLocalDoEmail.length > 64 ||
      !PADRAO_EMAIL_LOCAL.test(parteLocalDoEmail) ||
      parteLocalDoEmail.startsWith('.') ||
      parteLocalDoEmail.endsWith('.') ||
      parteLocalDoEmail.includes('..') ||
      segmentosDominio.length < 2 ||
      !segmentosDominio.every((rotulo) => PADRAO_SEGMENTO_DOMINIO_EMAIL.test(rotulo)) ||
      !/^[a-z]{2,}$/.test(segmentosDominio[segmentosDominio.length - 1]!)
    ) {
      throw new ErroClienteInvalido('email');
    }
    return email;
  }

  static normalizarTelefone(telefoneInformado: unknown): string | null {
    if (telefoneInformado === null || telefoneInformado === undefined) {
      return null;
    }
    if (typeof telefoneInformado !== 'string') {
      throw new ErroClienteInvalido('telefone');
    }
    const digitos = telefoneInformado.replace(/\D/g, '');
    if (digitos.length === 0) {
      return null;
    }
    if (digitos.length < 10 || digitos.length > 15) {
      throw new ErroClienteInvalido('telefone');
    }
    return digitos;
  }

  static normalizarObservacao(obs: unknown): string | null {
    if (obs === null || obs === undefined) {
      return null;
    }
    if (typeof obs !== 'string') {
      throw new ErroClienteInvalido('contato');
    }
    const limpo = obs.trim();
    if (limpo.length === 0) {
      return null;
    }
    if (Array.from(limpo).length > 500) {
      throw new ErroClienteInvalido('contato');
    }
    return limpo;
  }

  static criar(entrada: {
    idEscritorio: string;
    idCliente: string;
    nome: string;
    cargoOuRelacao?: string | null;
    email?: string | null;
    telefone?: string | null;
    observacao?: string | null;
    id?: string;
  }): ContatoCliente {
    const agora = new Date();
    return new ContatoCliente({
      id: entrada.id === undefined ? randomUUID() : entrada.id,
      idEscritorio: entrada.idEscritorio,
      idCliente: entrada.idCliente,
      nome: entrada.nome,
      cargoOuRelacao: entrada.cargoOuRelacao,
      email: entrada.email,
      telefone: entrada.telefone,
      observacao: entrada.observacao,
      criadoEm: agora,
      atualizadoEm: agora,
    });
  }

  static restaurar(estado: EstadoContatoCliente): ContatoCliente {
    return new ContatoCliente(estado);
  }

  atualizar(dados: {
    nome: string;
    cargoOuRelacao?: string | null;
    email?: string | null;
    telefone?: string | null;
    observacao?: string | null;
  }): ContatoCliente {
    const agora = new Date();
    return new ContatoCliente({
      id: this.#id,
      idEscritorio: this.#idEscritorio,
      idCliente: this.#idCliente,
      nome: dados.nome,
      cargoOuRelacao: dados.cargoOuRelacao,
      email: dados.email,
      telefone: dados.telefone,
      observacao: dados.observacao,
      criadoEm: new Date(this.#criadoEm),
      atualizadoEm: agora,
    });
  }

  get id(): string { return this.#id; }
  get idEscritorio(): string { return this.#idEscritorio; }
  get idCliente(): string { return this.#idCliente; }
  get nome(): string { return this.#nome; }
  get cargoOuRelacao(): string | null { return this.#cargoOuRelacao; }
  get email(): string | null { return this.#email; }
  get telefone(): string | null { return this.#telefone; }
  get observacao(): string | null { return this.#observacao; }
  get criadoEm(): Date { return new Date(this.#criadoEm); }
  get atualizadoEm(): Date { return new Date(this.#atualizadoEm); }
}

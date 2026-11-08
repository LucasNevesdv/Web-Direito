import { randomUUID } from 'node:crypto';
import { ErroClienteInvalido } from './invalid-client-error.js';

export type TipoPessoaCliente = 'PESSOA_FISICA' | 'PESSOA_JURIDICA';
export type SituacaoCliente = 'ATIVO' | 'INATIVO';

export interface EnderecoCliente {
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

export interface EstadoCliente {
  id: string;
  idEscritorio: string;
  tipoPessoa: TipoPessoaCliente;
  nome: string;
  nomeSocial?: string | null;
  documento: string;
  email?: string | null;
  telefone?: string | null;
  endereco?: EnderecoCliente | null;
  observacoesInternas?: string | null;
  idVinculoResponsavel?: string | null;
  situacao: SituacaoCliente;
  versao: number;
  criadoEm: Date;
  atualizadoEm: Date;
}

const PADRAO_UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const PADRAO_EMAIL_LOCAL = /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+$/;
const PADRAO_SEGMENTO_DOMINIO_EMAIL = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/;
const UFS_VALIDAS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

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

export class Cliente {
  readonly #id: string;
  readonly #idEscritorio: string;
  readonly #tipoPessoa: TipoPessoaCliente;
  readonly #nome: string;
  readonly #nomeSocial: string | null;
  readonly #documento: string;
  readonly #email: string | null;
  readonly #telefone: string | null;
  readonly #endereco: EnderecoCliente | null;
  readonly #observacoesInternas: string | null;
  readonly #idVinculoResponsavel: string | null;
  readonly #situacao: SituacaoCliente;
  readonly #versao: number;
  readonly #criadoEm: number;
  readonly #atualizadoEm: number;

  private constructor(estado: EstadoCliente) {
    if (typeof estado.id !== 'string' || !PADRAO_UUID.test(estado.id)) {
      throw new ErroClienteInvalido('id');
    }
    if (typeof estado.idEscritorio !== 'string' || !PADRAO_UUID.test(estado.idEscritorio)) {
      throw new ErroClienteInvalido('idEscritorio');
    }
    if (estado.tipoPessoa !== 'PESSOA_FISICA' && estado.tipoPessoa !== 'PESSOA_JURIDICA') {
      throw new ErroClienteInvalido('tipoPessoa');
    }

    const nome = Cliente.normalizarNome(estado.nome);
    const nomeSocial = Cliente.normalizarNomeSocial(estado.nomeSocial);
    const documento = Cliente.normalizarDocumento(estado.documento, estado.tipoPessoa);
    const email = Cliente.normalizarEmail(estado.email);
    const telefone = Cliente.normalizarTelefone(estado.telefone);
    const endereco = Cliente.normalizarEndereco(estado.endereco);
    const observacoesInternas = Cliente.normalizarObservacoesInternas(estado.observacoesInternas);
    const idVinculoResponsavel = Cliente.normalizarIdVinculoResponsavel(estado.idVinculoResponsavel);

    if (estado.situacao !== 'ATIVO' && estado.situacao !== 'INATIVO') {
      throw new ErroClienteInvalido('situacao');
    }
    if (typeof estado.versao !== 'number' || !Number.isInteger(estado.versao) || estado.versao < 0) {
      throw new ErroClienteInvalido('versao');
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
    this.#tipoPessoa = estado.tipoPessoa;
    this.#nome = nome;
    this.#nomeSocial = nomeSocial;
    this.#documento = documento;
    this.#email = email;
    this.#telefone = telefone;
    this.#endereco = endereco;
    this.#observacoesInternas = observacoesInternas;
    this.#idVinculoResponsavel = idVinculoResponsavel;
    this.#situacao = estado.situacao;
    this.#versao = estado.versao;
    this.#criadoEm = estado.criadoEm.getTime();
    this.#atualizadoEm = estado.atualizadoEm.getTime();
  }

  static normalizarNome(nomeInformado: unknown): string {
    if (typeof nomeInformado !== 'string') {
      throw new ErroClienteInvalido('nome');
    }
    const nome = nomeInformado.trim();
    const tamanho = Array.from(nome).length;
    if (tamanho < 2 || tamanho > 150) {
      throw new ErroClienteInvalido('nome');
    }
    return nome;
  }

  static normalizarNomeSocial(nomeSocialInformado: unknown): string | null {
    if (nomeSocialInformado === null || nomeSocialInformado === undefined) {
      return null;
    }
    if (typeof nomeSocialInformado !== 'string') {
      throw new ErroClienteInvalido('nomeSocial');
    }
    const nomeSocial = nomeSocialInformado.trim();
    if (nomeSocial.length === 0) {
      return null;
    }
    const tamanho = Array.from(nomeSocial).length;
    if (tamanho < 2 || tamanho > 150) {
      throw new ErroClienteInvalido('nomeSocial');
    }
    return nomeSocial;
  }

  static normalizarDocumento(documentoInformado: unknown, tipoPessoa: TipoPessoaCliente): string {
    if (typeof documentoInformado !== 'string') {
      throw new ErroClienteInvalido('documento');
    }
    const digitos = documentoInformado.replace(/\D/g, '');
    if (tipoPessoa === 'PESSOA_FISICA') {
      if (!validarCpf(digitos)) {
        throw new ErroClienteInvalido('documento');
      }
    } else {
      if (!validarCnpj(digitos)) {
        throw new ErroClienteInvalido('documento');
      }
    }
    return digitos;
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

  static normalizarEndereco(enderecoInformado: unknown): EnderecoCliente | null {
    if (enderecoInformado === null || enderecoInformado === undefined) {
      return null;
    }
    if (typeof enderecoInformado !== 'object') {
      throw new ErroClienteInvalido('endereco');
    }
    const e = enderecoInformado as Record<string, unknown>;

    let cep: string | null = null;
    if (e.cep !== null && e.cep !== undefined) {
      if (typeof e.cep !== 'string') throw new ErroClienteInvalido('endereco');
      const digitosCep = e.cep.replace(/\D/g, '');
      if (digitosCep.length > 0) {
        if (!/^\d{8}$/.test(digitosCep)) throw new ErroClienteInvalido('endereco');
        cep = digitosCep;
      }
    }

    let logradouro: string | null = null;
    if (e.logradouro !== null && e.logradouro !== undefined) {
      if (typeof e.logradouro !== 'string') throw new ErroClienteInvalido('endereco');
      const limpo = e.logradouro.trim();
      if (limpo.length > 0) {
        if (Array.from(limpo).length > 160) throw new ErroClienteInvalido('endereco');
        logradouro = limpo;
      }
    }

    let numero: string | null = null;
    if (e.numero !== null && e.numero !== undefined) {
      if (typeof e.numero !== 'string') throw new ErroClienteInvalido('endereco');
      const limpo = e.numero.trim();
      if (limpo.length > 0) {
        if (Array.from(limpo).length > 20) throw new ErroClienteInvalido('endereco');
        numero = limpo;
      }
    }

    let complemento: string | null = null;
    if (e.complemento !== null && e.complemento !== undefined) {
      if (typeof e.complemento !== 'string') throw new ErroClienteInvalido('endereco');
      const limpo = e.complemento.trim();
      if (limpo.length > 0) {
        if (Array.from(limpo).length > 80) throw new ErroClienteInvalido('endereco');
        complemento = limpo;
      }
    }

    let bairro: string | null = null;
    if (e.bairro !== null && e.bairro !== undefined) {
      if (typeof e.bairro !== 'string') throw new ErroClienteInvalido('endereco');
      const limpo = e.bairro.trim();
      if (limpo.length > 0) {
        if (Array.from(limpo).length > 80) throw new ErroClienteInvalido('endereco');
        bairro = limpo;
      }
    }

    let cidade: string | null = null;
    if (e.cidade !== null && e.cidade !== undefined) {
      if (typeof e.cidade !== 'string') throw new ErroClienteInvalido('endereco');
      const limpo = e.cidade.trim();
      if (limpo.length > 0) {
        if (Array.from(limpo).length > 80) throw new ErroClienteInvalido('endereco');
        cidade = limpo;
      }
    }

    let uf: string | null = null;
    if (e.uf !== null && e.uf !== undefined) {
      if (typeof e.uf !== 'string') throw new ErroClienteInvalido('endereco');
      const limpo = e.uf.trim().toUpperCase();
      if (limpo.length > 0) {
        if (!UFS_VALIDAS.has(limpo)) throw new ErroClienteInvalido('endereco');
        uf = limpo;
      }
    }

    if (!cep && !logradouro && !numero && !complemento && !bairro && !cidade && !uf) {
      return null;
    }

    return { cep, logradouro, numero, complemento, bairro, cidade, uf };
  }

  static normalizarObservacoesInternas(obs: unknown): string | null {
    if (obs === null || obs === undefined) {
      return null;
    }
    if (typeof obs !== 'string') {
      throw new ErroClienteInvalido('observacoesInternas');
    }
    const limpo = obs.trim();
    if (limpo.length === 0) {
      return null;
    }
    if (Array.from(limpo).length > 4000) {
      throw new ErroClienteInvalido('observacoesInternas');
    }
    return limpo;
  }

  static normalizarIdVinculoResponsavel(id: unknown): string | null {
    if (id === null || id === undefined) {
      return null;
    }
    if (typeof id !== 'string') {
      throw new ErroClienteInvalido('idVinculoResponsavel');
    }
    const limpo = id.trim();
    if (limpo.length === 0) {
      return null;
    }
    if (!PADRAO_UUID.test(limpo)) {
      throw new ErroClienteInvalido('idVinculoResponsavel');
    }
    return limpo.toLowerCase();
  }

  static criar(entrada: {
    idEscritorio: string;
    tipoPessoa: TipoPessoaCliente;
    nome: string;
    nomeSocial?: string | null;
    documento: string;
    email?: string | null;
    telefone?: string | null;
    endereco?: EnderecoCliente | null;
    observacoesInternas?: string | null;
    idVinculoResponsavel?: string | null;
    id?: string;
  }): Cliente {
    const agora = new Date();
    return new Cliente({
      id: entrada.id === undefined ? randomUUID() : entrada.id,
      idEscritorio: entrada.idEscritorio,
      tipoPessoa: entrada.tipoPessoa,
      nome: entrada.nome,
      nomeSocial: entrada.nomeSocial,
      documento: entrada.documento,
      email: entrada.email,
      telefone: entrada.telefone,
      endereco: entrada.endereco,
      observacoesInternas: entrada.observacoesInternas,
      idVinculoResponsavel: entrada.idVinculoResponsavel,
      situacao: 'ATIVO',
      versao: 0,
      criadoEm: agora,
      atualizadoEm: agora,
    });
  }

  static restaurar(estado: EstadoCliente): Cliente {
    return new Cliente(estado);
  }

  get id(): string { return this.#id; }
  get idEscritorio(): string { return this.#idEscritorio; }
  get tipoPessoa(): TipoPessoaCliente { return this.#tipoPessoa; }
  get nome(): string { return this.#nome; }
  get nomeSocial(): string | null { return this.#nomeSocial; }
  get documento(): string { return this.#documento; }
  get email(): string | null { return this.#email; }
  get telefone(): string | null { return this.#telefone; }
  get endereco(): EnderecoCliente | null { return this.#endereco ? { ...this.#endereco } : null; }
  get observacoesInternas(): string | null { return this.#observacoesInternas; }
  get idVinculoResponsavel(): string | null { return this.#idVinculoResponsavel; }
  get situacao(): SituacaoCliente { return this.#situacao; }
  get versao(): number { return this.#versao; }
  get criadoEm(): Date { return new Date(this.#criadoEm); }
  get atualizadoEm(): Date { return new Date(this.#atualizadoEm); }
}

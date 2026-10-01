import { randomUUID } from 'node:crypto';
import { ErroUsuarioInvalido } from './invalid-user-error.js';

export type SituacaoUsuario = 'ATIVO' | 'INATIVO';

interface EstadoUsuario {
  id: string;
  nome: string;
  email: string;
  hashSenha: string;
  deveAlterarSenha?: boolean;
  situacao: SituacaoUsuario;
  criadoEm: Date;
  atualizadoEm: Date;
}

const PADRAO_UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const PADRAO_EMAIL_LOCAL = /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+$/;
const PADRAO_SEGMENTO_DOMINIO_EMAIL = /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/;

export class Usuario {
  readonly #id: string;
  readonly #nome: string;
  readonly #email: string;
  readonly #hashSenha: string;
  readonly deveAlterarSenha: boolean;
  readonly #situacao: SituacaoUsuario;
  readonly #criadoEm: number;
  readonly #atualizadoEm: number;

  private constructor(estado: EstadoUsuario) {
    if (typeof estado.id !== 'string' || !PADRAO_UUID.test(estado.id)) {
      throw new ErroUsuarioInvalido('id');
    }
    const nome = Usuario.normalizarNome(estado.nome);
    const email = Usuario.normalizarEmail(estado.email);
    if (typeof estado.hashSenha !== 'string' || estado.hashSenha.trim().length === 0) {
      throw new ErroUsuarioInvalido('hashSenha');
    }
    if (estado.situacao !== 'ATIVO' && estado.situacao !== 'INATIVO') {
      throw new ErroUsuarioInvalido('situacao');
    }
    if (!(estado.criadoEm instanceof Date) || !Number.isFinite(estado.criadoEm.getTime())) {
      throw new ErroUsuarioInvalido('criadoEm');
    }
    if (
      !(estado.atualizadoEm instanceof Date) ||
      !Number.isFinite(estado.atualizadoEm.getTime()) ||
      estado.atualizadoEm.getTime() < estado.criadoEm.getTime()
    ) {
      throw new ErroUsuarioInvalido('atualizadoEm');
    }

    this.#id = estado.id.toLowerCase();
    this.#nome = nome;
    this.#email = email;
    this.#hashSenha = estado.hashSenha;
    if (estado.deveAlterarSenha !== undefined && typeof estado.deveAlterarSenha !== 'boolean') throw new ErroUsuarioInvalido('deveAlterarSenha');
    this.deveAlterarSenha = estado.deveAlterarSenha ?? false;
    this.#situacao = estado.situacao;
    this.#criadoEm = estado.criadoEm.getTime();
    this.#atualizadoEm = estado.atualizadoEm.getTime();
  }

  static normalizarNome(nomeInformado: string): string {
    if (typeof nomeInformado !== 'string') {
      throw new ErroUsuarioInvalido('nome');
    }
    const nome = nomeInformado.trim();
    const tamanho = Array.from(nome).length;
    if (tamanho < 2 || tamanho > 120) {
      throw new ErroUsuarioInvalido('nome');
    }
    return nome;
  }

  static normalizarEmail(emailInformado: string): string {
    if (typeof emailInformado !== 'string') {
      throw new ErroUsuarioInvalido('email');
    }
    const email = emailInformado.trim().toLowerCase();
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
      !/^[a-z]{2,}$/.test(segmentosDominio[segmentosDominio.length - 1])
    ) {
      throw new ErroUsuarioInvalido('email');
    }
    return email;
  }

  static criar(entrada: { nome: string; email: string; hashSenha: string; id?: string; deveAlterarSenha?: boolean }): Usuario {
    const agora = new Date();
    return new Usuario({
      id: entrada.id === undefined ? randomUUID() : entrada.id,
      nome: entrada.nome,
      email: entrada.email,
      hashSenha: entrada.hashSenha,
      deveAlterarSenha: entrada.deveAlterarSenha,
      situacao: 'ATIVO',
      criadoEm: agora,
      atualizadoEm: agora,
    });
  }

  static restaurar(estado: EstadoUsuario): Usuario {
    return new Usuario(estado);
  }

  get id(): string { return this.#id; }
  get nome(): string { return this.#nome; }
  get email(): string { return this.#email; }
  get hashSenha(): string { return this.#hashSenha; }
  get situacao(): SituacaoUsuario { return this.#situacao; }
  get criadoEm(): Date { return new Date(this.#criadoEm); }
  get atualizadoEm(): Date { return new Date(this.#atualizadoEm); }
}

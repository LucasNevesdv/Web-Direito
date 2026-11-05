import { randomUUID } from 'node:crypto';
import { ErroProcessoInvalido } from './invalid-process-error.js';

export interface PropriedadesMovimentacaoProcesso {
  id: string;
  idEscritorio: string;
  idCaso: string;
  idProcesso: string;
  idAutor: string;
  ocorridaEm: Date;
  descricao: string;
  criadoEm: Date;
}

export interface DadosCriarMovimentacaoProcesso {
  id?: string;
  idEscritorio: string;
  idCaso: string;
  idProcesso: string;
  idAutor: string;
  ocorridaEm: Date;
  descricao: string;
  criadoEm?: Date;
}

export class MovimentacaoProcesso {
  readonly id: string;
  readonly idEscritorio: string;
  readonly idCaso: string;
  readonly idProcesso: string;
  readonly idAutor: string;
  readonly ocorridaEm: Date;
  readonly descricao: string;
  readonly criadoEm: Date;

  constructor(props: PropriedadesMovimentacaoProcesso) {
    if (!props.id || typeof props.id !== 'string') {
      throw new ErroProcessoInvalido('id', 'O identificador da movimentação é obrigatório.');
    }
    if (!props.idEscritorio || typeof props.idEscritorio !== 'string') {
      throw new ErroProcessoInvalido('idEscritorio', 'O escritório da movimentação é obrigatório.');
    }
    if (!props.idCaso || typeof props.idCaso !== 'string') {
      throw new ErroProcessoInvalido('idCaso', 'O caso vinculado é obrigatório.');
    }
    if (!props.idProcesso || typeof props.idProcesso !== 'string') {
      throw new ErroProcessoInvalido('idProcesso', 'O processo vinculado é obrigatório.');
    }
    if (!props.idAutor || typeof props.idAutor !== 'string') {
      throw new ErroProcessoInvalido('idAutor', 'O autor da movimentação é obrigatório.');
    }

    if (!(props.ocorridaEm instanceof Date) || isNaN(props.ocorridaEm.getTime())) {
      throw new ErroProcessoInvalido('ocorridaEm', 'A data/hora da ocorrência é inválida.');
    }

    const descNormalizada = props.descricao?.trim();
    if (!descNormalizada || descNormalizada.length < 3 || descNormalizada.length > 2000) {
      throw new ErroProcessoInvalido(
        'descricao',
        'A descrição da movimentação deve ter entre 3 e 2.000 caracteres.',
      );
    }

    if (!(props.criadoEm instanceof Date) || isNaN(props.criadoEm.getTime())) {
      throw new ErroProcessoInvalido('criadoEm', 'A data de registro é inválida.');
    }

    this.id = props.id;
    this.idEscritorio = props.idEscritorio;
    this.idCaso = props.idCaso;
    this.idProcesso = props.idProcesso;
    this.idAutor = props.idAutor;
    this.ocorridaEm = props.ocorridaEm;
    this.descricao = descNormalizada;
    this.criadoEm = props.criadoEm;
  }

  static criar(dados: DadosCriarMovimentacaoProcesso): MovimentacaoProcesso {
    const agora = new Date();
    return new MovimentacaoProcesso({
      id: dados.id ?? randomUUID(),
      idEscritorio: dados.idEscritorio,
      idCaso: dados.idCaso,
      idProcesso: dados.idProcesso,
      idAutor: dados.idAutor,
      ocorridaEm: dados.ocorridaEm,
      descricao: dados.descricao,
      criadoEm: dados.criadoEm ?? agora,
    });
  }

  static restaurar(props: PropriedadesMovimentacaoProcesso): MovimentacaoProcesso {
    return new MovimentacaoProcesso(props);
  }
}

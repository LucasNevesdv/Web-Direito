import { VinculoEscritorio } from '../../domain/memberships/membership.js';
import { ErroEscritorioInvalido } from '../../domain/offices/invalid-office-error.js';
import { Escritorio, type SituacaoEscritorio } from '../../domain/offices/office.js';
import { ErroUsuarioInvalido } from '../../domain/users/invalid-user-error.js';
import { Usuario } from '../../domain/users/user.js';
import type { ProtecaoDeSenhas } from '../security/password-hasher.js';
import { ErroEmailJaCadastrado } from './email-already-registered-error.js';
import { ErroCadastroInvalido } from './invalid-registration-error.js';
import type { RepositorioCadastroEscritorio } from './office-registration-repository.js';

export interface EntradaCadastroEscritorio {
  nomeEscritorio: string;
  nomeAdministrador: string;
  email: string;
  senha: string;
}

export interface ResultadoCadastroEscritorio {
  escritorio: {
    id: string;
    nome: string;
    situacao: SituacaoEscritorio;
    criadoEm: Date;
    atualizadoEm: Date;
  };
  usuario: { id: string; nome: string; email: string };
  papel: 'PROPRIETARIO';
}

export class CadastroDeEscritorioComProprietario {
  constructor(
    private readonly repositorioCadastro: RepositorioCadastroEscritorio,
    private readonly protecaoDeSenhas: ProtecaoDeSenhas,
  ) {}

  async cadastrarEscritorioComProprietario(dadosDoCadastro: EntradaCadastroEscritorio): Promise<ResultadoCadastroEscritorio> {
    let escritorio: Escritorio;
    let nomeAdministrador: string;
    let email: string;
    try {
      escritorio = Escritorio.criar({ nome: dadosDoCadastro.nomeEscritorio });
      nomeAdministrador = Usuario.normalizarNome(dadosDoCadastro.nomeAdministrador);
      email = Usuario.normalizarEmail(dadosDoCadastro.email);
    } catch (erro) {
      if (erro instanceof ErroEscritorioInvalido && erro.campo === 'nome') {
        throw new ErroCadastroInvalido('nomeEscritorio');
      }
      if (erro instanceof ErroUsuarioInvalido && erro.campo === 'nome') {
        throw new ErroCadastroInvalido('nomeAdministrador');
      }
      if (erro instanceof ErroUsuarioInvalido && erro.campo === 'email') {
        throw new ErroCadastroInvalido('email');
      }
      throw erro;
    }

    if (typeof dadosDoCadastro.senha !== 'string') {
      throw new ErroCadastroInvalido('senha');
    }
    const tamanhoSenha = Array.from(dadosDoCadastro.senha).length;
    if (tamanhoSenha < 12 || tamanhoSenha > 128) {
      throw new ErroCadastroInvalido('senha');
    }
    if (await this.repositorioCadastro.possuiUsuarioComEmail(email)) {
      throw new ErroEmailJaCadastrado();
    }

    // Hash before opening the transaction so its connection is not held during Argon2 work.
    const hashSenha = await this.protecaoDeSenhas.gerarHashDaSenha(dadosDoCadastro.senha);
    const usuario = Usuario.criar({ nome: nomeAdministrador, email, hashSenha });
    const vinculo = VinculoEscritorio.criar({ idEscritorio: escritorio.id, idUsuario: usuario.id });
    await this.repositorioCadastro.salvarCadastroCompleto({ escritorio, usuario, vinculo });

    return {
      escritorio: {
        id: escritorio.id,
        nome: escritorio.nome,
        situacao: escritorio.situacao,
        criadoEm: escritorio.criadoEm,
        atualizadoEm: escritorio.atualizadoEm,
      },
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
      papel: vinculo.papel,
    };
  }
}

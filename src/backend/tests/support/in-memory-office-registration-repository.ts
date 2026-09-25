import { ErroEmailJaCadastrado } from '../../src/application/onboarding/email-already-registered-error.js';
import type {
  EntidadesDoCadastroDeEscritorio,
  RepositorioCadastroEscritorio,
} from '../../src/application/onboarding/office-registration-repository.js';

export class RepositorioCadastroEscritorioEmMemoria implements RepositorioCadastroEscritorio {
  readonly cadastros: EntidadesDoCadastroDeEscritorio[] = [];

  async possuiUsuarioComEmail(email: string): Promise<boolean> {
    return this.cadastros.some(({ usuario }) => usuario.email === email);
  }

  async salvarCadastroCompleto(cadastro: EntidadesDoCadastroDeEscritorio): Promise<void> {
    // Keep the uniqueness check and write synchronous to model an atomic commit in the fake.
    if (this.cadastros.some(({ usuario }) => usuario.email === cadastro.usuario.email)) {
      throw new ErroEmailJaCadastrado();
    }
    this.cadastros.push(cadastro);
  }
}

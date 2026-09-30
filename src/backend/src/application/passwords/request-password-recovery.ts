import { Usuario } from '../../domain/users/user.js';
import type { RepositorioTrabalhosRecuperacao } from './recovery-email-jobs.js';

export class SolicitacaoRecuperacaoDeSenha {
  constructor(private readonly trabalhos: Pick<RepositorioTrabalhosRecuperacao, 'registrarSolicitacao'>) {}
  async solicitarRecuperacao(emailInformado: string): Promise<void> {
    let email: string;
    try { email = Usuario.normalizarEmail(emailInformado); } catch { return; }
    // A confirmação só pode sair depois do commit; falha de persistência propaga 503.
    await this.trabalhos.registrarSolicitacao(email);
  }
}

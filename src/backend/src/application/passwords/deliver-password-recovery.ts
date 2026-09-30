import type { EnvioEmail, TokensRecuperacao } from './password-contracts.js';
import { ErroEnvioEmail, type RepositorioTrabalhosRecuperacao, type ReservaEnvioRecuperacao } from './recovery-email-jobs.js';

export class EnvioRecuperacaoDeSenha {
  constructor(private readonly trabalhos: RepositorioTrabalhosRecuperacao, private readonly tokens: TokensRecuperacao,
    private readonly envioEmail: EnvioEmail, private readonly urlFrontend: string,
    private readonly politica: { maximoTentativas: number; atrasoInicialSegundos: number; atrasoMaximoSegundos: number },
    private readonly registrarEvento: (evento: 'enviado' | 'nova_tentativa' | 'falha_definitiva' | 'reserva_perdida') => void) {}

  async enviarRecuperacao(reserva: ReservaEnvioRecuperacao, sinal: AbortSignal): Promise<void> {
    if (reserva.tentativas > this.politica.maximoTentativas) {
      await this.trabalhos.registrarFalha(reserva, 'LIMITE_TENTATIVAS', true, 0); this.registrarEvento('falha_definitiva'); return;
    }
    const { token, hash } = this.tokens.gerarToken();
    const destinatario = await this.trabalhos.prepararTentativa(reserva, hash);
    if (!destinatario) { this.registrarEvento('reserva_perdida'); return; }
    const link = `${this.urlFrontend}/redefinir-senha#token=${encodeURIComponent(token)}`;
    const linkHtml = link.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    try {
      sinal.throwIfAborted();
      await this.envioEmail.enviarEmail({ destinatario: destinatario.email, assunto: 'Web Direito — redefinição de senha',
        texto: `Web Direito\nFoi solicitada uma redefinição de senha.\nRedefina sua senha: ${link}\nEste link é de uso único e vale por 30 minutos.\nSe não solicitou, ignore este e-mail. Nossa equipe nunca pedirá sua senha.`,
        html: `<html lang="pt-BR"><body><h1>Web Direito</h1><p>Foi solicitada uma redefinição de senha.</p><p><a href="${linkHtml}">Redefinir minha senha</a></p><p>Este link é de uso único e vale por 30 minutos.</p><p>Se não solicitou, ignore este e-mail. Nossa equipe nunca pedirá sua senha.</p></body></html>` }, sinal);
    } catch (erro) {
      const esgotou = reserva.tentativas >= this.politica.maximoTentativas;
      const definitiva = esgotou || (erro instanceof ErroEnvioEmail && erro.definitiva);
      const atraso = Math.min(this.politica.atrasoMaximoSegundos, this.politica.atrasoInicialSegundos * 2 ** Math.min(reserva.tentativas - 1, 20));
      const atualizou = await this.trabalhos.registrarFalha(reserva, esgotou ? 'LIMITE_TENTATIVAS' : definitiva ? 'PROVEDOR_DEFINITIVO' : 'PROVEDOR_TRANSITORIO', definitiva, atraso);
      this.registrarEvento(atualizou ? definitiva ? 'falha_definitiva' : 'nova_tentativa' : 'reserva_perdida'); return;
    }
    this.registrarEvento(await this.trabalhos.concluirEnvio(reserva) ? 'enviado' : 'reserva_perdida');
  }
}

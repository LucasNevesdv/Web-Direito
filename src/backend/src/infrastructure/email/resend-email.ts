import { Resend } from 'resend';
import { ErroEnvioEmail } from '../../application/passwords/recovery-email-jobs.js';
import type { EnvioEmail, MensagemEmail } from '../../application/passwords/password-contracts.js';

// O SDK 6.31 registra o corpo de erros fora de produção. Sua fronteira HTTP
// pública é especializada para aplicar cancelamento e impedir esses logs.
class ResendComTransporteSeguro extends Resend {
  constructor(chave: string, private readonly sinal?: AbortSignal) { super(chave, { baseUrl: 'https://api.resend.com' }); }
  override async fetchRequest<T>(caminho: string, opcoes: RequestInit = {}): ReturnType<typeof Resend.prototype.fetchRequest<T>> {
    try {
      const resposta = await fetch(`${this.baseUrl}${caminho}`, { ...opcoes,
        signal: AbortSignal.any([AbortSignal.timeout(10000), ...(this.sinal ? [this.sinal] : [])]), redirect: 'error' });
      if (!resposta.ok) {
        await resposta.body?.cancel();
        return { data: null, error: { name: 'application_error', message: 'Falha no envio de e-mail.', statusCode: resposta.status }, headers: null };
      }
      return { data: await resposta.json() as T, error: null, headers: null };
    } catch { return { data: null, error: { name: 'application_error', message: 'Falha no envio de e-mail.', statusCode: null }, headers: null }; }
  }
}

export class EnvioEmailResend implements EnvioEmail {
  constructor(private readonly chave: string, private readonly remetente: string) {}
  async enviarEmail(mensagem: MensagemEmail, sinal?: AbortSignal): Promise<void> {
    try {
      const cliente = new ResendComTransporteSeguro(this.chave, sinal);
      const resultado = await cliente.emails.send({ from: this.remetente, to: [mensagem.destinatario], subject: mensagem.assunto, text: mensagem.texto, html: mensagem.html });
      if (resultado.error || !resultado.data?.id) {
        const codigo = resultado.error?.statusCode ?? 0;
        throw new ErroEnvioEmail(codigo >= 400 && codigo < 500 && ![408, 409, 429].includes(codigo));
      }
    } catch (erro) { throw erro instanceof ErroEnvioEmail ? erro : new ErroEnvioEmail(); }
  }
}

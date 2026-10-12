import type { EnvioEmail } from '../../application/passwords/password-contracts.js';
import type { Ambiente } from '../../environment.js';
import { EnvioEmailResend } from './resend-email.js';
import { EnvioEmailSmtp } from './smtp-email.js';

export function criarEnvioEmail(ambiente: Ambiente): EnvioEmail {
  return ambiente.PROVEDOR_EMAIL === 'resend'
    ? new EnvioEmailResend(ambiente.RESEND_API_KEY!, ambiente.EMAIL_REMETENTE)
    : new EnvioEmailSmtp(ambiente.EMAIL_REMETENTE, { host: ambiente.SMTP_HOST, port: ambiente.SMTP_PORT, secure: ambiente.SMTP_SEGURO,
      ...(ambiente.SMTP_USUARIO ? { auth: { user: ambiente.SMTP_USUARIO, pass: ambiente.SMTP_SENHA! } } : {}) });
}

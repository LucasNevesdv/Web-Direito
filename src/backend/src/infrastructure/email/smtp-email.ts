import nodemailer from 'nodemailer';
import { createConnection, type Socket } from 'node:net';
import type { EnvioEmail, MensagemEmail } from '../../application/passwords/password-contracts.js';
import { ErroEnvioEmail } from '../../application/passwords/recovery-email-jobs.js';

export class EnvioEmailSmtp implements EnvioEmail {
  constructor(private readonly remetente: string, private readonly configuracao: { host: string; port: number; secure: boolean; auth?: { user: string; pass: string } }) {}
  async enviarEmail(mensagem: MensagemEmail, sinalExterno?: AbortSignal): Promise<void> {
    const sinal = AbortSignal.any([AbortSignal.timeout(10000), ...(sinalExterno ? [sinalExterno] : [])]);
    let socket: Socket | undefined;
    const transporte = nodemailer.createTransport({ ...this.configuracao,
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000, dnsTimeout: 5000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
      getSocket: (_opcoes: unknown, concluir: (erro: Error | null, opcoes?: { connection: Socket }) => void) => {
        if (sinal.aborted) { concluir(new ErroEnvioEmail()); return; }
        // API pública de socket customizado: cancelar destrói também a conexão em andamento.
        socket = createConnection({ host: this.configuracao.host, port: this.configuracao.port, signal: sinal });
        socket.once('error', (erro) => concluir(erro));
        socket.once('connect', () => { socket!.removeAllListeners('error'); concluir(null, { connection: socket! }); });
      },
    });
    try {
      sinal.throwIfAborted();
      const resultado = await transporte.sendMail({ from: this.remetente, to: mensagem.destinatario, subject: mensagem.assunto, text: mensagem.texto, html: mensagem.html });
      if (!resultado.accepted.length || resultado.rejected.length) throw new ErroEnvioEmail(true);
    } catch (erro) {
      const codigo = erro && typeof erro === 'object' && 'responseCode' in erro ? Number(erro.responseCode) : 0;
      throw new ErroEnvioEmail(erro instanceof ErroEnvioEmail ? erro.definitiva : codigo >= 500 && codigo < 600);
    } finally { socket?.destroy(); transporte.close(); }
  }
}

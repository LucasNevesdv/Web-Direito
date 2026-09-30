import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnvioEmailResend } from '../../src/infrastructure/email/resend-email.js';
import { EnvioEmailSmtp } from '../../src/infrastructure/email/smtp-email.js';
import { validarAmbiente } from '../../src/environment.js';
import { ProcessamentoRecuperacaoDeSenha } from '../../src/infrastructure/security/password-recovery-worker.js';
import { criarCenarioSenhas } from '../support/password-fixture.js';
const MENSAGEM = { destinatario: 'pessoa@example.test', assunto: 'Web Direito', texto: 'Texto de teste', html: '<p>Texto de teste</p>' };
const AMBIENTE = { DATABASE_URL: 'postgresql://localhost/teste', AUTH_JWT_SECRET: Buffer.alloc(48, 3).toString('base64url') };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('e-mail e processamento de recuperação', () => {
  it('usa SDK oficial Resend e verifica contrato HTTP, prazo e destinatário', async () => {
    const transporte = vi.fn(async () => new Response(JSON.stringify({ id: 'email-id' }), { status: 200 }));
    vi.stubGlobal('fetch', transporte);
    await new EnvioEmailResend('re_chave_de_teste', 'Web Direito <contato@example.test>').enviarEmail(MENSAGEM);
    const [url, opcoes] = transporte.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails'); expect(opcoes.method).toBe('POST'); expect(opcoes.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(opcoes.headers).get('authorization')).toBe('Bearer re_chave_de_teste');
    expect(new Headers(opcoes.headers).get('idempotency-key')).toBeNull();
    expect(JSON.parse(opcoes.body as string)).toMatchObject({ to: [MENSAGEM.destinatario], html: MENSAGEM.html, text: MENSAGEM.texto });
  });
  it.each([400, 429, 500])('sanitiza falha Resend %s sem log do corpo', async (situacao) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('segredo no erro do fornecedor', { status: situacao })));
    const log = vi.spyOn(console, 'error');
    await expect(new EnvioEmailResend('re_teste', 'contato@example.test').enviarEmail(MENSAGEM)).rejects.toThrow('Falha no envio de e-mail.');
    expect(log).not.toHaveBeenCalled();
  });
  it('sanitiza falha de conexão SMTP local', async () => {
    await expect(new EnvioEmailSmtp('contato@example.test', { host: '127.0.0.1', port: 1, secure: false }).enviarEmail(MENSAGEM)).rejects.toThrow('Falha no envio de e-mail.');
  });
  it('valida SMTP local sem autenticação e autenticação pareada', () => {
    expect(validarAmbiente(AMBIENTE)).toMatchObject({ PROVEDOR_EMAIL: 'smtp', SMTP_PORT: 1025, SMTP_SEGURO: false });
    expect(validarAmbiente({ ...AMBIENTE, SMTP_USUARIO: 'teste', SMTP_SENHA: 'segredo' }).SMTP_USUARIO).toBe('teste');
    expect(() => validarAmbiente({ ...AMBIENTE, SMTP_USUARIO: 'teste' })).toThrow('SMTP_USUARIO/SMTP_SENHA');
    expect(() => validarAmbiente({ ...AMBIENTE, SMTP_SEGURO: 'qualquer' })).toThrow('SMTP_SEGURO');
  });
  it('falha rapidamente no Resend sem chave e produção sem frontend HTTPS/remetente', () => {
    expect(() => validarAmbiente({ ...AMBIENTE, PROVEDOR_EMAIL: 'resend' })).toThrow('RESEND_API_KEY');
    expect(() => validarAmbiente({ ...AMBIENTE, NODE_ENV: 'production', AUTH_FRONTEND_ORIGIN: 'https://app.example.test' })).toThrow('URL_FRONTEND');
    const producao = { ...AMBIENTE, NODE_ENV: 'production', AUTH_FRONTEND_ORIGIN: 'https://app.example.test', URL_FRONTEND: 'https://app.example.test', EMAIL_REMETENTE: 'Web Direito <contato@example.test>', PROVEDOR_EMAIL: 'resend' };
    expect(() => validarAmbiente(producao)).toThrow('RESEND_API_KEY');
    expect(validarAmbiente({ ...producao, RESEND_API_KEY: 're_teste' }).PROVEDOR_EMAIL).toBe('resend');
  });
  it('aguarda processamento pendente no encerramento e sanitiza rejeições', async () => {
    const c = criarCenarioSenhas(), evento = vi.fn();
    await c.solicitacao.solicitarRecuperacao(c.usuario.email);
    let concluir!: () => void;
    const envio = { enviarRecuperacao: vi.fn(async () => { await new Promise<void>((resolver) => { concluir = resolver; }); throw new Error('segredo'); }) };
    const processamento = new ProcessamentoRecuperacaoDeSenha(c.repositorioTrabalhos, envio, c.repositorio,
      { intervaloMs: 1000, reservaSegundos: 60, prazoEncerramentoMs: 30000, retencaoDias: 7 }, evento);
    void processamento.processarDisponivel(); await vi.waitFor(() => expect(concluir).toBeTypeOf('function'));
    const encerramento = processamento.parar(); concluir(); await encerramento;
    expect(envio.enviarRecuperacao).toHaveBeenCalledOnce(); expect(evento).toHaveBeenCalledWith('falha_processamento');
    expect(evento).toHaveBeenCalledWith('encerrado'); expect(JSON.stringify(evento.mock.calls)).not.toContain('segredo');
  });
});

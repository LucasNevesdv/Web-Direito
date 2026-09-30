import { config } from 'dotenv';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

function possuiFormatoDeUrlPostgreSql(urlInformada: string): boolean {
  try {
    const url = new URL(urlInformada);
    const nomeDoBanco = decodeURIComponent(url.pathname.slice(1));
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname.length > 0 &&
      url.pathname.startsWith('/') &&
      !url.pathname.slice(1).includes('/') &&
      nomeDoBanco.trim().length > 0
    );
  } catch {
    return false;
  }
}

function possuiFormatoDeHostValido(hostInformado: string): boolean {
  if (isIP(hostInformado)) {
    return true;
  }

  const nomeHost = hostInformado.endsWith('.') ? hostInformado.slice(0, -1) : hostInformado;
  return (
    nomeHost.length > 0 &&
    nomeHost.length <= 253 &&
    !/^[\d.]+$/.test(nomeHost) &&
    nomeHost.split('.').every((rotulo) =>
      /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(rotulo),
    )
  );
}

const ESQUEMA_AMBIENTE = z.object({
  EMAIL_FILA_INTERVALO_MS: z.coerce.number().int().min(100).max(3600000).default(1000),
  EMAIL_FILA_LEASE_SEGUNDOS: z.coerce.number().int().min(30).max(300).default(60),
  EMAIL_FILA_MAX_TENTATIVAS: z.coerce.number().int().min(1).max(20).default(5),
  EMAIL_FILA_ATRASO_INICIAL_SEGUNDOS: z.coerce.number().int().min(1).max(3600).default(30),
  EMAIL_FILA_ATRASO_MAXIMO_SEGUNDOS: z.coerce.number().int().min(1).max(86400).default(3600),
  EMAIL_FILA_RETENCAO_DIAS: z.coerce.number().int().min(1).max(90).default(7),
  EMAIL_FILA_ENCERRAMENTO_MS: z.coerce.number().int().min(1000).max(60000).default(30000),
  PROVEDOR_EMAIL: z.enum(['smtp', 'resend']).default('smtp'),
  URL_FRONTEND: z.string().url().refine((valor) => {
    try { const url = new URL(valor); return ['http:', 'https:'].includes(url.protocol) && url.origin === valor && !url.username && !url.password; } catch { return false; }
  }).default('http://localhost:5173'),
  EMAIL_REMETENTE: z.string().max(254).regex(/^(?:[^<>\r\n]+ <)?[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>?$/).default('Web Direito <nao-responda@webdireito.local>'),
  SMTP_HOST: z.string().refine(possuiFormatoDeHostValido).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SEGURO: z.enum(['true', 'false']).default('false').transform((valor) => valor === 'true'),
  SMTP_USUARIO: z.string().min(1).optional(),
  SMTP_SENHA: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().optional(),
  RECUPERACAO_LIMITE_IP: z.coerce.number().int().min(1).max(10000).default(5),
  RECUPERACAO_JANELA_IP_SEGUNDOS: z.coerce.number().int().min(1).max(86400).default(900),
  RECUPERACAO_LIMITE_EMAIL: z.coerce.number().int().min(1).max(10000).default(3),
  RECUPERACAO_JANELA_EMAIL_SEGUNDOS: z.coerce.number().int().min(1).max(86400).default(3600),
  REDEFINICAO_LIMITE: z.coerce.number().int().min(1).max(10000).default(5),
  REDEFINICAO_JANELA_SEGUNDOS: z.coerce.number().int().min(1).max(86400).default(900),
  ALTERACAO_SENHA_LIMITE: z.coerce.number().int().min(1).max(10000).default(5),
  ALTERACAO_SENHA_JANELA_SEGUNDOS: z.coerce.number().int().min(1).max(86400).default(900),
  RATE_LIMIT_HMAC_SECRET: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/)
    .refine((valor) => Buffer.from(valor, 'base64url').length >= 32).optional(),
  RATE_LIMIT_ONBOARDING_MAX: z.coerce.number().int().min(1).max(10000).default(10),
  RATE_LIMIT_ONBOARDING_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(900),
  RATE_LIMIT_LOGIN_IP_MAX: z.coerce.number().int().min(1).max(10000).default(30),
  RATE_LIMIT_LOGIN_IDENTITY_MAX: z.coerce.number().int().min(1).max(10000).default(5),
  RATE_LIMIT_LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(900),
  RATE_LIMIT_REFRESH_MAX: z.coerce.number().int().min(1).max(10000).default(30),
  RATE_LIMIT_REFRESH_WINDOW_SECONDS: z.coerce.number().int().min(1).max(86400).default(60),
  RATE_LIMIT_CLEANUP_INTERVAL_MS: z.coerce.number().int().min(1000).max(3600000).default(60000),
  TRUST_PROXY: z.string().default('').refine((valor) => valor === '' || valor.split(',').every((entrada) => {
    const [endereco, bits, extra] = entrada.trim().split('/');
    const versao = isIP(endereco);
    return versao !== 0 && !extra && (bits === undefined || (/^\d{1,3}$/.test(bits) && Number(bits) > 0 && Number(bits) <= (versao === 4 ? 32 : 128)));
  })).transform((valor) => valor ? valor.split(',').map((entrada) => entrada.trim()) : false as const),
  AUTH_FRONTEND_ORIGIN: z.string().url().refine((valor) => {
    try {
      const url = new URL(valor);
      return ['http:', 'https:'].includes(url.protocol) && url.origin === valor && !url.username && !url.password;
    } catch { return false; }
  }).default('http://localhost:5173'),
  DATABASE_URL: z.string().trim().refine(possuiFormatoDeUrlPostgreSql),
  HOST: z.string().refine(possuiFormatoDeHostValido).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  AUTH_JWT_SECRET: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/)
    .refine((valor) => Buffer.from(valor, 'base64url').length >= 32),
  AUTH_JWT_ISSUER: z.string().trim().min(1).max(200).default('neodireito'),
  AUTH_JWT_AUDIENCE: z.string().trim().min(1).max(200).default('neodireito-web'),
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(900),
  AUTH_REFRESH_TTL_SECONDS: z.coerce.number().int().min(3600).max(604800).default(604800),
}).superRefine((valor, contexto) => {
  const invalidar = (nome: string) => contexto.addIssue({ code: z.ZodIssueCode.custom, path: [nome], message: 'Invalid configuration' });
  if (valor.EMAIL_FILA_ATRASO_MAXIMO_SEGUNDOS < valor.EMAIL_FILA_ATRASO_INICIAL_SEGUNDOS) invalidar('EMAIL_FILA_ATRASO_MAXIMO_SEGUNDOS');
  if (valor.PROVEDOR_EMAIL === 'resend' && !valor.RESEND_API_KEY?.trim()) invalidar('RESEND_API_KEY');
  if (!!valor.SMTP_USUARIO !== !!valor.SMTP_SENHA) invalidar('SMTP_USUARIO/SMTP_SENHA');
  if (valor.NODE_ENV === 'production') {
    if (!valor.URL_FRONTEND.startsWith('https://')) invalidar('URL_FRONTEND');
    if (valor.EMAIL_REMETENTE.includes('@webdireito.local')) invalidar('EMAIL_REMETENTE');
  }
  if (valor.NODE_ENV === 'production' && !valor.AUTH_FRONTEND_ORIGIN.startsWith('https://')) {
    contexto.addIssue({ code: z.ZodIssueCode.custom, path: ['AUTH_FRONTEND_ORIGIN'], message: 'HTTPS required' });
  }
});

export type Ambiente = z.infer<typeof ESQUEMA_AMBIENTE>;

export class ErroAmbiente extends Error {
  constructor(variaveis: string[]) {
    super(`Invalid environment configuration: ${variaveis.join(', ')}`);
    this.name = 'ErroAmbiente';
  }
}

export function validarAmbiente(
  variaveisInformadas: Record<string, unknown>,
): Ambiente {
  const validacaoDoAmbiente = ESQUEMA_AMBIENTE.safeParse({ RATE_LIMIT_LOGIN_IP_MAX: variaveisInformadas.NODE_ENV === 'production' ? 10 : 30, ...variaveisInformadas });

  if (!validacaoDoAmbiente.success) {
    const variaveis = [
      ...new Set(
        validacaoDoAmbiente.error.issues
          .map((problema) => problema.path[0])
          .filter((variavel): variavel is string => typeof variavel === 'string'),
      ),
    ];
    throw new ErroAmbiente(variaveis);
  }

  return validacaoDoAmbiente.data;
}

export function carregarAmbiente(
  ambiente: NodeJS.ProcessEnv = process.env,
  caminhoAmbiente = fileURLToPath(new URL('../.env', import.meta.url)),
): Ambiente {
  const ambienteProcesso: Record<string, string> = Object.fromEntries(
    Object.entries(ambiente).filter(
      (entrada): entrada is [string, string] => entrada[1] !== undefined,
    ),
  );
  config({
    path: caminhoAmbiente,
    processEnv: ambienteProcesso,
    override: false,
  });
  return validarAmbiente(ambienteProcesso);
}

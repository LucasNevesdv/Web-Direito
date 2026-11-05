import { criarAplicacao } from './app.js';
import { GestaoEquipe } from './application/team/manage-team.js';
import { RepositorioEquipePrisma } from './infrastructure/prisma/prisma-team-repository.js';
import { TokensAcessoJose } from './infrastructure/security/jose-access-tokens.js';
import { comporServicosDeSenhas } from './infrastructure/password-services.js';
import { comporServicosDeAutenticacao } from './authentication.js';
import { CadastroDeEscritorioComProprietario } from './application/onboarding/register-office-with-owner.js';
import { criarClientePrisma, criarVerificadorSaudePrisma } from './database.js';
import { ErroAmbiente, carregarAmbiente } from './environment.js';
import { RepositorioCadastroEscritorioPrisma } from './infrastructure/prisma/prisma-office-registration-repository.js';
import { ProtecaoDeSenhasArgon2 } from './infrastructure/security/argon2-password-hasher.js';
import { criarEncerramento } from './shutdown.js';
import { comporLimitacaoDeRequisicoes } from './rate-limiting.js';
import { comporServicosDeTrabalho } from './infrastructure/work-services.js';
import { GestaoAdministracao } from './application/administration/manage-administration.js';
import { RepositorioAdministracaoPrisma } from './infrastructure/prisma/prisma-administration-repository.js';

let prisma: ReturnType<typeof criarClientePrisma> | undefined;
let aplicacao: ReturnType<typeof criarAplicacao> | undefined;
let limpezaDeLimites: { parar(): Promise<void> } | undefined;
let processamentoSenhas: { parar(): Promise<void> } | undefined;
let processamentoLembretes: { parar(): Promise<void> } | undefined;

const encerrarRecursos = criarEncerramento(
  { close: async () => { await aplicacao?.close(); } },
  { $disconnect: async () => { await prisma?.$disconnect(); } },
  { parar: async () => { try { await Promise.all([processamentoSenhas?.parar(), processamentoLembretes?.parar()]); } finally { await limpezaDeLimites?.parar(); } } },
);

function tratarSinalDeEncerramento(): void {
  void encerrarRecursos().catch(() => {
    console.error('Backend shutdown failed.');
    process.exitCode = 1;
  });
}

process.on('SIGINT', tratarSinalDeEncerramento);
process.on('SIGTERM', tratarSinalDeEncerramento);

try {
  const ambiente = carregarAmbiente();
  prisma = criarClientePrisma(ambiente.DATABASE_URL);
  const protecaoDeSenhas = new ProtecaoDeSenhasArgon2();
  const cadastro = new CadastroDeEscritorioComProprietario(
    new RepositorioCadastroEscritorioPrisma(prisma),
    protecaoDeSenhas,
  );
  const autenticacao = await comporServicosDeAutenticacao(prisma, ambiente, protecaoDeSenhas);
  const limitacaoRequisicoes = comporLimitacaoDeRequisicoes(prisma, ambiente);
  const senhas = comporServicosDeSenhas(prisma, ambiente, protecaoDeSenhas, autenticacao);
  processamentoSenhas = senhas.processamento;
  const equipe = new GestaoEquipe(new RepositorioEquipePrisma(prisma), new TokensAcessoJose(ambiente.AUTH_JWT_SECRET, ambiente.AUTH_JWT_ISSUER, ambiente.AUTH_JWT_AUDIENCE, ambiente.AUTH_ACCESS_TTL_SECONDS), protecaoDeSenhas);
  const trabalho = comporServicosDeTrabalho(prisma, ambiente);
  processamentoLembretes = trabalho.processamento;
  const administracao = new GestaoAdministracao(new RepositorioAdministracaoPrisma(prisma), new TokensAcessoJose(ambiente.AUTH_JWT_SECRET, ambiente.AUTH_JWT_ISSUER, ambiente.AUTH_JWT_AUDIENCE, ambiente.AUTH_ACCESS_TTL_SECONDS));
  aplicacao = criarAplicacao(criarVerificadorSaudePrisma(prisma), cadastro, autenticacao, { limitador: limitacaoRequisicoes.limitador, proxiesConfiaveis: ambiente.TRUST_PROXY }, senhas.servicos, equipe, trabalho, administracao);
  await aplicacao.listen({
    host: ambiente.HOST,
    port: ambiente.PORT,
  });
  limpezaDeLimites = limitacaoRequisicoes.iniciarLimpeza();
  senhas.processamento.iniciarProcessamento(ambiente.RATE_LIMIT_CLEANUP_INTERVAL_MS);
  trabalho.processamento.iniciar();
} catch (erro) {
  process.exitCode = 1;
  console.error(
    erro instanceof ErroAmbiente
      ? erro.message
      : 'Backend startup failed.',
  );
  try {
    await encerrarRecursos();
  } catch {
    console.error('Backend cleanup failed.');
  }
}

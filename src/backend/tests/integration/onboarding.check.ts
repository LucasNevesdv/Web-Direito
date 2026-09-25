// Opt-in verification against the configured local PostgreSQL, outside Vitest.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { criarAplicacao } from '../../src/app.js';
import { CadastroDeEscritorioComProprietario } from '../../src/application/onboarding/register-office-with-owner.js';
import type { RepositorioCadastroEscritorio } from '../../src/application/onboarding/office-registration-repository.js';
import { criarClientePrisma, criarVerificadorSaudePrisma } from '../../src/database.js';
import { carregarAmbiente } from '../../src/environment.js';
import { RepositorioCadastroEscritorioPrisma } from '../../src/infrastructure/prisma/prisma-office-registration-repository.js';
import { ProtecaoDeSenhasArgon2 } from '../../src/infrastructure/security/argon2-password-hasher.js';
import { comporLimitacaoDeRequisicoes } from '../../src/rate-limiting.js';
import { ChavesLimiteRequisicoesHmac } from '../../src/infrastructure/security/hmac-rate-limit-keys.js';

const ID_EXECUCAO = randomUUID();
const CENARIOS = ['success', 'rollback', 'race-one', 'race-two'];
const NOMES_ESCRITORIOS = CENARIOS.map((cenario) => `RF001 verification ${ID_EXECUCAO} ${cenario}`);
const EMAILS = ['success', 'rollback', 'race'].map((cenario) => `rf001-${ID_EXECUCAO}-${cenario}@example.invalid`);
const SEGREDO = `${randomUUID()}${randomUUID()}`;
const SEGREDO_LIMITADOR = randomBytes(48).toString('base64url');
const HASH_LIMITADOR = new ChavesLimiteRequisicoesHmac(SEGREDO_LIMITADOR).gerarHashDaChave('onboarding-ip', '127.0.0.1');
const APLICACOES: FastifyInstance[] = [];
let prisma: ReturnType<typeof criarClientePrisma> | undefined;
let possuiRegistros = false;
let etapa = 'connect';

function relatarEtapaDaVerificacao(etapa: string, valores: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ etapa, ok: true, ...valores }));
}

function relatarFalha(etapa: string): void {
  // Never print arbitrary errors, request bodies, stored hashes or connection URLs.
  console.error(JSON.stringify({ etapa, ok: false }));
  process.exitCode = 1;
}

async function iniciarServidorDeVerificacao(aplicacao: FastifyInstance): Promise<string> {
  APLICACOES.push(aplicacao);
  return aplicacao.listen({ host: '127.0.0.1', port: 0 });
}

async function enviarCadastroDeTeste(enderecoBase: string, nomeEscritorio: string, email: string) {
  const resposta = await fetch(`${enderecoBase}/api/v1/onboarding`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nomeEscritorio, nomeAdministrador: '  Local Verification  ', email, senha: SEGREDO }),
  });
  const texto = await resposta.text();
  assert.equal(texto.includes(SEGREDO), false);
  assert.equal(texto.includes('passwordHash'), false);
  assert.equal(texto.includes('password_hash'), false);
  assert.equal(texto.includes('$argon2'), false);
  return { situacao: resposta.status, corpo: JSON.parse(texto) };
}

try {
  const ambiente = carregarAmbiente();
  prisma = criarClientePrisma(ambiente.DATABASE_URL);
  const seguranca = comporLimitacaoDeRequisicoes(prisma, { ...ambiente, RATE_LIMIT_HMAC_SECRET: SEGREDO_LIMITADOR });
  await prisma.$queryRaw`SELECT 1`;
  assert.equal(await prisma.office.count({ where: { name: { in: NOMES_ESCRITORIOS } } }), 0);
  assert.equal(await prisma.user.count({ where: { email: { in: EMAILS } } }), 0);
  possuiRegistros = true;
  const geradorHash = new ProtecaoDeSenhasArgon2();
  const repositorio = new RepositorioCadastroEscritorioPrisma(prisma);
  const verificador = criarVerificadorSaudePrisma(prisma);
  const enderecoBase = await iniciarServidorDeVerificacao(criarAplicacao(verificador, new CadastroDeEscritorioComProprietario(repositorio, geradorHash), undefined, seguranca));

  etapa = 'real_http_onboarding';
  assert.equal((await fetch(`${enderecoBase}/health`)).status, 200);
  assert.equal((await fetch(`${enderecoBase}/ready`)).status, 200);
  const sucesso = await enviarCadastroDeTeste(enderecoBase, `  ${NOMES_ESCRITORIOS[0]}  `, `  ${EMAILS[0].toUpperCase()}  `);
  assert.equal(sucesso.situacao, 201);
  assert.deepEqual(Object.keys(sucesso.corpo).sort(), ['escritorio', 'papel', 'usuario']);
  assert.deepEqual(Object.keys(sucesso.corpo.usuario).sort(), ['email', 'id', 'nome']);
  assert.equal(sucesso.corpo.papel, 'PROPRIETARIO');
  const escritorio = await prisma.office.findUniqueOrThrow({ where: { id: sucesso.corpo.escritorio.id } });
  const usuario = await prisma.user.findUniqueOrThrow({ where: { email: EMAILS[0] } });
  const vinculo = await prisma.membership.findUniqueOrThrow({
    where: { officeId_userId: { officeId: escritorio.id, userId: usuario.id } },
  });
  assert.equal(escritorio.name, NOMES_ESCRITORIOS[0]);
  assert.equal(escritorio.status, 'ACTIVE');
  assert.equal(escritorio.createdAt.toISOString(), sucesso.corpo.escritorio.criadoEm);
  assert.equal(escritorio.updatedAt.toISOString(), sucesso.corpo.escritorio.atualizadoEm);
  assert.equal(usuario.name, 'Local Verification');
  assert.equal(usuario.status, 'ACTIVE');
  assert.equal(usuario.id, sucesso.corpo.usuario.id);
  assert.equal(vinculo.role, 'OWNER');
  assert.equal(await geradorHash.compararSenhaComHash(usuario.passwordHash, SEGREDO), true);
  assert.equal(usuario.passwordHash.includes(SEGREDO), false);
  assert.equal((await enviarCadastroDeTeste(enderecoBase, NOMES_ESCRITORIOS[0], EMAILS[0])).situacao, 409);
  assert.equal((await enviarCadastroDeTeste(enderecoBase, 'x', EMAILS[0])).situacao, 400);
  relatarEtapaDaVerificacao(etapa, { criado: 201, duplicado: 409, invalido: 400, health: 200, ready: 200, hashVerificado: true });

  etapa = 'rollback_after_office_and_user';
  let escritorioGravado = false;
  let usuarioGravado = false;
  let vinculoTentado = false;
  // Extension faults only the verification client, after real transactional writes.
  const clienteComFalha = prisma.$extends({
    query: {
      office: { async create({ args: argumentos, query: consulta }) {
        const resultado = await consulta(argumentos);
        escritorioGravado = true;
        return resultado;
      } },
      user: { async create({ args: argumentos, query: consulta }) {
        const resultado = await consulta(argumentos);
        usuarioGravado = true;
        return resultado;
      } },
      membership: { async create() {
        vinculoTentado = true;
        throw new Error('Controlled membership failure for rollback verification');
      } },
    },
  });
  const enderecoComFalha = await iniciarServidorDeVerificacao(criarAplicacao(verificador, new CadastroDeEscritorioComProprietario(
    new RepositorioCadastroEscritorioPrisma(clienteComFalha), geradorHash,
  ), undefined, seguranca));
  const revertido = await enviarCadastroDeTeste(enderecoComFalha, NOMES_ESCRITORIOS[1], EMAILS[1]);
  assert.equal(revertido.situacao, 500);
  assert.equal(JSON.stringify(revertido.corpo).includes('Controlled membership'), false);
  assert.ok(escritorioGravado && usuarioGravado && vinculoTentado);
  assert.equal(await prisma.office.count({ where: { name: NOMES_ESCRITORIOS[1] } }), 0);
  assert.equal(await prisma.user.count({ where: { email: EMAILS[1] } }), 0);
  assert.equal(await prisma.membership.count({
    where: { OR: [{ office: { name: NOMES_ESCRITORIOS[1] } }, { user: { email: EMAILS[1] } }] },
  }), 0);
  relatarEtapaDaVerificacao(etapa, { escritorioGravado, usuarioGravado, vinculoTentado, restantes: 0 });

  etapa = 'concurrent_email_uniqueness';
  let chegadas = 0;
  let liberar!: () => void;
  const barreira = new Promise<void>((resolver) => { liberar = resolver; });
  const repositorioConcorrente: RepositorioCadastroEscritorio = {
    async possuiUsuarioComEmail(email) {
      const existe = await repositorio.possuiUsuarioComEmail(email);
      chegadas += 1;
      if (chegadas === 2) liberar();
      // Bound the verification rendezvous if one concurrent request fails early.
      let temporizador: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          barreira,
          new Promise<never>((_resolver, rejeitar) => {
            temporizador = setTimeout(() => rejeitar(new Error('Verification barrier timed out')), 10000);
          }),
        ]);
      } finally {
        clearTimeout(temporizador);
      }
      return existe;
    },
    salvarCadastroCompleto: (dados) => repositorio.salvarCadastroCompleto(dados),
  };
  const enderecoConcorrente = await iniciarServidorDeVerificacao(criarAplicacao(verificador, new CadastroDeEscritorioComProprietario(repositorioConcorrente, geradorHash), undefined, seguranca));
  const disputados = await Promise.all([
    enviarCadastroDeTeste(enderecoConcorrente, NOMES_ESCRITORIOS[2], EMAILS[2]),
    enviarCadastroDeTeste(enderecoConcorrente, NOMES_ESCRITORIOS[3], EMAILS[2]),
  ]);
  assert.deepEqual(disputados.map(({ situacao }) => situacao).sort(), [201, 409]);
  assert.equal(await prisma.user.count({ where: { email: EMAILS[2] } }), 1);
  assert.equal(await prisma.office.count({ where: { name: { in: NOMES_ESCRITORIOS.slice(2) } } }), 1);
  assert.equal(await prisma.membership.count({ where: { user: { email: EMAILS[2] } } }), 1);
  relatarEtapaDaVerificacao(etapa, { situacoes: [201, 409], escritorios: 1, usuarios: 1, vinculos: 1 });
} catch {
  relatarFalha(etapa);
} finally {
  for (const aplicacao of APLICACOES) {
    try { await aplicacao.close(); } catch { relatarFalha('close_verification_app'); }
  }
  if (prisma) {
    try {
      if (possuiRegistros) {
        await prisma.$transaction(async (transacao) => {
          await transacao.rateLimitBucket.deleteMany({ where: { keyHash: HASH_LIMITADOR } });
          await transacao.membership.deleteMany({
            where: { OR: [{ office: { name: { in: NOMES_ESCRITORIOS } } }, { user: { email: { in: EMAILS } } }] },
          });
          await transacao.user.deleteMany({ where: { email: { in: EMAILS } } });
          await transacao.office.deleteMany({ where: { name: { in: NOMES_ESCRITORIOS } } });
        });
        const restantes = await prisma.office.count({ where: { name: { in: NOMES_ESCRITORIOS } } })
          + await prisma.user.count({ where: { email: { in: EMAILS } } })
          + await prisma.membership.count({
            where: { OR: [{ office: { name: { in: NOMES_ESCRITORIOS } } }, { user: { email: { in: EMAILS } } }] },
          });
        assert.equal(restantes + await prisma.rateLimitBucket.count({ where: { keyHash: HASH_LIMITADOR } }), 0);
        relatarEtapaDaVerificacao('temporary_records_cleanup', { restantes });
      }
    } catch {
      relatarFalha('temporary_records_cleanup');
    } finally {
      try { await prisma.$disconnect(); relatarEtapaDaVerificacao('disconnect'); } catch { relatarFalha('disconnect'); }
    }
  }
}

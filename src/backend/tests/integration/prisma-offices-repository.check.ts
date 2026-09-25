// Explicit local verification; *.check.ts is excluded from Vitest's default suite.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { criarClientePrisma } from '../../src/database.js';
import { Escritorio } from '../../src/domain/offices/office.js';
import { carregarAmbiente } from '../../src/environment.js';
import { RepositorioEscritoriosPrisma } from '../../src/infrastructure/prisma/prisma-offices-repository.js';
import { MAPEADOR_ESCRITORIO } from '../../src/infrastructure/prisma/office-mapper.js';

function capturarEstado(escritorio: Escritorio) {
  return {
    id: escritorio.id,
    nome: escritorio.nome,
    situacao: escritorio.situacao,
    criadoEm: escritorio.criadoEm,
    atualizadoEm: escritorio.atualizadoEm,
  };
}

function relatarFalha(etapa: string, erro: unknown): void {
  const codigo = typeof erro === 'object' && erro !== null && 'code' in erro
    ? String(erro.code)
    : 'UNKNOWN';
  console.error(JSON.stringify({
    etapa,
    ok: false,
    code: /^(P\d{4}|ERR_ASSERTION|INVALID_OFFICE)$/.test(codigo) ? codigo : 'UNKNOWN',
  }));
  process.exitCode = 1;
}

const ID_TESTE = randomUUID();
const NOME_TESTE = `TASK-003 repository verification ${ID_TESTE}`;
let prisma: ReturnType<typeof criarClientePrisma> | undefined;
let precisaLimpeza = false;

try {
  const ambiente = carregarAmbiente();
  prisma = criarClientePrisma(ambiente.DATABASE_URL);
  const repositorio = new RepositorioEscritoriosPrisma(prisma);
  assert.equal(await repositorio.buscarEscritorioPorId(ID_TESTE), null);

  const escritorio = Escritorio.criar({ id: ID_TESTE, nome: `  ${NOME_TESTE}  ` });
  // Claim cleanup only after confirming the ID was not present before this run.
  precisaLimpeza = true;
  const salvo = await repositorio.salvarEscritorio(escritorio);
  assert.ok(salvo instanceof Escritorio);
  assert.deepEqual(capturarEstado(salvo), capturarEstado(escritorio));

  const encontrado = await repositorio.buscarEscritorioPorId(ID_TESTE);
  assert.ok(encontrado instanceof Escritorio);
  assert.deepEqual(capturarEstado(encontrado), capturarEstado(escritorio));
  const armazenado = await prisma.office.findUnique({ where: { id: ID_TESTE } });
  assert.deepEqual(armazenado, MAPEADOR_ESCRITORIO.converterEscritorioEmRegistroPrisma(escritorio));
  console.log(JSON.stringify({ etapa: 'office_repository_round_trip', ok: true }));
} catch (erro) {
  relatarFalha('office_repository_round_trip', erro);
} finally {
  if (prisma) {
    try {
      if (precisaLimpeza) {
        // This deliberately bypasses the application contract: deletion exists
        // only to remove this verification's own record, never as a product API.
        const removidos = await prisma.office.deleteMany({
          where: { id: ID_TESTE, name: NOME_TESTE },
        });
        const restantes = await prisma.office.count({
          where: { OR: [{ id: ID_TESTE }, { name: NOME_TESTE }] },
        });
        assert.equal(restantes, 0);
        console.log(JSON.stringify({
          etapa: 'verification_record_cleanup',
          ok: true,
          removidos: removidos.count,
          restantes,
        }));
      }
    } catch (erro) {
      relatarFalha('verification_record_cleanup', erro);
    } finally {
      try {
        await prisma.$disconnect();
        console.log(JSON.stringify({ etapa: 'prisma_disconnect', ok: true }));
      } catch (erro) {
        relatarFalha('prisma_disconnect', erro);
      }
    }
  }
}

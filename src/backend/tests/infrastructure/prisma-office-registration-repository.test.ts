import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ErroEmailJaCadastrado } from '../../src/application/onboarding/email-already-registered-error.js';
import { VinculoEscritorio } from '../../src/domain/memberships/membership.js';
import { Escritorio } from '../../src/domain/offices/office.js';
import { Usuario } from '../../src/domain/users/user.js';
import { RepositorioCadastroEscritorioPrisma } from '../../src/infrastructure/prisma/prisma-office-registration-repository.js';

function prepararCenario() {
  const gravacoes: string[] = [];
  const criarEscritorio = vi.fn(async () => { gravacoes.push('escritorio'); return {}; });
  const criarUsuario = vi.fn(async () => { gravacoes.push('usuario'); return {}; });
  const criarVinculo = vi.fn(async () => { gravacoes.push('vinculo'); return {}; });
  const transacao = {
    office: { create: criarEscritorio },
    user: { create: criarUsuario },
    membership: { create: criarVinculo },
  } as unknown as Prisma.TransactionClient;
  const executarTransacao = vi.fn(async (retorno: (cliente: Prisma.TransactionClient) => Promise<unknown>) => retorno(transacao));
  const buscarUnico = vi.fn<() => Promise<{ id: string } | null>>().mockResolvedValue(null);
  const cliente = {
    user: { findUnique: buscarUnico },
    $transaction: executarTransacao,
  } as unknown as ConstructorParameters<typeof RepositorioCadastroEscritorioPrisma>[0];
  const escritorio = Escritorio.criar({ nome: 'Escritório Exemplo' });
  const usuario = Usuario.criar({ nome: 'Ana Silva', email: 'ana@example.test', hashSenha: 'opaque-test-hash' });
  const vinculo = VinculoEscritorio.criar({ idEscritorio: escritorio.id, idUsuario: usuario.id });
  return {
    repositorio: new RepositorioCadastroEscritorioPrisma(cliente),
    cadastro: { escritorio, usuario, vinculo },
    findUnique: buscarUnico, executarTransacao, criarEscritorio, criarUsuario, criarVinculo, gravacoes,
  };
}

function criarErroPrismaConhecido(codigo: string, alvo?: unknown): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Database operation failed', {
    code: codigo,
    clientVersion: Prisma.prismaVersion.client,
    meta: alvo === undefined ? undefined : { target: alvo },
  });
}

describe("RepositorioCadastroEscritorioPrisma", () => {
  it.each([false, true])("verifica existência global do e-mail selecionando somente o identificador público", async (existe) => {
    const { repositorio, findUnique: buscarUnico } = prepararCenario();
    buscarUnico.mockResolvedValue(existe ? { id: 'user-id' } : null);
    await expect(repositorio.possuiUsuarioComEmail('ana@example.test')).resolves.toBe(existe);
    expect(buscarUnico).toHaveBeenCalledTimes(1);
    expect(buscarUnico).toHaveBeenCalledWith({ where: { email: 'ana@example.test' }, select: { id: true } });
  });

  it("grava escritório, hash de usuário e vínculo físico OWNER em uma transação limitada", async () => {
    const { repositorio, cadastro, executarTransacao, criarEscritorio, criarUsuario, criarVinculo, gravacoes } = prepararCenario();
    const { escritorio, usuario, vinculo } = cadastro;
    await expect(repositorio.salvarCadastroCompleto(cadastro)).resolves.toBeUndefined();
    expect(executarTransacao).toHaveBeenCalledTimes(1);
    expect(executarTransacao).toHaveBeenCalledWith(expect.any(Function), { maxWait: 5000, timeout: 10000 });
    expect(gravacoes).toEqual(['escritorio', 'usuario', 'vinculo']);
    expect(criarEscritorio).toHaveBeenCalledTimes(1);
    expect(criarEscritorio).toHaveBeenCalledWith({ data: {
      id: escritorio.id, name: escritorio.nome, status: 'ACTIVE',
      createdAt: escritorio.criadoEm, updatedAt: escritorio.atualizadoEm,
    } });
    expect(criarUsuario).toHaveBeenCalledTimes(1);
    expect(criarUsuario).toHaveBeenCalledWith({
      data: {
        id: usuario.id, name: usuario.nome, email: usuario.email,
        passwordHash: usuario.hashSenha, status: 'ACTIVE',
        createdAt: usuario.criadoEm, updatedAt: usuario.atualizadoEm,
      },
      select: { id: true },
    });
    expect(criarVinculo).toHaveBeenCalledTimes(1);
    expect(criarVinculo).toHaveBeenCalledWith({ data: {
      id: vinculo.id, officeId: escritorio.id, userId: usuario.id,
      role: 'OWNER', createdAt: vinculo.criadoEm,
      permissions: ['EQUIPE_VISUALIZAR', 'EQUIPE_CADASTRAR_USUARIO', 'EQUIPE_ALTERAR_USUARIO', 'EQUIPE_DEFINIR_PERMISSOES', 'EQUIPE_ATIVAR_INATIVAR_USUARIO'],
    } });
  });

  it("converte conflito de unicidade de e-mail no banco em erro previsível da aplicação", async () => {
    const { repositorio, cadastro, criarUsuario, criarVinculo } = prepararCenario();
    criarUsuario.mockRejectedValueOnce(criarErroPrismaConhecido('P2002', ['email']));
    await expect(repositorio.salvarCadastroCompleto(cadastro)).rejects.toThrowError(new ErroEmailJaCadastrado());
    expect(criarVinculo).not.toHaveBeenCalled();
  });

  it.each([
    criarErroPrismaConhecido('P2002', ['id']),
    criarErroPrismaConhecido('P2002', ['office_id', 'user_id']),
    criarErroPrismaConhecido('P2002', 'users_email_key'),
    criarErroPrismaConhecido('P2002'),
    criarErroPrismaConhecido('P2003', ['email']),
    { code: 'P2002', meta: { target: ['email'] } },
    new Error('Unclassified infrastructure failure'),
  ])("preserva falhas de persistência não relacionadas ou desconhecidas", async (erro) => {
    const { repositorio, cadastro, executarTransacao } = prepararCenario();
    executarTransacao.mockRejectedValueOnce(erro);
    await expect(repositorio.salvarCadastroCompleto(cadastro)).rejects.toBe(erro);
  });

  it.each(['escritorio', 'usuario', 'vinculo'] as const)("propaga falha durante a gravação de %s sem continuar", async (etapa) => {
    const { repositorio, cadastro, criarEscritorio, criarUsuario, criarVinculo, gravacoes } = prepararCenario();
    const erro = new Error('Write failed');
    const gravacaoComFalha = { escritorio: criarEscritorio, usuario: criarUsuario, vinculo: criarVinculo }[etapa];
    gravacaoComFalha.mockRejectedValueOnce(erro);
    await expect(repositorio.salvarCadastroCompleto(cadastro)).rejects.toBe(erro);
    expect(gravacoes).toEqual({ escritorio: [], usuario: ['escritorio'], vinculo: ['escritorio', 'usuario'] }[etapa]);
    if (etapa === 'escritorio') {
      expect(criarUsuario).not.toHaveBeenCalled();
    }
    if (etapa !== 'vinculo') {
      expect(criarVinculo).not.toHaveBeenCalled();
    }
  });

  it("propaga erros de consulta do e-mail", async () => {
    const { repositorio, findUnique: buscarUnico, executarTransacao } = prepararCenario();
    const erro = new Error('Database unavailable');
    buscarUnico.mockRejectedValueOnce(erro);
    await expect(repositorio.possuiUsuarioComEmail('ana@example.test')).rejects.toBe(erro);
    expect(executarTransacao).not.toHaveBeenCalled();
  });
});

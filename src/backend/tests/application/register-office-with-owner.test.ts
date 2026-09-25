import { describe, expect, it, vi } from 'vitest';
import { ErroEmailJaCadastrado } from '../../src/application/onboarding/email-already-registered-error.js';
import { ErroCadastroInvalido } from '../../src/application/onboarding/invalid-registration-error.js';
import { CadastroDeEscritorioComProprietario } from '../../src/application/onboarding/register-office-with-owner.js';
import type { ProtecaoDeSenhas } from '../../src/application/security/password-hasher.js';
import { RepositorioCadastroEscritorioEmMemoria } from '../support/in-memory-office-registration-repository.js';

const ENTRADA = {
  nomeEscritorio: 'Escritório Exemplo',
  nomeAdministrador: 'Ana Silva',
  email: 'ana@example.test',
  senha: 'temporary-unit-password',
};

function prepararCenario() {
  const repositorio = new RepositorioCadastroEscritorioEmMemoria();
  const hashOpaco = 'opaque-hasher-output';
  const geradorHash: ProtecaoDeSenhas = {
    gerarHashDaSenha: vi.fn(async () => hashOpaco),
    compararSenhaComHash: vi.fn(async (hash, senha) => hash === hashOpaco && senha === ENTRADA.senha),
  };
  return { repositorio, geradorHash, hashOpaco, useCase: new CadastroDeEscritorioComProprietario(repositorio, geradorHash) };
}

describe("CadastroDeEscritorioComProprietario", () => {
  it("persiste escritório, usuário ativo e vínculo PROPRIETARIO em um cadastro", async () => {
    const { repositorio, geradorHash, hashOpaco, useCase: casoDeUso } = prepararCenario();
    const resultado = await casoDeUso.cadastrarEscritorioComProprietario(ENTRADA);
    expect(repositorio.cadastros).toHaveLength(1);
    const { escritorio, usuario, vinculo } = repositorio.cadastros[0];
    expect(escritorio.nome).toBe(ENTRADA.nomeEscritorio);
    expect(escritorio.situacao).toBe('ATIVO');
    expect(usuario.nome).toBe(ENTRADA.nomeAdministrador);
    expect(usuario.email).toBe(ENTRADA.email);
    expect(usuario.situacao).toBe('ATIVO');
    expect(vinculo.idEscritorio).toBe(escritorio.id);
    expect(vinculo.idUsuario).toBe(usuario.id);
    expect(vinculo.papel).toBe('PROPRIETARIO');
    expect(geradorHash.gerarHashDaSenha).toHaveBeenCalledTimes(1);
    expect(geradorHash.gerarHashDaSenha).toHaveBeenCalledWith(ENTRADA.senha);
    expect(usuario.hashSenha).toBe(hashOpaco);
    expect(usuario.hashSenha).not.toBe(ENTRADA.senha);
    expect(resultado).toEqual({
      escritorio: { id: escritorio.id, nome: escritorio.nome, situacao: escritorio.situacao, criadoEm: escritorio.criadoEm, atualizadoEm: escritorio.atualizadoEm },
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
      papel: 'PROPRIETARIO',
    });
    expect(JSON.stringify(resultado)).not.toContain('senha');
    expect(JSON.stringify(resultado)).not.toContain(hashOpaco);
    expect(JSON.stringify(repositorio.cadastros)).not.toContain(ENTRADA.senha);
  });

  it("normaliza nomes e e-mail antes de verificar unicidade e persistir", async () => {
    const { repositorio, useCase: casoDeUso } = prepararCenario();
    const emailExiste = vi.spyOn(repositorio, "possuiUsuarioComEmail");
    const resultado = await casoDeUso.cadastrarEscritorioComProprietario({
      ...ENTRADA, nomeEscritorio: '  Escritório  Exemplo\n', nomeAdministrador: '\tAna Silva ', email: '  ANA@EXAMPLE.TEST ',
    });
    expect(resultado.escritorio.nome).toBe('Escritório  Exemplo');
    expect(resultado.usuario).toMatchObject({ nome: 'Ana Silva', email: 'ana@example.test' });
    expect(emailExiste).toHaveBeenCalledTimes(1);
    expect(emailExiste).toHaveBeenCalledWith('ana@example.test');
  });

  it.each([
    { campo: 'nomeEscritorio', valor: '' },
    { campo: 'nomeEscritorio', valor: 'A' },
    { campo: 'nomeEscritorio', valor: 'a'.repeat(121) },
    { campo: 'nomeAdministrador', valor: ' ' },
    { campo: 'nomeAdministrador', valor: 'A' },
    { campo: 'nomeAdministrador', valor: 'a'.repeat(121) },
    { campo: 'email', valor: 'not-an-email' },
    { campo: 'email', valor: '' },
    { campo: 'senha', valor: '' },
    { campo: 'senha', valor: 'a'.repeat(11) },
    { campo: 'senha', valor: 'a'.repeat(129) },
    { campo: 'senha', valor: undefined },
  ] as const)("rejeita $campo inválido antes de calcular hash ou consultar persistência", async ({ campo, valor }) => {
    const { repositorio, geradorHash, useCase: casoDeUso } = prepararCenario();
    const emailExiste = vi.spyOn(repositorio, "possuiUsuarioComEmail");
    const cadastrar = vi.spyOn(repositorio, "salvarCadastroCompleto");
    await expect(casoDeUso.cadastrarEscritorioComProprietario({ ...ENTRADA, [campo]: valor }))
      .rejects.toThrowError(new ErroCadastroInvalido(campo));
    expect(emailExiste).not.toHaveBeenCalled();
    expect(cadastrar).not.toHaveBeenCalled();
    expect(geradorHash.gerarHashDaSenha).not.toHaveBeenCalled();
  });

  it.each(['a'.repeat(12), 'a'.repeat(128), '😀'.repeat(12), '  twelve characters  '])(
    "aceita limites da senha sem remover seus espaços", async (senha) => {
      const { geradorHash, useCase: casoDeUso } = prepararCenario();
      await casoDeUso.cadastrarEscritorioComProprietario({ ...ENTRADA, senha });
      expect(geradorHash.gerarHashDaSenha).toHaveBeenCalledTimes(1);
      expect(geradorHash.gerarHashDaSenha).toHaveBeenCalledWith(senha);
    },
  );

  it("rejeita e-mail já cadastrado independentemente da caixa antes de calcular novo hash", async () => {
    const { repositorio, geradorHash, useCase: casoDeUso } = prepararCenario();
    await casoDeUso.cadastrarEscritorioComProprietario(ENTRADA);
    vi.mocked(geradorHash.gerarHashDaSenha).mockClear();
    await expect(casoDeUso.cadastrarEscritorioComProprietario({ ...ENTRADA, email: ' ANA@EXAMPLE.TEST ' }))
      .rejects.toBeInstanceOf(ErroEmailJaCadastrado);
    expect(repositorio.cadastros).toHaveLength(1);
    expect(geradorHash.gerarHashDaSenha).not.toHaveBeenCalled();
  });

  it("propaga conflito de unicidade detectado na persistência atômica após consulta desatualizada", async () => {
    const { repositorio, useCase: casoDeUso } = prepararCenario();
    vi.spyOn(repositorio, "possuiUsuarioComEmail").mockResolvedValue(false);
    vi.spyOn(repositorio, "salvarCadastroCompleto").mockRejectedValue(new ErroEmailJaCadastrado());
    await expect(casoDeUso.cadastrarEscritorioComProprietario(ENTRADA)).rejects.toBeInstanceOf(ErroEmailJaCadastrado);
    expect(repositorio.cadastros).toHaveLength(0);
  });

  it("não persiste dados quando o cálculo do hash da senha falha", async () => {
    const { repositorio, geradorHash, useCase: casoDeUso } = prepararCenario();
    const falha = new Error('Hasher unavailable');
    vi.mocked(geradorHash.gerarHashDaSenha).mockRejectedValue(falha);
    const cadastrar = vi.spyOn(repositorio, "salvarCadastroCompleto");
    await expect(casoDeUso.cadastrarEscritorioComProprietario(ENTRADA)).rejects.toBe(falha);
    expect(cadastrar).not.toHaveBeenCalled();
  });

  it("não retorna resultado não persistido quando o cadastro falha", async () => {
    const { repositorio, useCase: casoDeUso } = prepararCenario();
    const falha = new Error('Persistence unavailable');
    vi.spyOn(repositorio, "salvarCadastroCompleto").mockRejectedValue(falha);
    await expect(casoDeUso.cadastrarEscritorioComProprietario(ENTRADA)).rejects.toBe(falha);
    expect(repositorio.cadastros).toHaveLength(0);
  });

  it("permite somente um cadastro concorrente para o mesmo e-mail normalizado", async () => {
    const { repositorio, useCase: casoDeUso } = prepararCenario();
    const resultados = await Promise.allSettled([
      casoDeUso.cadastrarEscritorioComProprietario(ENTRADA), casoDeUso.cadastrarEscritorioComProprietario({ ...ENTRADA, email: ' ANA@EXAMPLE.TEST ' }),
    ]);
    expect(resultados.filter((resultado) => resultado.status === 'fulfilled')).toHaveLength(1);
    const rejeitado = resultados.find((resultado) => resultado.status === 'rejected');
    expect(rejeitado).toMatchObject({ status: 'rejected', reason: new ErroEmailJaCadastrado() });
    expect(repositorio.cadastros).toHaveLength(1);
  });
});

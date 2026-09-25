import { describe, expect, it, vi } from 'vitest';
import { CadastroDeEscritorio } from '../../src/application/offices/create-office.js';
import { ErroEscritorioInvalido } from '../../src/domain/offices/invalid-office-error.js';
import { RepositorioEscritoriosEmMemoria } from '../support/in-memory-offices-repository.js';

describe("CadastroDeEscritorio", () => {
  it("persiste e retorna escritório válido pelo contrato do repositório", async () => {
    const repositorio = new RepositorioEscritoriosEmMemoria();
    const criarEscritorio = new CadastroDeEscritorio(repositorio);

    const escritorio = await criarEscritorio.cadastrarEscritorio({ nome: ' Escritório Exemplo ' });
    const escritorioArmazenado = await repositorio.buscarEscritorioPorId(escritorio.id);

    expect(escritorio.nome).toBe('Escritório Exemplo');
    expect(escritorio.situacao).toBe('ATIVO');
    expect(escritorioArmazenado).toBe(escritorio);
  });

  it("não chama a persistência quando a entrada é inválida", async () => {
    const repositorio = new RepositorioEscritoriosEmMemoria();
    const criar = vi.spyOn(repositorio, "salvarEscritorio");

    await expect(new CadastroDeEscritorio(repositorio).cadastrarEscritorio({ nome: ' ' }))
      .rejects.toThrowError(new ErroEscritorioInvalido('nome'));
    expect(criar).not.toHaveBeenCalled();
  });

  it("propaga falha de persistência sem retornar escritório não salvo", async () => {
    const repositorio = new RepositorioEscritoriosEmMemoria();
    const falha = new Error('Persistence unavailable');
    vi.spyOn(repositorio, "salvarEscritorio").mockRejectedValueOnce(falha);

    await expect(new CadastroDeEscritorio(repositorio).cadastrarEscritorio({ nome: 'Exemplo' }))
      .rejects.toBe(falha);
  });

  it("retorna null quando o escritório não existe", async () => {
    const repositorio = new RepositorioEscritoriosEmMemoria();

    expect(await repositorio.buscarEscritorioPorId('02ac42eb-e434-4ffd-90eb-91ca9e2a4b16'))
      .toBeNull();
  });
});

import { Escritorio } from '../../domain/offices/office.js';
import type { RepositorioEscritorios } from './offices-repository.js';

export class CadastroDeEscritorio {
  constructor(private readonly repositorioEscritorios: RepositorioEscritorios) {}

  async cadastrarEscritorio(entrada: { nome: string }): Promise<Escritorio> {
    const escritorio = Escritorio.criar({ nome: entrada.nome });
    return this.repositorioEscritorios.salvarEscritorio(escritorio);
  }
}

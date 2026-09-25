import type { RepositorioEscritorios } from '../../src/application/offices/offices-repository.js';
import type { Escritorio } from '../../src/domain/offices/office.js';

export class RepositorioEscritoriosEmMemoria implements RepositorioEscritorios {
  private readonly escritorios = new Map<string, Escritorio>();

  async salvarEscritorio(escritorio: Escritorio): Promise<Escritorio> {
    if (this.escritorios.has(escritorio.id)) {
      throw new Error('Office already exists');
    }
    this.escritorios.set(escritorio.id, escritorio);
    return escritorio;
  }

  async buscarEscritorioPorId(id: string): Promise<Escritorio | null> {
    return this.escritorios.get(id) ?? null;
  }
}

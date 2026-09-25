import type { Escritorio } from '../../domain/offices/office.js';

export interface RepositorioEscritorios {
  salvarEscritorio(escritorio: Escritorio): Promise<Escritorio>;
  buscarEscritorioPorId(id: string): Promise<Escritorio | null>;
}

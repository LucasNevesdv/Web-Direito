import { PoliticaClientes } from '../clients/client-policy.js';
import { PoliticaCasosProcessos } from '../cases/case-policy.js';
import type { AutorEscritorio } from '../tasks/task-contracts.js';
import { TIPOS_VINCULO, type TipoVinculo } from './business-links.js';

// A busca compartilhada e os rótulos da Agenda respeitam as políticas dos cadastros de origem.
export function podeVisualizarVinculo(autor: AutorEscritorio, tipo: TipoVinculo): boolean {
  const padrao = tipo === 'CLIENTE' ? PoliticaClientes.permissoesPadrao(autor.papel) : PoliticaCasosProcessos.permissoesPadrao(autor.papel);
  return [...padrao, ...(autor.permissoes ?? [])].includes(tipo === 'CLIENTE' ? 'CLIENTE_VISUALIZAR' : 'CASO_VISUALIZAR');
}
export const tiposVinculoPermitidos = (autor: AutorEscritorio) => TIPOS_VINCULO.filter((tipo) => podeVisualizarVinculo(autor, tipo));

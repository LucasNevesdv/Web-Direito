import type { TipoVinculo, Vinculo } from '../../shared/link-picker';
export const TIPOS = { AUDIENCIA: 'Audiência', REUNIAO: 'Reunião', PERICIA: 'Perícia', EVENTO_INTERNO: 'Evento interno' } as const;
export type Tipo = keyof typeof TIPOS;
export interface Pessoa { id: string; nome: string }
export interface ConfiguracaoAgenda { fusoHorario: string; hoje: string; idUsuario: string; membros: Pessoa[]; tiposVinculoPermitidos?: TipoVinculo[] }
export interface Compromisso {
  id: string; titulo: string; descricao: string; tipo: Tipo; inicio: string; fim: string; local: string; linkRemoto: string;
  participantes: Pessoa[]; criador: Pessoa; vinculo: Vinculo | null; lembreteMinutos: number | null;
  situacao: 'AGENDADO' | 'REALIZADO' | 'CANCELADO'; versao: number; podeEditar: boolean; podeCancelar: boolean;
  rotuloVinculo: string | null;
  vinculoRestrito?: boolean;
}
export interface ItemCivil { id: string; titulo: string; data: string; origem: 'TAREFA' | 'PRAZO'; responsavel: Pessoa }
export interface Lembrete { id: string; idCompromisso: string; titulo: string; inicio: string }
export interface Historico { id: string; autor: Pessoa; acao: string; criadoEm: string; anterior: unknown; atual: unknown }

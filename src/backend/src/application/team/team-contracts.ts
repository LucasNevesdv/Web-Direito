import type { DadosTokenAcesso } from '../authentication/authentication-contracts.js';
import type { PapelVinculoEscritorio } from '../../domain/memberships/membership.js';
import type { Usuario } from '../../domain/users/user.js';
import type { AutorEquipe } from './team-policy.js';

export interface MembroEquipe {
  id: string; idUsuario: string; nome: string; email: string; papel: PapelVinculoEscritorio;
  permissoes: string[]; estaAtivo: boolean; deveAlterarSenha: boolean; criadoEm: Date; versao: number;
}
export interface FiltroEquipe { pagina: number; tamanhoPagina: number; pesquisa: string }
export interface HistoricoEquipe { id: string; idAutor: string; acao: string; anterior: unknown; atual: unknown; criadoEm: Date }
export interface OperacoesEquipe {
  autor: AutorEquipe;
  listar(filtro: FiltroEquipe): Promise<{ usuarios: MembroEquipe[]; total: number }>;
  consultar(id: string): Promise<MembroEquipe>;
  historico(id: string): Promise<HistoricoEquipe[]>;
  criar(dados: { email: string; usuarioNovo?: Usuario; papel: PapelVinculoEscritorio; permissoes: string[]; confirmarContaExistente: boolean }): Promise<MembroEquipe>;
  alterar(anterior: MembroEquipe, dados: { papel: PapelVinculoEscritorio; permissoes: string[]; estaAtivo: boolean }): Promise<MembroEquipe>;
}
export interface RepositorioEquipe {
  executar<T>(contexto: DadosTokenAcesso, operacao: (equipe: OperacoesEquipe) => Promise<T>): Promise<T>;
}

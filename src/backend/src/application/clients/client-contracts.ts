import type { DadosTokenAcesso } from '../authentication/authentication-contracts.js';
import type { PapelVinculoEscritorio } from '../../domain/memberships/membership.js';
import type { Cliente, EnderecoCliente, SituacaoCliente, TipoPessoaCliente } from '../../domain/clients/client.js';
import type { ContatoCliente } from '../../domain/clients/client-contact.js';
import type { AutorCliente } from './client-policy.js';

export interface ClienteResumoDto {
  id: string;
  idEscritorio: string;
  tipoPessoa: TipoPessoaCliente;
  nome: string;
  nomeSocial: string | null;
  documento: string;
  email: string | null;
  telefone: string | null;
  situacao: SituacaoCliente;
  idVinculoResponsavel: string | null;
  nomeResponsavel?: string | null;
  versao: number;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface ContatoClienteDto {
  id: string;
  idEscritorio: string;
  idCliente: string;
  nome: string;
  cargoOuRelacao: string | null;
  email: string | null;
  telefone: string | null;
  observacao: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface ClienteDetalheDto extends ClienteResumoDto {
  endereco: EnderecoCliente | null;
  observacoesInternas: string | null;
  contatos: ContatoClienteDto[];
}

export interface EventoLinhaTempoClienteDto {
  id: string;
  idEscritorio: string;
  idCliente: string;
  idAutor: string;
  nomeAutor?: string;
  acao: string;
  motivo?: string | null;
  anterior: Record<string, unknown> | null;
  atual: Record<string, unknown>;
  criadoEm: Date;
}

export interface FiltroClientes {
  pagina: number;
  tamanhoPagina: number;
  pesquisa: string;
  situacao?: SituacaoCliente;
  tipoPessoa?: TipoPessoaCliente;
  idVinculoResponsavel?: string;
}

export interface IndicioDuplicidadeCliente {
  id: string;
  nome: string;
  nomeSocial: string | null;
  tipoPessoa: TipoPessoaCliente;
  documentoMascarado: string;
  email: string | null;
  telefone: string | null;
  situacao: SituacaoCliente;
  motivos: Array<'DOCUMENTO_IDENTICO' | 'NOME_IDENTICO' | 'EMAIL_IDENTICO' | 'TELEFONE_IDENTICO'>;
}

export interface OperacoesClientes {
  autor: AutorCliente;
  listarClientes(filtro: FiltroClientes): Promise<{ clientes: ClienteResumoDto[]; total: number }>;
  buscarClientePorId(idCliente: string): Promise<ClienteDetalheDto>;
  verificarDuplicidades(entrada: {
    documento: string;
    nome: string;
    email?: string | null;
    telefone?: string | null;
    ignorarIdCliente?: string;
  }): Promise<IndicioDuplicidadeCliente[]>;
  validarVinculoResponsavelNoEscritorio(idVinculoResponsavel: string): Promise<{ id: string; nome: string; papel: PapelVinculoEscritorio }>;
  criarCliente(cliente: Cliente, contatosIniciais: ContatoCliente[]): Promise<ClienteDetalheDto>;
  atualizarCliente(
    anterior: ClienteDetalheDto,
    atualizado: Cliente,
    evento?: { acao: string; anterior?: Record<string, unknown> | null; atual: Record<string, unknown> },
  ): Promise<ClienteDetalheDto>;
  definirSituacao(anterior: ClienteDetalheDto, situacao: SituacaoCliente, motivo?: string | null): Promise<ClienteDetalheDto>;
  listarLinhaDoTempoCliente(idCliente: string): Promise<EventoLinhaTempoClienteDto[]>;
}

export interface RepositorioClientes {
  executar<T>(contexto: DadosTokenAcesso, operacao: (clientes: OperacoesClientes) => Promise<T>): Promise<T>;
}

export interface DadosCadastroCliente {
  tipoPessoa: TipoPessoaCliente;
  nome: string;
  nomeSocial?: string | null;
  documento: string;
  email?: string | null;
  telefone?: string | null;
  endereco?: EnderecoCliente | null;
  observacoesInternas?: string | null;
  idVinculoResponsavel?: string | null;
  contatosIniciais?: Array<{
    nome: string;
    cargoOuRelacao?: string | null;
    email?: string | null;
    telefone?: string | null;
    observacao?: string | null;
  }>;
  confirmarDuplicidadePotencial?: boolean;
}

export interface DadosEdicaoCliente {
  nome: string;
  nomeSocial?: string | null;
  documento: string;
  email?: string | null;
  telefone?: string | null;
  endereco?: EnderecoCliente | null;
  observacoesInternas?: string | null;
  idVinculoResponsavel?: string | null;
  versao: number;
}

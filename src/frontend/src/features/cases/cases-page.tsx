import { useEffect, useState, type FormEvent } from 'react';
import { dataHoraBrasileira, requisitarApi } from '../../shared/api';
import { useAutenticacao } from '../../shared/auth/auth-context';
import { BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO, Pagina } from '../../shared/ui';

export type NaturezaCaso = 'JUDICIAL' | 'EXTRAJUDICIAL' | 'ADMINISTRATIVO' | 'CONSULTIVO';
export type PrioridadeCaso = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
export type SituacaoCaso = 'ATIVO' | 'SUSPENSO' | 'ENCERRADO' | 'ARQUIVADO';
export type TipoParticipacao =
  | 'PARTE_CONTRARIA'
  | 'ADVOGADO_CONTRARIO'
  | 'TERCEIRO_INTERESSADO'
  | 'TESTEMUNHA'
  | 'PERITO'
  | 'OUTRO';

export interface ClienteResumo {
  id: string;
  nome: string;
  documento: string;
  tipoPessoa: string;
}

export interface MembroEquipeResumo {
  id: string;
  idUsuario: string;
  nome: string;
  papel: string;
}

export interface ParteEnvolvida {
  id: string;
  idEscritorio: string;
  idCaso: string;
  tipoParticipacao: TipoParticipacao;
  nome: string;
  documento: string | null;
  oab: string | null;
  contato: string | null;
  observacao: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ProcessoResumo {
  id: string;
  numeroCnj: string;
  relacaoComCaso: string;
  tribunal: string;
  instancia: string;
  faseProcessual: string;
}

export interface CasoItem {
  id: string;
  idEscritorio: string;
  titulo: string;
  natureza: NaturezaCaso;
  areaJuridica: string;
  prioridade: PrioridadeCaso;
  situacao: SituacaoCaso;
  idVinculoResponsavel: string | null;
  nomeResponsavel?: string | null;
  valorCausaCentavos: number | null;
  valorEnvolvidoCentavos: number | null;
  clientes: ClienteResumo[];
  quantidadeProcessos: number;
  versao: number;
  ultimaAtividadeEm: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface CasoDetalhe extends CasoItem {
  descricao: string | null;
  equipe: MembroEquipeResumo[];
  partes: ParteEnvolvida[];
  processos: ProcessoResumo[];
}

export interface EventoLinhaTempoCaso {
  id: string;
  idAutor: string;
  nomeAutor?: string;
  acao: string;
  anterior: Record<string, unknown> | null;
  atual: Record<string, unknown>;
  criadoEm: string;
}

interface MembroEquipeOpcao {
  id: string;
  nome: string;
  papel: string;
  estaAtivo: boolean;
}

interface ClienteOpcao {
  id: string;
  nome: string;
  documento: string;
}

const ROTULOS_NATUREZA: Record<NaturezaCaso, string> = {
  JUDICIAL: 'Judicial',
  EXTRAJUDICIAL: 'Extrajudicial',
  ADMINISTRATIVO: 'Administrativo',
  CONSULTIVO: 'Consultivo',
};

const ROTULOS_PRIORIDADE: Record<PrioridadeCaso, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

const ROTULOS_SITUACAO: Record<SituacaoCaso, string> = {
  ATIVO: 'Ativo',
  SUSPENSO: 'Suspenso',
  ENCERRADO: 'Encerrado',
  ARQUIVADO: 'Arquivado',
};

const ROTULOS_PARTICIPACAO: Record<TipoParticipacao, string> = {
  PARTE_CONTRARIA: 'Parte contrária',
  ADVOGADO_CONTRARIO: 'Advogado contrário',
  TERCEIRO_INTERESSADO: 'Terceiro interessado',
  TESTEMUNHA: 'Testemunha',
  PERITO: 'Perito',
  OUTRO: 'Outro',
};

export function formatarMoeda(centavos: number | null): string {
  if (centavos === null || centavos === undefined) return 'Não informado';
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function converterReaisParaCentavos(valorReais: string): number | null {
  const limpo = valorReais.trim().replace(/[^\d,.-]/g, '');
  if (!limpo) return null;
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo;
  const num = Number.parseFloat(normalizado);
  if (Number.isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

export function converterCentavosParaReais(centavos: number | null): string {
  if (centavos === null || centavos === undefined) return '';
  return (centavos / 100).toFixed(2).replace('.', ',');
}

export function PaginaCasos() {
  const { cliente } = useAutenticacao();
  const [casos, setCasos] = useState<CasoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [pesquisa, setPesquisa] = useState('');
  const [filtroRapido, setFiltroRapido] = useState<'ATIVOS' | 'SEM_RESPONSAVEL' | 'SEM_ATIVIDADE' | 'ARQUIVADOS'>('ATIVOS');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Detalhe & Modais
  const [casoSelecionado, setCasoSelecionado] = useState<CasoDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [linhaTempo, setLinhaTempo] = useState<EventoLinhaTempoCaso[]>([]);
  const [abaDetalhe, setAbaDetalhe] = useState<'info' | 'partes' | 'timeline'>('info');

  // Modal Cadastro/Edição de Caso
  const [modalCasoAberto, setModalCasoAberto] = useState(false);
  const [casoEmEdicao, setCasoEmEdicao] = useState<CasoDetalhe | null>(null);
  const [salvandoCaso, setSalvandoCaso] = useState(false);

  // Opções para o formulário
  const [clientesDisponiveis, setClientesDisponiveis] = useState<ClienteOpcao[]>([]);
  const [equipeDisponivel, setEquipeDisponivel] = useState<MembroEquipeOpcao[]>([]);

  // Campos do formulário de Caso
  const [formTitulo, setFormTitulo] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [formNatureza, setFormNatureza] = useState<NaturezaCaso>('JUDICIAL');
  const [formAreaJuridica, setFormAreaJuridica] = useState('CIVEL');
  const [formPrioridade, setFormPrioridade] = useState<PrioridadeCaso>('MEDIA');
  const [formIdResponsavel, setFormIdResponsavel] = useState<string>('');
  const [formValorCausa, setFormValorCausa] = useState('');
  const [formValorEnvolvido, setFormValorEnvolvido] = useState('');
  const [formClientesSelecionados, setFormClientesSelecionados] = useState<string[]>([]);
  const [formEquipeSelecionada, setFormEquipeSelecionada] = useState<string[]>([]);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);

  // Modal Parte Envolvida
  const [modalParteAberto, setModalParteAberto] = useState(false);
  const [parteEmEdicao, setParteEmEdicao] = useState<ParteEnvolvida | null>(null);
  const [formParteTipo, setFormParteTipo] = useState<TipoParticipacao>('PARTE_CONTRARIA');
  const [formParteNome, setFormParteNome] = useState('');
  const [formParteDoc, setFormParteDoc] = useState('');
  const [formParteOab, setFormParteOab] = useState('');
  const [formParteContato, setFormParteContato] = useState('');
  const [formParteObs, setFormParteObs] = useState('');
  const [salvandoParte, setSalvandoParte] = useState(false);

  // Ação de Arquivar / Reabrir
  const [motivoAcao, setMotivoAcao] = useState('');
  const [processandoAcao, setProcessandoAcao] = useState(false);

  async function carregarCasos() {
    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams({
        pagina: String(pagina),
        tamanhoPagina: '20',
      });

      if (pesquisa.trim()) {
        params.set('pesquisa', pesquisa.trim());
      }

      if (filtroRapido === 'ATIVOS') {
        params.set('situacao', 'ATIVO');
      } else if (filtroRapido === 'SEM_RESPONSAVEL') {
        params.set('semResponsavel', 'true');
      } else if (filtroRapido === 'SEM_ATIVIDADE') {
        params.set('semAtividadeDesdeDias', '30');
      } else if (filtroRapido === 'ARQUIVADOS') {
        params.set('situacao', 'ARQUIVADO');
      }

      const res = await requisitarApi<{ casos: CasoItem[]; total: number }>(
        cliente,
        `/api/v1/casos?${params.toString()}`,
      );
      if (res.ok) {
        setCasos(res.dados.casos ?? []);
        setTotal(res.dados.total ?? 0);
      } else {
        setErro(res.mensagem);
      }
    } catch (e) {
      setErro((e as Error).message || 'Falha ao carregar casos.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregarCasos();
  }, [pagina, filtroRapido]);

  async function carregarOpcoesFormulario() {
    try {
      const [resClientes, resEquipe] = await Promise.all([
        requisitarApi<{ clientes: Array<{ id: string; nome: string; documento: string }> }>(
          cliente,
          '/api/v1/clientes?tamanhoPagina=50&situacao=ATIVO',
        ).catch(() => null),
        requisitarApi<{ membros: MembroEquipeOpcao[] }>(cliente, '/api/v1/equipe').catch(() => null),
      ]);
      if (resClientes && resClientes.ok) {
        setClientesDisponiveis(resClientes.dados.clientes ?? []);
      }
      if (resEquipe && resEquipe.ok) {
        setEquipeDisponivel(resEquipe.dados.membros ?? []);
      }
    } catch {
      // Ignora erro de pré-carregamento
    }
  }

  useEffect(() => {
    void carregarOpcoesFormulario();
  }, []);

  async function abrirDetalhesCaso(idCaso: string) {
    setCarregandoDetalhe(true);
    try {
      const detalhe = await requisitarApi<CasoDetalhe>(cliente, `/api/v1/casos/${idCaso}`);
      if (detalhe.ok) {
        setCasoSelecionado(detalhe.dados);
        setAbaDetalhe('info');
        // Carregar linha do tempo
        const eventos = await requisitarApi<EventoLinhaTempoCaso[]>(cliente, `/api/v1/casos/${idCaso}/linha-do-tempo`);
        if (eventos.ok) {
          setLinhaTempo(eventos.dados ?? []);
        }
      } else {
        setErro(detalhe.mensagem);
      }
    } catch (e) {
      setErro((e as Error).message || 'Erro ao carregar detalhes do caso.');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  function abrirModalNovoCaso() {
    setCasoEmEdicao(null);
    setFormTitulo('');
    setFormDescricao('');
    setFormNatureza('JUDICIAL');
    setFormAreaJuridica('CIVEL');
    setFormPrioridade('MEDIA');
    setFormIdResponsavel('');
    setFormValorCausa('');
    setFormValorEnvolvido('');
    setFormClientesSelecionados(clientesDisponiveis.length > 0 ? [clientesDisponiveis[0]!.id] : []);
    setFormEquipeSelecionada([]);
    setErroFormulario(null);
    setModalCasoAberto(true);
  }

  function abrirModalEditarCaso(caso: CasoDetalhe) {
    setCasoEmEdicao(caso);
    setFormTitulo(caso.titulo);
    setFormDescricao(caso.descricao ?? '');
    setFormNatureza(caso.natureza);
    setFormAreaJuridica(caso.areaJuridica);
    setFormPrioridade(caso.prioridade);
    setFormIdResponsavel(caso.idVinculoResponsavel ?? '');
    setFormValorCausa(converterCentavosParaReais(caso.valorCausaCentavos));
    setFormValorEnvolvido(converterCentavosParaReais(caso.valorEnvolvidoCentavos));
    setFormClientesSelecionados(caso.clientes.map((c) => c.id));
    setFormEquipeSelecionada(caso.equipe.map((m) => m.id));
    setErroFormulario(null);
    setModalCasoAberto(true);
  }

  async function salvarCaso(e: FormEvent) {
    e.preventDefault();
    setErroFormulario(null);

    if (formTitulo.trim().length < 3) {
      setErroFormulario('O título deve ter no mínimo 3 caracteres.');
      return;
    }

    if (formClientesSelecionados.length === 0) {
      setErroFormulario('Selecione pelo menos um cliente para o caso.');
      return;
    }

    const valorCausaCentavos = converterReaisParaCentavos(formValorCausa);
    const valorEnvolvidoCentavos = converterReaisParaCentavos(formValorEnvolvido);

    setSalvandoCaso(true);
    try {
      if (casoEmEdicao) {
        const resp = await requisitarApi<CasoDetalhe>(cliente, `/api/v1/casos/${casoEmEdicao.id}`, {
          method: 'PATCH',
          json: {
            titulo: formTitulo.trim(),
            descricao: formDescricao.trim() || null,
            natureza: formNatureza,
            areaJuridica: formAreaJuridica.trim(),
            prioridade: formPrioridade,
            idVinculoResponsavel: formIdResponsavel || null,
            valorCausaCentavos,
            valorEnvolvidoCentavos,
            idsClientes: formClientesSelecionados,
            idsVinculosEquipe: formEquipeSelecionada,
            versao: casoEmEdicao.versao,
          },
        });
        if (resp.ok) {
          setCasoSelecionado(resp.dados);
        } else {
          setErroFormulario(resp.mensagem);
          return;
        }
      } else {
        const resp = await requisitarApi<CasoDetalhe>(cliente, '/api/v1/casos', {
          method: 'POST',
          json: {
            titulo: formTitulo.trim(),
            descricao: formDescricao.trim() || null,
            natureza: formNatureza,
            areaJuridica: formAreaJuridica.trim(),
            prioridade: formPrioridade,
            idVinculoResponsavel: formIdResponsavel || null,
            valorCausaCentavos,
            valorEnvolvidoCentavos,
            idsClientes: formClientesSelecionados,
            idsVinculosEquipe: formEquipeSelecionada,
          },
        });
        if (!resp.ok) {
          setErroFormulario(resp.mensagem);
          return;
        }
      }
      setModalCasoAberto(false);
      void carregarCasos();
    } catch (err) {
      setErroFormulario((err as Error).message || 'Falha ao salvar caso.');
    } finally {
      setSalvandoCaso(false);
    }
  }

  async function executarArquivar() {
    if (!casoSelecionado) return;
    setProcessandoAcao(true);
    try {
      const resp = await requisitarApi<CasoDetalhe>(
        cliente,
        `/api/v1/casos/${casoSelecionado.id}/arquivar`,
        {
          method: 'POST',
          json: {
            versao: casoSelecionado.versao,
            motivo: motivoAcao.trim() || undefined,
          },
        },
      );
      if (resp.ok) {
        setCasoSelecionado(resp.dados);
        setMotivoAcao('');
        void carregarCasos();
        // Atualizar linha do tempo
        const eventos = await requisitarApi<EventoLinhaTempoCaso[]>(cliente, `/api/v1/casos/${resp.dados.id}/linha-do-tempo`);
        if (eventos.ok) {
          setLinhaTempo(eventos.dados ?? []);
        }
      } else {
        setErro(resp.mensagem);
      }
    } catch (err) {
      setErro((err as Error).message || 'Falha ao arquivar caso.');
    } finally {
      setProcessandoAcao(false);
    }
  }

  async function executarReabrir() {
    if (!casoSelecionado) return;
    setProcessandoAcao(true);
    try {
      const resp = await requisitarApi<CasoDetalhe>(
        cliente,
        `/api/v1/casos/${casoSelecionado.id}/reabrir`,
        {
          method: 'POST',
          json: {
            versao: casoSelecionado.versao,
            motivo: motivoAcao.trim() || undefined,
          },
        },
      );
      if (resp.ok) {
        setCasoSelecionado(resp.dados);
        setMotivoAcao('');
        void carregarCasos();
        // Atualizar linha do tempo
        const eventos = await requisitarApi<EventoLinhaTempoCaso[]>(cliente, `/api/v1/casos/${resp.dados.id}/linha-do-tempo`);
        if (eventos.ok) {
          setLinhaTempo(eventos.dados ?? []);
        }
      } else {
        setErro(resp.mensagem);
      }
    } catch (err) {
      setErro((err as Error).message || 'Falha ao reabrir caso.');
    } finally {
      setProcessandoAcao(false);
    }
  }

  function abrirModalNovaParte() {
    setParteEmEdicao(null);
    setFormParteTipo('PARTE_CONTRARIA');
    setFormParteNome('');
    setFormParteDoc('');
    setFormParteOab('');
    setFormParteContato('');
    setFormParteObs('');
    setModalParteAberto(true);
  }

  function abrirModalEditarParte(parte: ParteEnvolvida) {
    setParteEmEdicao(parte);
    setFormParteTipo(parte.tipoParticipacao);
    setFormParteNome(parte.nome);
    setFormParteDoc(parte.documento ?? '');
    setFormParteOab(parte.oab ?? '');
    setFormParteContato(parte.contato ?? '');
    setFormParteObs(parte.observacao ?? '');
    setModalParteAberto(true);
  }

  async function salvarParte(e: FormEvent) {
    e.preventDefault();
    if (!casoSelecionado) return;
    if (formParteNome.trim().length < 2) return;

    setSalvandoParte(true);
    try {
      if (parteEmEdicao) {
        const resp = await requisitarApi<ParteEnvolvida>(
          cliente,
          `/api/v1/casos/${casoSelecionado.id}/partes/${parteEmEdicao.id}`,
          {
            method: 'PATCH',
            json: {
              tipoParticipacao: formParteTipo,
              nome: formParteNome.trim(),
              documento: formParteDoc.trim() || null,
              oab: formParteOab.trim() || null,
              contato: formParteContato.trim() || null,
              observacao: formParteObs.trim() || null,
            },
          },
        );
        if (!resp.ok) {
          setErro(resp.mensagem);
          return;
        }
      } else {
        const resp = await requisitarApi<ParteEnvolvida>(cliente, `/api/v1/casos/${casoSelecionado.id}/partes`, {
          method: 'POST',
          json: {
            tipoParticipacao: formParteTipo,
            nome: formParteNome.trim(),
            documento: formParteDoc.trim() || null,
            oab: formParteOab.trim() || null,
            contato: formParteContato.trim() || null,
            observacao: formParteObs.trim() || null,
          },
        });
        if (!resp.ok) {
          setErro(resp.mensagem);
          return;
        }
      }
      setModalParteAberto(false);
      void abrirDetalhesCaso(casoSelecionado.id);
    } catch (err) {
      setErro((err as Error).message || 'Falha ao salvar parte envolvida.');
    } finally {
      setSalvandoParte(false);
    }
  }

  async function removerParte(idParte: string) {
    if (!casoSelecionado) return;
    if (!confirm('Tem certeza que deseja remover esta parte envolvida?')) return;
    try {
      await requisitarApi<void>(cliente, `/api/v1/casos/${casoSelecionado.id}/partes/${idParte}`, {
        method: 'DELETE',
      });
      void abrirDetalhesCaso(casoSelecionado.id);
    } catch (err) {
      setErro((err as Error).message || 'Falha ao remover parte envolvida.');
    }
  }

  const advogadosElegiveis = equipeDisponivel.filter(
    (m) => m.estaAtivo && ['PROPRIETARIO', 'ADMINISTRADOR', 'ADVOGADO'].includes(m.papel),
  );

  return (
    <Pagina caminho="/casos" titulo="Casos e Processos">
      <div className="space-y-6">
        {/* Barra superior de ações e busca */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPagina(1);
              void carregarCasos();
            }}
            className="flex flex-1 items-center gap-2 max-w-md"
          >
            <input
              type="search"
              placeholder="Buscar por título, cliente ou CNJ..."
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              className={CAMPO}
            />
            <button type="submit" className={BOTAO_SECUNDARIO}>
              Buscar
            </button>
          </form>

          <button
            type="button"
            onClick={abrirModalNovoCaso}
            className={BOTAO}
          >
            Novo caso
          </button>
        </div>

        {/* Filtros rápidos operacionais */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setFiltroRapido('ATIVOS');
              setPagina(1);
            }}
            className={filtroRapido === 'ATIVOS' ? BOTAO : BOTAO_SECUNDARIO}
          >
            Todos os casos ativos
          </button>
          <button
            type="button"
            onClick={() => {
              setFiltroRapido('SEM_RESPONSAVEL');
              setPagina(1);
            }}
            className={filtroRapido === 'SEM_RESPONSAVEL' ? BOTAO : BOTAO_SECUNDARIO}
          >
            Sem responsável (RF-047)
          </button>
          <button
            type="button"
            onClick={() => {
              setFiltroRapido('SEM_ATIVIDADE');
              setPagina(1);
            }}
            className={filtroRapido === 'SEM_ATIVIDADE' ? BOTAO : BOTAO_SECUNDARIO}
          >
            Sem atividade recente (30 dias) (RF-048)
          </button>
          <button
            type="button"
            onClick={() => {
              setFiltroRapido('ARQUIVADOS');
              setPagina(1);
            }}
            className={filtroRapido === 'ARQUIVADOS' ? BOTAO : BOTAO_SECUNDARIO}
          >
            Arquivados (RF-046)
          </button>
        </div>

        {erro && (
          <div className="rounded-lg bg-red-950 p-4 border border-red-800 text-red-200">
            {erro}
          </div>
        )}

        {/* Tabela de listagem */}
        {carregando ? (
          <p className="text-slate-400">Carregando casos...</p>
        ) : casos.length === 0 ? (
          <div className={`${CARTAO} text-center py-12`}>
            <p className="text-lg text-slate-300">Nenhum caso encontrado.</p>
            <p className="text-sm text-slate-500 mt-1">Crie um novo caso para iniciar a condução dos atendimentos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800 text-slate-300 border-b border-slate-700">
                <tr>
                  <th className="p-3">Título / Dossiê</th>
                  <th className="p-3">Natureza / Área</th>
                  <th className="p-3">Clientes</th>
                  <th className="p-3">Responsável</th>
                  <th className="p-3">Valor da Causa</th>
                  <th className="p-3">Situação</th>
                  <th className="p-3">Última Atividade</th>
                  <th className="p-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {casos.map((caso) => (
                  <tr key={caso.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3 font-semibold text-slate-100">
                      <div>{caso.titulo}</div>
                      <span className="text-xs text-slate-400">
                        Prioridade: {ROTULOS_PRIORIDADE[caso.prioridade]}
                      </span>
                    </td>
                    <td className="p-3">
                      <div>{ROTULOS_NATUREZA[caso.natureza]}</div>
                      <span className="text-xs text-slate-400">{caso.areaJuridica}</span>
                    </td>
                    <td className="p-3">
                      {caso.clientes.map((c) => (
                        <div key={c.id} className="text-slate-200">
                          {c.nome}
                        </div>
                      ))}
                    </td>
                    <td className="p-3 text-slate-300">
                      {caso.nomeResponsavel ?? <span className="text-amber-400 italic">Sem responsável</span>}
                    </td>
                    <td className="p-3 text-slate-200 font-mono">
                      {formatarMoeda(caso.valorCausaCentavos)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          caso.situacao === 'ATIVO'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : caso.situacao === 'ARQUIVADO'
                              ? 'bg-slate-800 text-slate-400 border border-slate-600'
                              : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {ROTULOS_SITUACAO[caso.situacao]}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-slate-400">
                      {dataHoraBrasileira(caso.ultimaAtividadeEm)}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => void abrirDetalhesCaso(caso.id)}
                        className={BOTAO_SECUNDARIO}
                      >
                        Ver detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {total > 20 && (
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>Total: {total} casos</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                className={BOTAO_SECUNDARIO}
              >
                Anterior
              </button>
              <span className="p-1">Página {pagina}</span>
              <button
                type="button"
                disabled={pagina * 20 >= total}
                onClick={() => setPagina((p) => p + 1)}
                className={BOTAO_SECUNDARIO}
              >
                Próxima
              </button>
            </div>
          </div>
        )}

        {/* Painel / Modal de Detalhes do Caso */}
        {casoSelecionado && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-6">
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-slate-100">{casoSelecionado.titulo}</h2>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        casoSelecionado.situacao === 'ATIVO'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : casoSelecionado.situacao === 'ARQUIVADO'
                            ? 'bg-slate-800 text-slate-400 border border-slate-600'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {ROTULOS_SITUACAO[casoSelecionado.situacao]}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    {ROTULOS_NATUREZA[casoSelecionado.natureza]} • {casoSelecionado.areaJuridica} • Prioridade:{' '}
                    {ROTULOS_PRIORIDADE[casoSelecionado.prioridade]}
                  </p>
                  {carregandoDetalhe && (
                    <p className="text-xs text-cyan-300 mt-1">Atualizando detalhes...</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setCasoSelecionado(null)}
                  className="text-slate-400 hover:text-slate-200 text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Abas */}
              <div className="flex gap-4 border-b border-slate-800">
                <button
                  type="button"
                  onClick={() => setAbaDetalhe('info')}
                  className={`pb-2 font-semibold ${
                    abaDetalhe === 'info' ? 'border-b-2 border-cyan-400 text-cyan-300' : 'text-slate-400'
                  }`}
                >
                  Informações Gerais
                </button>
                <button
                  type="button"
                  onClick={() => setAbaDetalhe('partes')}
                  className={`pb-2 font-semibold ${
                    abaDetalhe === 'partes' ? 'border-b-2 border-cyan-400 text-cyan-300' : 'text-slate-400'
                  }`}
                >
                  Partes Envolvidas ({casoSelecionado.partes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAbaDetalhe('timeline')}
                  className={`pb-2 font-semibold ${
                    abaDetalhe === 'timeline' ? 'border-b-2 border-cyan-400 text-cyan-300' : 'text-slate-400'
                  }`}
                >
                  Linha do Tempo
                </button>
              </div>

              {/* Conteúdo Aba Info */}
              {abaDetalhe === 'info' && (
                <div className="space-y-6">
                  {casoSelecionado.descricao && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-400">Descrição / Objeto</h3>
                      <p className="mt-1 whitespace-pre-wrap text-slate-200">{casoSelecionado.descricao}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={CARTAO}>
                      <h3 className="text-xs uppercase font-semibold text-slate-400">Valores Envolvidos</h3>
                      <p className="mt-2 text-sm text-slate-300">
                        Valor da causa: <strong className="text-slate-100">{formatarMoeda(casoSelecionado.valorCausaCentavos)}</strong>
                      </p>
                      <p className="mt-1 text-sm text-slate-300">
                        Valor envolvido: <strong className="text-slate-100">{formatarMoeda(casoSelecionado.valorEnvolvidoCentavos)}</strong>
                      </p>
                    </div>

                    <div className={CARTAO}>
                      <h3 className="text-xs uppercase font-semibold text-slate-400">Responsável & Equipe</h3>
                      <p className="mt-2 text-sm text-slate-300">
                        Responsável: <strong className="text-slate-100">{casoSelecionado.nomeResponsavel ?? 'Nenhum'}</strong>
                      </p>
                      <p className="mt-1 text-sm text-slate-300">
                        Equipe: {casoSelecionado.equipe.map((m) => m.nome).join(', ') || 'Nenhum outro membro'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 mb-2">Clientes Vinculados</h3>
                    <div className="flex flex-wrap gap-2">
                      {casoSelecionado.clientes.map((c) => (
                        <div key={c.id} className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-sm">
                          <span className="font-semibold text-slate-200">{c.nome}</span>
                          <span className="text-xs text-slate-400 ml-2">Doc: {c.documento}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Ações de Estado: Editar, Arquivar ou Reabrir */}
                  <div className="border-t border-slate-800 pt-4 flex flex-wrap gap-3 items-center justify-between">
                    <div>
                      {casoSelecionado.situacao !== 'ARQUIVADO' ? (
                        <button
                          type="button"
                          onClick={() => abrirModalEditarCaso(casoSelecionado)}
                          className={BOTAO_SECUNDARIO}
                        >
                          Editar caso
                        </button>
                      ) : (
                        <span className="text-xs text-amber-400">
                          Caso arquivado (somente leitura). Reabra para poder editar.
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {casoSelecionado.situacao !== 'ARQUIVADO' ? (
                        <button
                          type="button"
                          disabled={processandoAcao}
                          onClick={executarArquivar}
                          className="rounded-lg border border-amber-600 bg-amber-950/40 px-3 py-1 text-amber-300 hover:bg-amber-900/60 transition disabled:opacity-50"
                        >
                          {processandoAcao ? 'Arquivando...' : 'Arquivar caso (RF-046)'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={processandoAcao}
                          onClick={executarReabrir}
                          className="rounded-lg border border-emerald-600 bg-emerald-950/40 px-3 py-1 text-emerald-300 hover:bg-emerald-900/60 transition disabled:opacity-50"
                        >
                          {processandoAcao ? 'Reabrindo...' : 'Reabrir caso (RF-046)'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Conteúdo Aba Partes */}
              {abaDetalhe === 'partes' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-400">
                      Partes contrárias, advogados adversos e outros envolvidos no caso.
                    </p>
                    {casoSelecionado.situacao !== 'ARQUIVADO' && (
                      <button
                        type="button"
                        onClick={abrirModalNovaParte}
                        className={BOTAO_SECUNDARIO}
                      >
                        + Adicionar parte
                      </button>
                    )}
                  </div>

                  {casoSelecionado.partes.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">Nenhuma parte cadastrada.</p>
                  ) : (
                    <div className="divide-y divide-slate-800 rounded-lg border border-slate-700 bg-slate-950">
                      {casoSelecionado.partes.map((p) => (
                        <div key={p.id} className="p-3 flex items-start justify-between">
                          <div>
                            <span className="font-semibold text-slate-100">{p.nome}</span>
                            <span className="ml-2 text-xs text-cyan-300">
                              ({ROTULOS_PARTICIPACAO[p.tipoParticipacao]})
                            </span>
                            <div className="text-xs text-slate-400 mt-1 space-x-3">
                              {p.documento && <span>Doc: {p.documento}</span>}
                              {p.oab && <span>OAB: {p.oab}</span>}
                              {p.contato && <span>Contato: {p.contato}</span>}
                            </div>
                            {p.observacao && (
                              <p className="text-xs text-slate-300 mt-1 italic">{p.observacao}</p>
                            )}
                          </div>
                          {casoSelecionado.situacao !== 'ARQUIVADO' && (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => abrirModalEditarParte(p)}
                                className="text-xs text-slate-400 hover:text-cyan-300"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => void removerParte(p.id)}
                                className="text-xs text-red-400 hover:text-red-300"
                              >
                                Remover
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Conteúdo Aba Linha do Tempo */}
              {abaDetalhe === 'timeline' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-slate-400">Histórico de Eventos do Caso</h3>
                  {linhaTempo.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">Nenhum evento registrado.</p>
                  ) : (
                    <div className="space-y-3">
                      {linhaTempo.map((evt) => (
                        <div key={evt.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-cyan-300">{evt.acao}</span>
                            <span className="text-xs text-slate-400">
                              {dataHoraBrasileira(evt.criadoEm)}
                            </span>
                          </div>
                          {evt.nomeAutor && (
                            <p className="text-xs text-slate-400 mt-0.5">Por: {evt.nomeAutor}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal de Criação / Edição de Caso */}
        {modalCasoAberto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4">
              <h2 className="text-xl font-bold text-slate-100">
                {casoEmEdicao ? 'Editar Caso' : 'Novo Caso'}
              </h2>

              {erroFormulario && (
                <div className="rounded-lg bg-red-950 p-3 border border-red-800 text-red-200 text-sm">
                  {erroFormulario}
                </div>
              )}

              <form onSubmit={salvarCaso} className="space-y-4">
                <div>
                  <label htmlFor="caso-titulo" className="block text-sm font-semibold text-slate-300 mb-1">
                    Título / Dossiê *
                  </label>
                  <input
                    id="caso-titulo"
                    type="text"
                    required
                    value={formTitulo}
                    onChange={(e) => setFormTitulo(e.target.value)}
                    placeholder="Ex: Ação Revisional de Contrato Bancário"
                    className={CAMPO}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="caso-natureza" className="block text-sm font-semibold text-slate-300 mb-1">
                      Natureza *
                    </label>
                    <select
                      id="caso-natureza"
                      value={formNatureza}
                      onChange={(e) => setFormNatureza(e.target.value as NaturezaCaso)}
                      className={CAMPO}
                    >
                      <option value="JUDICIAL">Judicial</option>
                      <option value="EXTRAJUDICIAL">Extrajudicial</option>
                      <option value="ADMINISTRATIVO">Administrativo</option>
                      <option value="CONSULTIVO">Consultivo</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="caso-area" className="block text-sm font-semibold text-slate-300 mb-1">
                      Área Jurídica *
                    </label>
                    <select
                      id="caso-area"
                      value={formAreaJuridica}
                      onChange={(e) => setFormAreaJuridica(e.target.value)}
                      className={CAMPO}
                    >
                      <option value="CIVEL">Cível</option>
                      <option value="TRABALHISTA">Trabalhista</option>
                      <option value="TRIBUTARIO">Tributário</option>
                      <option value="PREVIDENCIARIO">Previdenciário</option>
                      <option value="EMPRESARIAL">Empresarial</option>
                      <option value="FAMILIA_SUCESSOES">Família e Sucessões</option>
                      <option value="CONSUMIDOR">Consumidor</option>
                      <option value="IMOBILIARIO">Imobiliário</option>
                      <option value="ADMINISTRATIVO">Administrativo</option>
                      <option value="PENAL">Penal</option>
                      <option value="OUTRA">Outra</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="caso-prioridade" className="block text-sm font-semibold text-slate-300 mb-1">
                      Prioridade
                    </label>
                    <select
                      id="caso-prioridade"
                      value={formPrioridade}
                      onChange={(e) => setFormPrioridade(e.target.value as PrioridadeCaso)}
                      className={CAMPO}
                    >
                      <option value="BAIXA">Baixa</option>
                      <option value="MEDIA">Média</option>
                      <option value="ALTA">Alta</option>
                      <option value="URGENTE">Urgente</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="caso-responsavel" className="block text-sm font-semibold text-slate-300 mb-1">
                      Advogado Responsável (RF-047)
                    </label>
                    <select
                      id="caso-responsavel"
                      value={formIdResponsavel}
                      onChange={(e) => setFormIdResponsavel(e.target.value)}
                      className={CAMPO}
                    >
                      <option value="">Sem responsável (Aguardando triagem)</option>
                      {advogadosElegiveis.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome} ({m.papel})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="caso-valor-causa" className="block text-sm font-semibold text-slate-300 mb-1">
                      Valor da Causa (R$)
                    </label>
                    <input
                      id="caso-valor-causa"
                      type="text"
                      placeholder="0,00"
                      value={formValorCausa}
                      onChange={(e) => setFormValorCausa(e.target.value)}
                      className={CAMPO}
                    />
                  </div>

                  <div>
                    <label htmlFor="caso-valor-envolvido" className="block text-sm font-semibold text-slate-300 mb-1">
                      Valor Envolvido (R$)
                    </label>
                    <input
                      id="caso-valor-envolvido"
                      type="text"
                      placeholder="0,00"
                      value={formValorEnvolvido}
                      onChange={(e) => setFormValorEnvolvido(e.target.value)}
                      className={CAMPO}
                    />
                  </div>
                </div>

                {/* Seleção de Clientes (mínimo 1) */}
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-1">
                    Clientes do Escritório (Mínimo 1) *
                  </label>
                  {clientesDisponiveis.length === 0 ? (
                    <p className="text-xs text-amber-400">
                      Nenhum cliente ativo encontrado. Cadastre um cliente antes de criar um caso.
                    </p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-2 space-y-1">
                      {clientesDisponiveis.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm text-slate-200">
                          <input
                            type="checkbox"
                            checked={formClientesSelecionados.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormClientesSelecionados([...formClientesSelecionados, c.id]);
                              } else {
                                setFormClientesSelecionados(
                                  formClientesSelecionados.filter((id) => id !== c.id),
                                );
                              }
                            }}
                          />
                          <span>{c.nome}</span>
                          <span className="text-xs text-slate-500">({c.documento})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="caso-descricao" className="block text-sm font-semibold text-slate-300 mb-1">
                    Descrição / Resumo
                  </label>
                  <textarea
                    id="caso-descricao"
                    rows={3}
                    value={formDescricao}
                    onChange={(e) => setFormDescricao(e.target.value)}
                    placeholder="Descreva o objeto ou detalhes operacionais do caso..."
                    className={CAMPO}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setModalCasoAberto(false)}
                    className={BOTAO_SECUNDARIO}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoCaso}
                    className={BOTAO}
                  >
                    {salvandoCaso ? 'Salvando...' : casoEmEdicao ? 'Atualizar caso' : 'Cadastrar caso'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Adição/Edição de Parte Envolvida */}
        {modalParteAberto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4">
              <h2 className="text-xl font-bold text-slate-100">
                {parteEmEdicao ? 'Editar Parte Envolvida' : 'Adicionar Parte Envolvida'}
              </h2>

              <form onSubmit={salvarParte} className="space-y-3">
                <div>
                  <label htmlFor="parte-tipo" className="block text-sm font-semibold text-slate-300 mb-1">
                    Tipo de Participação *
                  </label>
                  <select
                    id="parte-tipo"
                    value={formParteTipo}
                    onChange={(e) => setFormParteTipo(e.target.value as TipoParticipacao)}
                    className={CAMPO}
                  >
                    <option value="PARTE_CONTRARIA">Parte contrária</option>
                    <option value="ADVOGADO_CONTRARIO">Advogado contrário</option>
                    <option value="TERCEIRO_INTERESSADO">Terceiro interessado</option>
                    <option value="TESTEMUNHA">Testemunha</option>
                    <option value="PERITO">Perito</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="parte-nome" className="block text-sm font-semibold text-slate-300 mb-1">
                    Nome / Razão Social *
                  </label>
                  <input
                    id="parte-nome"
                    type="text"
                    required
                    value={formParteNome}
                    onChange={(e) => setFormParteNome(e.target.value)}
                    placeholder="Nome completo ou empresa"
                    className={CAMPO}
                  />
                </div>

                <div>
                  <label htmlFor="parte-doc" className="block text-sm font-semibold text-slate-300 mb-1">
                    CPF ou CNPJ
                  </label>
                  <input
                    id="parte-doc"
                    type="text"
                    value={formParteDoc}
                    onChange={(e) => setFormParteDoc(e.target.value)}
                    placeholder="Apenas dígitos ou formatado"
                    className={CAMPO}
                  />
                </div>

                <div>
                  <label htmlFor="parte-oab" className="block text-sm font-semibold text-slate-300 mb-1">
                    OAB (quando aplicável)
                  </label>
                  <input
                    id="parte-oab"
                    type="text"
                    value={formParteOab}
                    onChange={(e) => setFormParteOab(e.target.value)}
                    placeholder="Ex: SP-123456"
                    className={CAMPO}
                  />
                </div>

                <div>
                  <label htmlFor="parte-contato" className="block text-sm font-semibold text-slate-300 mb-1">
                    Contato (E-mail / Telefone)
                  </label>
                  <input
                    id="parte-contato"
                    type="text"
                    value={formParteContato}
                    onChange={(e) => setFormParteContato(e.target.value)}
                    placeholder="Telefone ou e-mail de contato"
                    className={CAMPO}
                  />
                </div>

                <div>
                  <label htmlFor="parte-obs" className="block text-sm font-semibold text-slate-300 mb-1">
                    Observações
                  </label>
                  <textarea
                    id="parte-obs"
                    rows={2}
                    value={formParteObs}
                    onChange={(e) => setFormParteObs(e.target.value)}
                    placeholder="Notas adicionais sobre a parte..."
                    className={CAMPO}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setModalParteAberto(false)}
                    className={BOTAO_SECUNDARIO}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoParte}
                    className={BOTAO}
                  >
                    {salvandoParte ? 'Salvando...' : 'Salvar parte'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Pagina>
  );
}

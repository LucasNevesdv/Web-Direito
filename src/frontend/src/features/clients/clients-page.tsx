import { useEffect, useState, type FormEvent } from 'react';
import { dataHoraBrasileira, requisitarApi } from '../../shared/api';
import { useAutenticacao } from '../../shared/auth/auth-context';
import { BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO, Pagina } from '../../shared/ui';

export type TipoPessoa = 'PESSOA_FISICA' | 'PESSOA_JURIDICA';
export type SituacaoCliente = 'ATIVO' | 'INATIVO';

export interface Endereco {
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

export interface ClienteItem {
  id: string;
  tipoPessoa: TipoPessoa;
  nome: string;
  nomeSocial: string | null;
  documento: string;
  email: string | null;
  telefone: string | null;
  situacao: SituacaoCliente;
  idVinculoResponsavel: string | null;
  nomeResponsavel?: string | null;
  versao: number;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ContatoItem {
  id: string;
  nome: string;
  cargoOuRelacao: string | null;
  email: string | null;
  telefone: string | null;
  observacao: string | null;
}

export interface ClienteDetalhe extends ClienteItem {
  endereco: Endereco | null;
  observacoesInternas: string | null;
  contatos: ContatoItem[];
}

export interface EventoLinhaTempo {
  id: string;
  idAutor: string;
  nomeAutor?: string;
  acao: string;
  motivo?: string | null;
  anterior: Record<string, unknown> | null;
  atual: Record<string, unknown>;
  criadoEm: string;
}

export interface IndicioDuplicidade {
  id: string;
  nome: string;
  nomeSocial: string | null;
  tipoPessoa: TipoPessoa;
  documentoMascarado: string;
  email: string | null;
  telefone: string | null;
  situacao: SituacaoCliente;
  motivos: Array<'DOCUMENTO_IDENTICO' | 'NOME_IDENTICO' | 'EMAIL_IDENTICO' | 'TELEFONE_IDENTICO'>;
}

export interface CasoVinculado {
  id: string;
  titulo: string;
  situacao: string;
}

export interface ProcessoVinculado {
  id: string;
  numeroCnj: string;
  tribunal?: string | null;
}

export interface DocumentoVinculado {
  id: string;
  nome: string;
  categoria: string;
  criadoEm: string;
}

export interface TarefaVinculada {
  id: string;
  titulo: string;
  situacao: string;
  prazo?: string | null;
}

export interface CompromissoVinculado {
  id: string;
  descricao: string;
  data: string;
  situacao: string;
}

export interface VinculosCliente {
  casos: CasoVinculado[];
  processos: ProcessoVinculado[];
  documentos: DocumentoVinculado[];
  tarefas: TarefaVinculada[];
  compromissos: CompromissoVinculado[];
}

const ROTULOS_CATEGORIA_DOC: Record<string, string> = {
  CONTRATO: 'Contrato',
  PROCURACAO: 'Procuração',
  PETICAO: 'Petição',
  DECISAO: 'Decisão',
  PROVA: 'Prova',
  DOCUMENTO_PESSOAL: 'Doc. Pessoal',
  COMPROVANTE: 'Comprovante',
  OUTRO: 'Outro',
};

const ROTULOS_SITUACAO_VINCULO: Record<string, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CUMPRIDO: 'Cumprido',
  CANCELADA: 'Cancelada',
  CANCELADO: 'Cancelado',
};

function formatarDataCivil(dataIso: string): string {
  const partes = dataIso.split('-');
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return dataIso;
}

const ROTULOS_ACOES: Record<string, string> = {
  CLIENTE_CRIADO: 'Cliente cadastrado',
  CLIENTE_ATUALIZADO: 'Dados atualizados',
  RESPONSAVEL_ALTERADO: 'Responsável alterado',
  CLIENTE_INATIVADO: 'Cliente inativado',
  CLIENTE_REATIVADO: 'Cliente reativado',
  CONTATO_ADICIONADO: 'Contato adicionado',
  CONTATO_ATUALIZADO: 'Contato atualizado',
  CONTATO_REMOVIDO: 'Contato removido',
};

const FORMULARIO_INICIAL = {
  tipoPessoa: 'PESSOA_FISICA' as TipoPessoa,
  nome: '',
  nomeSocial: '',
  documento: '',
  email: '',
  telefone: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  observacoesInternas: '',
};

function formatarDocumento(doc: string, tipo: TipoPessoa): string {
  const d = doc.replace(/\D/g, '');
  if (tipo === 'PESSOA_FISICA' && d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (tipo === 'PESSOA_JURIDICA' && d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return doc;
}

function renderConteudoVinculos(vinculos: VinculosCliente | null, carregando: boolean, erro: string) {
  if (carregando) {
    return <p className="text-slate-400 text-center py-6">Carregando vínculos do cliente…</p>;
  }
  if (erro) {
    return <p className="rounded-lg bg-rose-950 p-3 text-rose-300 text-sm border border-rose-800">{erro}</p>;
  }
  if (!vinculos) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Documentos (RF-029) */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between">
          <span>Documentos</span>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
            {vinculos.documentos.length}
          </span>
        </h3>
        {vinculos.documentos.length === 0 ? (
          <p className="text-xs text-slate-500 italic bg-slate-950/40 p-3 rounded-lg border border-slate-800">
            Nenhum documento vinculado a este cliente.
          </p>
        ) : (
          <ul className="space-y-2">
            {vinculos.documentos.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/60 text-sm"
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-slate-100">{doc.nome}</p>
                  <p className="text-xs text-slate-400">Criado em {dataHoraBrasileira(doc.criadoEm)}</p>
                </div>
                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {ROTULOS_CATEGORIA_DOC[doc.categoria] ?? doc.categoria}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tarefas (RF-030) */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between">
          <span>Tarefas</span>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
            {vinculos.tarefas.length}
          </span>
        </h3>
        {vinculos.tarefas.length === 0 ? (
          <p className="text-xs text-slate-500 italic bg-slate-950/40 p-3 rounded-lg border border-slate-800">
            Nenhuma tarefa vinculada a este cliente.
          </p>
        ) : (
          <ul className="space-y-2">
            {vinculos.tarefas.map((tar) => (
              <li
                key={tar.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/60 text-sm"
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-slate-100">{tar.titulo}</p>
                  <p className="text-xs text-slate-400">
                    Prazo: {tar.prazo ? formatarDataCivil(tar.prazo) : 'Sem prazo'}
                  </p>
                </div>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    tar.situacao === 'CONCLUIDA'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : tar.situacao === 'EM_ANDAMENTO'
                      ? 'bg-blue-950 text-blue-300 border border-blue-800'
                      : tar.situacao === 'CANCELADA'
                      ? 'bg-slate-800 text-slate-400 border border-slate-700'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}
                >
                  {ROTULOS_SITUACAO_VINCULO[tar.situacao] ?? tar.situacao}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Compromissos e Prazos Judiciais (RF-030) */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between">
          <span>Compromissos e Prazos Judiciais</span>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
            {vinculos.compromissos.length}
          </span>
        </h3>
        {vinculos.compromissos.length === 0 ? (
          <p className="text-xs text-slate-500 italic bg-slate-950/40 p-3 rounded-lg border border-slate-800">
            Nenhum prazo judicial vinculado a este cliente.
          </p>
        ) : (
          <ul className="space-y-2">
            {vinculos.compromissos.map((comp) => (
              <li
                key={comp.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/60 text-sm"
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-slate-100">{comp.descricao}</p>
                  <p className="text-xs text-slate-400">Data limite: {formatarDataCivil(comp.data)}</p>
                </div>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    comp.situacao === 'CUMPRIDO'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : comp.situacao === 'CANCELADO'
                      ? 'bg-slate-800 text-slate-400 border border-slate-700'
                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                  }`}
                >
                  {ROTULOS_SITUACAO_VINCULO[comp.situacao] ?? comp.situacao}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Casos e Processos (RF-030) */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between">
          <span>Casos e Processos</span>
          <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
            {vinculos.casos.length + vinculos.processos.length}
          </span>
        </h3>
        {vinculos.casos.length === 0 && vinculos.processos.length === 0 ? (
          <p className="text-xs text-slate-500 italic bg-slate-950/40 p-3 rounded-lg border border-slate-800">
            Nenhum caso ou processo vinculado a este cliente.
          </p>
        ) : (
          <div className="space-y-2">
            {vinculos.casos.map((caso) => (
              <div
                key={caso.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/60 text-sm"
              >
                <p className="font-medium text-slate-100">{caso.titulo}</p>
                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                  {caso.situacao}
                </span>
              </div>
            ))}
            {vinculos.processos.map((proc) => (
              <div
                key={proc.id}
                className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/60 text-sm"
              >
                <div>
                  <p className="font-mono text-slate-100">{proc.numeroCnj}</p>
                  {proc.tribunal && <p className="text-xs text-slate-400">{proc.tribunal}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function PaginaClientes() {
  const { cliente, identidade } = useAutenticacao();
  const papel = identidade?.escritorio.papel ?? '';
  const podeInativar = papel === 'PROPRIETARIO' || papel === 'ADMINISTRADOR' || papel === 'ADVOGADO';

  const [clientes, definirClientes] = useState<ClienteItem[]>([]);
  const [total, definirTotal] = useState(0);
  const [pagina, definirPagina] = useState(1);
  const [pesquisa, definirPesquisa] = useState('');
  const [filtroSituacao, definirFiltroSituacao] = useState<string>(() => new URLSearchParams(window.location.search).get('situacao') === 'ATIVO' ? 'ATIVO' : '');
  const [vinculoResponsavel, definirVinculoResponsavel] = useState(() => new URLSearchParams(window.location.search).get('idVinculoResponsavel') ?? '');
  const [filtroTipo, definirFiltroTipo] = useState<string>('');
  const [revisao, definirRevisao] = useState(0);
  const [carregando, definirCarregando] = useState(true);
  const [mensagem, definirMensagem] = useState('');
  const [erro, definirErro] = useState('');

  // Modais e formulários
  const [modalAberto, definirModalAberto] = useState(false);
  const [editando, definirEditando] = useState<ClienteDetalhe | null>(null);
  const [form, definirForm] = useState(FORMULARIO_INICIAL);
  const [enviando, definirEnviando] = useState(false);
  const [abaAtivaModal, definirAbaAtivaModal] = useState<'dados' | 'contatos' | 'vinculos'>('dados');

  // Vínculos
  const [vinculosClienteModal, definirVinculosClienteModal] = useState<{ id: string; nome: string } | null>(null);
  const [vinculosDados, definirVinculosDados] = useState<VinculosCliente | null>(null);
  const [carregandoVinculos, definirCarregandoVinculos] = useState(false);
  const [erroVinculos, definirErroVinculos] = useState('');

  // Contatos iniciais no cadastro de novo cliente
  const [contatosIniciais, definirContatosIniciais] = useState<
    Array<{ nome: string; cargoOuRelacao: string; email: string; telefone: string; observacao: string }>
  >([]);
  const [mostrarFormContatoInicial, definirMostrarFormContatoInicial] = useState(false);
  const [formContatoInicial, definirFormContatoInicial] = useState({
    nome: '',
    cargoOuRelacao: '',
    email: '',
    telefone: '',
    observacao: '',
  });
  const [erroContatoInicial, definirErroContatoInicial] = useState('');

  // Gestão de contatos do cliente em edição
  const [modalContatoAberto, definirModalContatoAberto] = useState(false);
  const [editandoContato, definirEditandoContato] = useState<ContatoItem | null>(null);
  const [formContato, definirFormContato] = useState({
    nome: '',
    cargoOuRelacao: '',
    email: '',
    telefone: '',
    observacao: '',
  });
  const [erroContato, definirErroContato] = useState('');
  const [enviandoContato, definirEnviandoContato] = useState(false);
  const [contatoParaExcluir, definirContatoParaExcluir] = useState<ContatoItem | null>(null);

  // Duplicidades
  const [duplicidadesAlerta, definirDuplicidadesAlerta] = useState<IndicioDuplicidade[] | null>(null);
  const [verificandoDuplicidades, definirVerificandoDuplicidades] = useState(false);
  const [mensagemDuplicidadeLimpa, definirMensagemDuplicidadeLimpa] = useState('');

  // Inativação / Reativação
  const [clienteSituacao, definirClienteSituacao] = useState<{ cliente: ClienteItem; novaSituacao: SituacaoCliente } | null>(null);
  const [motivoSituacao, definirMotivoSituacao] = useState('');

  // Linha do tempo
  const [linhaTempoCliente, definirLinhaTempoCliente] = useState<{ id: string; nome: string } | null>(null);
  const [eventosLinhaTempo, definirEventosLinhaTempo] = useState<EventoLinhaTempo[]>([]);
  const [carregandoLinhaTempo, definirCarregandoLinhaTempo] = useState(false);

  // Carregar lista de clientes
  useEffect(() => {
    const controle = new AbortController();
    definirCarregando(true);
    definirErro('');

    const parametros = new URLSearchParams({
      pagina: String(pagina),
      tamanhoPagina: '10',
      pesquisa: pesquisa.trim(),
    });
    if (filtroSituacao) parametros.set('situacao', filtroSituacao);
    if (filtroTipo) parametros.set('tipoPessoa', filtroTipo);
    if (vinculoResponsavel) parametros.set('idVinculoResponsavel', vinculoResponsavel);

    void requisitarApi<{ clientes: ClienteItem[]; total: number }>(
      cliente,
      `/api/v1/clientes?${parametros.toString()}`,
      { signal: controle.signal },
    )
      .then((resposta) => {
        if (controle.signal.aborted) return;
        if (resposta.ok) {
          definirClientes(resposta.dados.clientes);
          definirTotal(resposta.dados.total);
        } else {
          definirErro(resposta.mensagem);
        }
      })
      .catch(() => {
        if (!controle.signal.aborted) definirErro('Não foi possível carregar os clientes.');
      })
      .finally(() => {
        if (!controle.signal.aborted) definirCarregando(false);
      });

    return () => controle.abort();
  }, [cliente, pagina, pesquisa, filtroSituacao, filtroTipo, revisao, vinculoResponsavel]);

  function abrirNovo() {
    definirEditando(null);
    definirForm(FORMULARIO_INICIAL);
    definirContatosIniciais([]);
    definirMostrarFormContatoInicial(false);
    definirAbaAtivaModal('dados');
    definirVinculosDados(null);
    definirErroVinculos('');
    definirDuplicidadesAlerta(null);
    definirMensagemDuplicidadeLimpa('');
    definirErro('');
    definirModalAberto(true);
  }

  async function abrirEdicao(item: ClienteItem) {
    definirErro('');
    definirDuplicidadesAlerta(null);
    definirMensagemDuplicidadeLimpa('');
    definirAbaAtivaModal('dados');
    definirVinculosDados(null);
    definirErroVinculos('');
    const resposta = await requisitarApi<ClienteDetalhe>(cliente, `/api/v1/clientes/${item.id}`);
    if (!resposta.ok) {
      definirErro(resposta.mensagem);
      return;
    }
    const det = resposta.dados;
    definirEditando(det);
    definirForm({
      tipoPessoa: det.tipoPessoa,
      nome: det.nome,
      nomeSocial: det.nomeSocial ?? '',
      documento: det.documento,
      email: det.email ?? '',
      telefone: det.telefone ?? '',
      cep: det.endereco?.cep ?? '',
      logradouro: det.endereco?.logradouro ?? '',
      numero: det.endereco?.numero ?? '',
      complemento: det.endereco?.complemento ?? '',
      bairro: det.endereco?.bairro ?? '',
      cidade: det.endereco?.cidade ?? '',
      uf: det.endereco?.uf ?? '',
      observacoesInternas: det.observacoesInternas ?? '',
    });
    definirModalAberto(true);
  }

  async function checarDuplicidadesFormulario() {
    if (!form.documento.trim() && !form.nome.trim()) {
      return;
    }
    definirVerificandoDuplicidades(true);
    definirMensagemDuplicidadeLimpa('');
    try {
      const resp = await requisitarApi<{ duplicidades: IndicioDuplicidade[] }>(
        cliente,
        '/api/v1/clientes/verificar-duplicidades',
        {
          method: 'POST',
          json: {
            tipoPessoa: form.tipoPessoa,
            documento: form.documento.trim(),
            nome: form.nome.trim(),
            email: form.email.trim() || null,
            telefone: form.telefone.trim() || null,
            ignorarIdCliente: editando?.id ?? null,
          },
        },
      );
      if (resp.ok) {
        if (resp.dados.duplicidades.length > 0) {
          definirDuplicidadesAlerta(resp.dados.duplicidades);
        } else {
          definirDuplicidadesAlerta(null);
          definirMensagemDuplicidadeLimpa('Nenhuma duplicidade encontrada no escritório.');
          setTimeout(() => definirMensagemDuplicidadeLimpa(''), 3000);
        }
      }
    } finally {
      definirVerificandoDuplicidades(false);
    }
  }

  function adicionarContatoInicial() {
    definirErroContatoInicial('');
    if (formContatoInicial.nome.trim().length < 2) {
      definirErroContatoInicial('O nome do contato deve ter pelo menos 2 caracteres.');
      return;
    }
    if (!formContatoInicial.email.trim() && !formContatoInicial.telefone.trim()) {
      definirErroContatoInicial('Informe ao menos um e-mail ou telefone para o contato.');
      return;
    }
    definirContatosIniciais((prev) => [...prev, { ...formContatoInicial }]);
    definirFormContatoInicial({ nome: '', cargoOuRelacao: '', email: '', telefone: '', observacao: '' });
    definirMostrarFormContatoInicial(false);
  }

  function removerContatoInicial(indice: number) {
    definirContatosIniciais((prev) => prev.filter((_, i) => i !== indice));
  }

  function abrirNovoContato() {
    definirEditandoContato(null);
    definirFormContato({ nome: '', cargoOuRelacao: '', email: '', telefone: '', observacao: '' });
    definirErroContato('');
    definirModalContatoAberto(true);
  }

  function abrirEdicaoContato(contato: ContatoItem) {
    definirEditandoContato(contato);
    definirFormContato({
      nome: contato.nome,
      cargoOuRelacao: contato.cargoOuRelacao ?? '',
      email: contato.email ?? '',
      telefone: contato.telefone ?? '',
      observacao: contato.observacao ?? '',
    });
    definirErroContato('');
    definirModalContatoAberto(true);
  }

  async function salvarContato() {
    if (!editando) return;
    if (formContato.nome.trim().length < 2) {
      definirErroContato('O nome do contato deve ter pelo menos 2 caracteres.');
      return;
    }
    if (!formContato.email.trim() && !formContato.telefone.trim()) {
      definirErroContato('Informe ao menos um e-mail ou telefone para o contato.');
      return;
    }

    definirEnviandoContato(true);
    definirErroContato('');

    const corpo = {
      nome: formContato.nome.trim(),
      cargoOuRelacao: formContato.cargoOuRelacao.trim() || null,
      email: formContato.email.trim() || null,
      telefone: formContato.telefone.trim() || null,
      observacao: formContato.observacao.trim() || null,
    };

    try {
      if (editandoContato?.id) {
        const resp = await requisitarApi(
          cliente,
          `/api/v1/clientes/${editando.id}/contatos/${editandoContato.id}`,
          {
            method: 'PATCH',
            json: corpo,
          },
        );
        if (!resp.ok) {
          definirErroContato(resp.mensagem);
          return;
        }
        definirMensagem('Contato atualizado com sucesso.');
      } else {
        const resp = await requisitarApi(
          cliente,
          `/api/v1/clientes/${editando.id}/contatos`,
          {
            method: 'POST',
            json: corpo,
          },
        );
        if (!resp.ok) {
          definirErroContato(resp.mensagem);
          return;
        }
        definirMensagem('Contato adicionado com sucesso.');
      }

      const respDetalhe = await requisitarApi<ClienteDetalhe>(cliente, `/api/v1/clientes/${editando.id}`);
      if (respDetalhe.ok) {
        definirEditando(respDetalhe.dados);
      }
      definirModalContatoAberto(false);
    } finally {
      definirEnviandoContato(false);
    }
  }

  async function confirmarExclusaoContato() {
    if (!editando || !contatoParaExcluir?.id) return;
    definirEnviandoContato(true);
    try {
      const resp = await requisitarApi(
        cliente,
        `/api/v1/clientes/${editando.id}/contatos/${contatoParaExcluir.id}`,
        {
          method: 'DELETE',
        },
      );
      if (!resp.ok) {
        definirErro(resp.mensagem);
        return;
      }
      definirMensagem('Contato removido com sucesso.');
      definirContatoParaExcluir(null);

      const respDetalhe = await requisitarApi<ClienteDetalhe>(cliente, `/api/v1/clientes/${editando.id}`);
      if (respDetalhe.ok) {
        definirEditando(respDetalhe.dados);
      }
    } finally {
      definirEnviandoContato(false);
    }
  }

  async function carregarVinculos(idCliente: string) {
    definirCarregandoVinculos(true);
    definirErroVinculos('');
    try {
      const resposta = await requisitarApi<VinculosCliente>(cliente, `/api/v1/clientes/${idCliente}/vinculos`);
      if (resposta.ok) {
        definirVinculosDados(resposta.dados);
      } else {
        definirErroVinculos(resposta.mensagem || 'Não foi possível carregar os vínculos.');
      }
    } catch {
      definirErroVinculos('Não foi possível carregar os vínculos.');
    } finally {
      definirCarregandoVinculos(false);
    }
  }

  async function abrirVinculos(item: ClienteItem) {
    definirVinculosClienteModal({ id: item.id, nome: item.nome });
    definirVinculosDados(null);
    await carregarVinculos(item.id);
  }

  async function abrirLinhaTempo(item: ClienteItem) {
    definirLinhaTempoCliente({ id: item.id, nome: item.nome });
    definirCarregandoLinhaTempo(true);
    definirEventosLinhaTempo([]);
    const resposta = await requisitarApi<EventoLinhaTempo[]>(cliente, `/api/v1/clientes/${item.id}/linha-do-tempo`);
    definirCarregandoLinhaTempo(false);
    if (resposta.ok) {
      definirEventosLinhaTempo(resposta.dados);
    } else {
      definirErro(resposta.mensagem);
    }
  }

  async function salvar(confirmarDuplicidade = false) {
    definirEnviando(true);
    definirErro('');

    const endereco =
      form.cep || form.logradouro || form.numero || form.complemento || form.bairro || form.cidade || form.uf
        ? {
            cep: form.cep.trim() || null,
            logradouro: form.logradouro.trim() || null,
            numero: form.numero.trim() || null,
            complemento: form.complemento.trim() || null,
            bairro: form.bairro.trim() || null,
            cidade: form.cidade.trim() || null,
            uf: form.uf.trim() || null,
          }
        : null;

    try {
      if (editando) {
        const corpo = {
          nome: form.nome.trim(),
          nomeSocial: form.nomeSocial.trim() || null,
          documento: form.documento.trim(),
          email: form.email.trim() || null,
          telefone: form.telefone.trim() || null,
          endereco,
          observacoesInternas: form.observacoesInternas.trim() || null,
          versao: editando.versao,
        };
        const resposta = await requisitarApi<ClienteDetalhe>(cliente, `/api/v1/clientes/${editando.id}`, {
          method: 'PATCH',
          json: corpo,
        });
        if (!resposta.ok) {
          definirErro(resposta.mensagem);
          return;
        }
        definirMensagem('Cliente atualizado com sucesso.');
        definirModalAberto(false);
        definirRevisao((r) => r + 1);
      } else {
        const contatosFormatados = contatosIniciais.map((c) => ({
          nome: c.nome.trim(),
          cargoOuRelacao: c.cargoOuRelacao.trim() || null,
          email: c.email.trim() || null,
          telefone: c.telefone.trim() || null,
          observacao: c.observacao.trim() || null,
        }));

        const corpo = {
          tipoPessoa: form.tipoPessoa,
          nome: form.nome.trim(),
          nomeSocial: form.nomeSocial.trim() || null,
          documento: form.documento.trim(),
          email: form.email.trim() || null,
          telefone: form.telefone.trim() || null,
          endereco,
          observacoesInternas: form.observacoesInternas.trim() || null,
          contatosIniciais: contatosFormatados.length > 0 ? contatosFormatados : undefined,
          confirmarDuplicidadePotencial: confirmarDuplicidade,
        };
        const resposta = await requisitarApi<ClienteDetalhe>(cliente, '/api/v1/clientes', {
          method: 'POST',
          json: corpo,
        });

        if (resposta.status === 409 && (resposta.dados as unknown as { erro?: string })?.erro === 'POSSIVEL_DUPLICIDADE') {
          definirDuplicidadesAlerta((resposta.dados as unknown as { duplicidades: IndicioDuplicidade[] }).duplicidades);
          return;
        }

        if (!resposta.ok) {
          definirErro(resposta.mensagem);
          return;
        }

        definirMensagem('Cliente cadastrado com sucesso.');
        definirModalAberto(false);
        definirRevisao((r) => r + 1);
      }
    } finally {
      definirEnviando(false);
    }
  }

  async function confirmarAlteracaoSituacao() {
    if (!clienteSituacao) return;
    definirEnviando(true);
    definirErro('');

    const { cliente: c, novaSituacao } = clienteSituacao;
    const acao = novaSituacao === 'ATIVO' ? 'ativar' : 'inativar';

    const resposta = await requisitarApi(cliente, `/api/v1/clientes/${c.id}/${acao}`, {
      method: 'POST',
      json: {
        versao: c.versao,
        motivo: motivoSituacao.trim() || null,
      },
    });

    definirEnviando(false);
    if (!resposta.ok) {
      definirErro(resposta.mensagem);
      return;
    }

    definirMensagem(`Cliente ${novaSituacao === 'ATIVO' ? 'reativado' : 'inativado'} com sucesso.`);
    definirClienteSituacao(null);
    definirMotivoSituacao('');
    definirRevisao((r) => r + 1);
  }

  const rotuloNome = form.tipoPessoa === 'PESSOA_FISICA' ? 'Nome completo *' : 'Razão social *';
  const rotuloNomeSocial = form.tipoPessoa === 'PESSOA_FISICA' ? 'Nome social (opcional)' : 'Nome fantasia (opcional)';
  const rotuloDocumento = form.tipoPessoa === 'PESSOA_FISICA' ? 'CPF *' : 'CNPJ *';

  return (
    <Pagina caminho="/clientes" titulo="Gestão de Clientes">
      {vinculoResponsavel && <p>Responsável selecionado no painel. <button className="text-cyan-300 underline" onClick={() => { definirPagina(1); definirVinculoResponsavel(''); }}>Mostrar todos os responsáveis</button></p>}
      {mensagem && (
        <p role="status" className="rounded-lg bg-emerald-950 p-3 text-emerald-300 border border-emerald-800">
          {mensagem}
        </p>
      )}
      {erro && (
        <p role="alert" className="rounded-lg bg-rose-950 p-3 text-rose-300 border border-rose-800">
          {erro}
        </p>
      )}

      {/* Barra de filtros e pesquisa */}
      <section className="grid gap-3 md:grid-cols-5 items-end">
        <label className="md:col-span-2">
          <span className="text-sm font-medium text-slate-300">Pesquisar</span>
          <input
            className={CAMPO}
            placeholder="Nome, CPF/CNPJ, e-mail ou telefone..."
            value={pesquisa}
            onChange={(e) => {
              definirPagina(1);
              definirPesquisa(e.target.value);
            }}
          />
        </label>

        <label>
          <span className="text-sm font-medium text-slate-300">Tipo</span>
          <select
            className={CAMPO}
            value={filtroTipo}
            onChange={(e) => {
              definirPagina(1);
              definirFiltroTipo(e.target.value);
            }}
          >
            <option value="">Todos</option>
            <option value="PESSOA_FISICA">Pessoa Física</option>
            <option value="PESSOA_JURIDICA">Pessoa Jurídica</option>
          </select>
        </label>

        <label>
          <span className="text-sm font-medium text-slate-300">Situação</span>
          <select
            className={CAMPO}
            value={filtroSituacao}
            onChange={(e) => {
              definirPagina(1);
              definirFiltroSituacao(e.target.value);
            }}
          >
            <option value="">Todas</option>
            <option value="ATIVO">Ativos</option>
            <option value="INATIVO">Inativos</option>
          </select>
        </label>

        <div className="flex justify-end">
          <button type="button" className={BOTAO} onClick={abrirNovo}>
            Novo cliente
          </button>
        </div>
      </section>

      {/* Tabela de clientes */}
      <section className={CARTAO}>
        {carregando ? (
          <p className="text-slate-400 py-6 text-center">Carregando clientes…</p>
        ) : clientes.length === 0 ? (
          <p className="text-slate-400 py-6 text-center">Nenhum cliente encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-700 text-slate-400 uppercase text-xs">
                <tr>
                  <th className="pb-3">Nome / Razão Social</th>
                  <th className="pb-3">Documento</th>
                  <th className="pb-3">Contato</th>
                  <th className="pb-3">Situação</th>
                  <th className="pb-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {clientes.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-slate-100">{c.nome}</div>
                      {c.nomeSocial && <div className="text-xs text-slate-400">{c.nomeSocial}</div>}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-slate-300 font-mono text-xs">
                      {formatarDocumento(c.documento, c.tipoPessoa)}
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-300">
                      {c.email && <div>{c.email}</div>}
                      {c.telefone && <div>{c.telefone}</div>}
                      {!c.email && !c.telefone && <span className="text-slate-500">—</span>}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          c.situacao === 'ATIVO'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {c.situacao === 'ATIVO' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        className={BOTAO_SECUNDARIO}
                        onClick={() => void abrirEdicao(c)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={BOTAO_SECUNDARIO}
                        onClick={() => void abrirVinculos(c)}
                      >
                        Vínculos
                      </button>
                      <button
                        type="button"
                        className={BOTAO_SECUNDARIO}
                        onClick={() => void abrirLinhaTempo(c)}
                      >
                        Histórico
                      </button>
                      {podeInativar && (
                        <button
                          type="button"
                          className={BOTAO_SECUNDARIO}
                          onClick={() =>
                            definirClienteSituacao({
                              cliente: c,
                              novaSituacao: c.situacao === 'ATIVO' ? 'INATIVO' : 'ATIVO',
                            })
                          }
                        >
                          {c.situacao === 'ATIVO' ? 'Inativar' : 'Reativar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {total > 10 && (
          <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4 text-sm text-slate-400">
            <span>
              Total: {total} {total === 1 ? 'cliente' : 'clientes'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className={BOTAO_SECUNDARIO}
                disabled={pagina <= 1}
                onClick={() => definirPagina((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span className="self-center px-2">Página {pagina}</span>
              <button
                type="button"
                className={BOTAO_SECUNDARIO}
                disabled={pagina * 10 >= total}
                onClick={() => definirPagina((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Modal de Cadastro / Edição */}
      {modalAberto && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-slate-100">
              {editando ? 'Editar Cliente' : 'Novo Cliente'}
            </h2>

            {/* Abas no modo de edição */}
            {editando && (
              <div className="flex border-b border-slate-800 gap-4">
                <button
                  type="button"
                  className={`pb-2 text-sm font-medium border-b-2 transition ${
                    abaAtivaModal === 'dados'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => definirAbaAtivaModal('dados')}
                >
                  Dados Gerais
                </button>
                <button
                  type="button"
                  className={`pb-2 text-sm font-medium border-b-2 transition ${
                    abaAtivaModal === 'contatos'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => definirAbaAtivaModal('contatos')}
                >
                  Contatos Relacionados ({editando.contatos.length})
                </button>
                <button
                  type="button"
                  className={`pb-2 text-sm font-medium border-b-2 transition ${
                    abaAtivaModal === 'vinculos'
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                  onClick={() => {
                    definirAbaAtivaModal('vinculos');
                    void carregarVinculos(editando.id);
                  }}
                >
                  Vínculos
                </button>
              </div>
            )}

            {/* Alerta de Possível Duplicidade */}
            {duplicidadesAlerta && duplicidadesAlerta.length > 0 && (
              <div className="rounded-xl border border-amber-600 bg-amber-950/60 p-4 space-y-3">
                <p className="font-semibold text-amber-200">
                  Atenção: Foram encontrados clientes semelhantes neste escritório:
                </p>
                <ul className="text-sm text-amber-300 list-disc pl-5 space-y-1">
                  {duplicidadesAlerta.map((dup) => (
                    <li key={dup.id}>
                      <strong>{dup.nome}</strong> ({dup.documentoMascarado}) — Motivo(s):{' '}
                      {dup.motivos.join(', ')}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    className={BOTAO}
                    onClick={() => void salvar(true)}
                    disabled={enviando}
                  >
                    Confirmar cadastro mesmo assim
                  </button>
                  <button
                    type="button"
                    className={BOTAO_SECUNDARIO}
                    onClick={() => definirDuplicidadesAlerta(null)}
                  >
                    Voltar e revisar dados
                  </button>
                </div>
              </div>
            )}

            {editando && abaAtivaModal === 'contatos' ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase">
                    Contatos Vinculados ({editando.contatos.length})
                  </h3>
                  <button
                    type="button"
                    className={BOTAO}
                    onClick={abrirNovoContato}
                  >
                    + Novo contato
                  </button>
                </div>

                {editando.contatos.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">
                    Nenhum contato vinculado a este cliente.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {editando.contatos.map((contato) => (
                      <div
                        key={contato.id}
                        className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-100">{contato.nome}</span>
                            {contato.cargoOuRelacao && (
                              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                                {contato.cargoOuRelacao}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-300 space-x-3">
                            {contato.email && <span>{contato.email}</span>}
                            {contato.telefone && <span>{contato.telefone}</span>}
                          </div>
                          {contato.observacao && (
                            <p className="text-xs text-slate-400 italic">{contato.observacao}</p>
                          )}
                        </div>
                        <div className="flex gap-2 self-end sm:self-center">
                          <button
                            type="button"
                            className={BOTAO_SECUNDARIO}
                            onClick={() => abrirEdicaoContato(contato)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className={BOTAO_SECUNDARIO}
                            onClick={() => definirContatoParaExcluir(contato)}
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    className={BOTAO_SECUNDARIO}
                    onClick={() => definirModalAberto(false)}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : editando && abaAtivaModal === 'vinculos' ? (
              <div className="space-y-4">
                {renderConteudoVinculos(vinculosDados, carregandoVinculos, erroVinculos)}
                <div className="flex justify-end pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    className={BOTAO_SECUNDARIO}
                    onClick={() => definirModalAberto(false)}
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault();
                  void salvar(false);
                }}
              >
                {!editando && (
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="radio"
                        name="tipoPessoa"
                        value="PESSOA_FISICA"
                        checked={form.tipoPessoa === 'PESSOA_FISICA'}
                        onChange={() => definirForm({ ...form, tipoPessoa: 'PESSOA_FISICA' })}
                      />
                      Pessoa Física (PF)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="radio"
                        name="tipoPessoa"
                        value="PESSOA_JURIDICA"
                        checked={form.tipoPessoa === 'PESSOA_JURIDICA'}
                        onChange={() => definirForm({ ...form, tipoPessoa: 'PESSOA_JURIDICA' })}
                      />
                      Pessoa Jurídica (PJ)
                    </label>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className="text-xs font-semibold text-slate-300 uppercase">{rotuloNome}</span>
                    <input
                      className={CAMPO}
                      required
                      value={form.nome}
                      onChange={(e) => definirForm({ ...form, nome: e.target.value })}
                    />
                  </label>

                  <label>
                    <span className="text-xs font-semibold text-slate-300 uppercase">{rotuloNomeSocial}</span>
                    <input
                      className={CAMPO}
                      value={form.nomeSocial}
                      onChange={(e) => definirForm({ ...form, nomeSocial: e.target.value })}
                    />
                  </label>

                  <label>
                    <span className="text-xs font-semibold text-slate-300 uppercase">{rotuloDocumento}</span>
                    <input
                      className={CAMPO}
                      required
                      placeholder={form.tipoPessoa === 'PESSOA_FISICA' ? '000.000.000-00' : '00.000.000/0000-00'}
                      value={form.documento}
                      onChange={(e) => definirForm({ ...form, documento: e.target.value })}
                    />
                  </label>

                  <label>
                    <span className="text-xs font-semibold text-slate-300 uppercase">E-mail</span>
                    <input
                      type="email"
                      className={CAMPO}
                      value={form.email}
                      onChange={(e) => definirForm({ ...form, email: e.target.value })}
                    />
                  </label>

                  <label>
                    <span className="text-xs font-semibold text-slate-300 uppercase">Telefone</span>
                    <input
                      className={CAMPO}
                      value={form.telefone}
                      onChange={(e) => definirForm({ ...form, telefone: e.target.value })}
                    />
                  </label>

                  <div className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      className={BOTAO_SECUNDARIO}
                      onClick={() => void checarDuplicidadesFormulario()}
                      disabled={verificandoDuplicidades}
                    >
                      {verificandoDuplicidades ? 'Verificando…' : 'Verificar duplicidades'}
                    </button>
                    {mensagemDuplicidadeLimpa && (
                      <span className="text-xs text-emerald-400 font-medium">
                        {mensagemDuplicidadeLimpa}
                      </span>
                    )}
                  </div>
                </div>

                {/* Endereço */}
                <div className="border-t border-slate-800 pt-3 space-y-2">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase">Endereço</h3>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label>
                      <span className="text-xs text-slate-400">CEP</span>
                      <input
                        className={CAMPO}
                        placeholder="00000-000"
                        value={form.cep}
                        onChange={(e) => definirForm({ ...form, cep: e.target.value })}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs text-slate-400">Logradouro</span>
                      <input
                        className={CAMPO}
                        value={form.logradouro}
                        onChange={(e) => definirForm({ ...form, logradouro: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className="text-xs text-slate-400">Número</span>
                      <input
                        className={CAMPO}
                        value={form.numero}
                        onChange={(e) => definirForm({ ...form, numero: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className="text-xs text-slate-400">Complemento</span>
                      <input
                        className={CAMPO}
                        value={form.complemento}
                        onChange={(e) => definirForm({ ...form, complemento: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className="text-xs text-slate-400">Bairro</span>
                      <input
                        className={CAMPO}
                        value={form.bairro}
                        onChange={(e) => definirForm({ ...form, bairro: e.target.value })}
                      />
                    </label>
                    <label className="sm:col-span-2">
                      <span className="text-xs text-slate-400">Cidade</span>
                      <input
                        className={CAMPO}
                        value={form.cidade}
                        onChange={(e) => definirForm({ ...form, cidade: e.target.value })}
                      />
                    </label>
                    <label>
                      <span className="text-xs text-slate-400">UF</span>
                      <input
                        className={CAMPO}
                        maxLength={2}
                        placeholder="SP"
                        value={form.uf}
                        onChange={(e) => definirForm({ ...form, uf: e.target.value.toUpperCase() })}
                      />
                    </label>
                  </div>
                </div>

                {/* Observações Internas */}
                <div className="border-t border-slate-800 pt-3">
                  <label>
                    <span className="text-xs font-semibold text-slate-300 uppercase">Observações Internas</span>
                    <textarea
                      rows={3}
                      className={CAMPO}
                      placeholder="Anotações internas confidenciais sobre o cliente..."
                      value={form.observacoesInternas}
                      onChange={(e) => definirForm({ ...form, observacoesInternas: e.target.value })}
                    />
                  </label>
                </div>

                {/* Contatos Iniciais no Cadastro */}
                {!editando && (
                  <div className="border-t border-slate-800 pt-3 space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-semibold text-slate-300 uppercase">
                        Contatos Iniciais (opcional)
                      </h3>
                      {!mostrarFormContatoInicial && (
                        <button
                          type="button"
                          className={BOTAO_SECUNDARIO}
                          onClick={() => definirMostrarFormContatoInicial(true)}
                        >
                          + Adicionar contato inicial
                        </button>
                      )}
                    </div>

                    {contatosIniciais.length > 0 && (
                      <ul className="space-y-2">
                        {contatosIniciais.map((c, idx) => (
                          <li
                            key={idx}
                            className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/30 p-2 text-xs text-slate-200"
                          >
                            <div>
                              <strong>{c.nome}</strong>
                              {c.cargoOuRelacao ? ` (${c.cargoOuRelacao})` : ''} —{' '}
                              {c.email || ''} {c.telefone ? `• ${c.telefone}` : ''}
                            </div>
                            <button
                              type="button"
                              className="text-rose-400 hover:text-rose-300 font-bold px-2 py-1"
                              onClick={() => removerContatoInicial(idx)}
                            >
                              Remover
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}

                    {mostrarFormContatoInicial && (
                      <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 space-y-3">
                        <h4 className="text-xs font-bold text-slate-200 uppercase">Novo Contato Inicial</h4>
                        {erroContatoInicial && (
                          <p className="text-xs text-rose-300 bg-rose-950/80 p-2 rounded border border-rose-800">
                            {erroContatoInicial}
                          </p>
                        )}
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="sm:col-span-2">
                            <span className="text-xs text-slate-400">Nome do contato *</span>
                            <input
                              className={CAMPO}
                              value={formContatoInicial.nome}
                              onChange={(e) =>
                                definirFormContatoInicial({ ...formContatoInicial, nome: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            <span className="text-xs text-slate-400">Cargo ou Relação</span>
                            <input
                              className={CAMPO}
                              value={formContatoInicial.cargoOuRelacao}
                              onChange={(e) =>
                                definirFormContatoInicial({
                                  ...formContatoInicial,
                                  cargoOuRelacao: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            <span className="text-xs text-slate-400">E-mail</span>
                            <input
                              type="email"
                              className={CAMPO}
                              value={formContatoInicial.email}
                              onChange={(e) =>
                                definirFormContatoInicial({ ...formContatoInicial, email: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            <span className="text-xs text-slate-400">Telefone</span>
                            <input
                              className={CAMPO}
                              value={formContatoInicial.telefone}
                              onChange={(e) =>
                                definirFormContatoInicial({
                                  ...formContatoInicial,
                                  telefone: e.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="sm:col-span-2">
                            <span className="text-xs text-slate-400">Observação</span>
                            <input
                              className={CAMPO}
                              value={formContatoInicial.observacao}
                              onChange={(e) =>
                                definirFormContatoInicial({
                                  ...formContatoInicial,
                                  observacao: e.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <button
                            type="button"
                            className={BOTAO_SECUNDARIO}
                            onClick={() => {
                              definirMostrarFormContatoInicial(false);
                              definirErroContatoInicial('');
                            }}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className={BOTAO}
                            onClick={adicionarContatoInicial}
                          >
                            Adicionar à lista
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    className={BOTAO_SECUNDARIO}
                    onClick={() => definirModalAberto(false)}
                    disabled={enviando}
                  >
                    Cancelar
                  </button>
                  <button type="submit" className={BOTAO} disabled={enviando}>
                    {enviando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar cliente'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Sub-modal de Adicionar / Editar Contato */}
      {modalContatoAberto && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700 p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-100">
              {editandoContato ? 'Editar Contato' : 'Novo Contato Relacionado'}
            </h3>
            {erroContato && (
              <p role="alert" className="rounded-lg bg-rose-950 p-3 text-rose-300 border border-rose-800 text-sm">
                {erroContato}
              </p>
            )}
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void salvarContato();
              }}
            >
              <label>
                <span className="text-xs font-semibold text-slate-300 uppercase">Nome *</span>
                <input
                  className={CAMPO}
                  required
                  placeholder="Nome completo do contato"
                  value={formContato.nome}
                  onChange={(e) => definirFormContato({ ...formContato, nome: e.target.value })}
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-slate-300 uppercase">Cargo ou Relação</span>
                <input
                  className={CAMPO}
                  placeholder="Ex.: Sócio Administrador, Cônjuge, Financeiro..."
                  value={formContato.cargoOuRelacao}
                  onChange={(e) => definirFormContato({ ...formContato, cargoOuRelacao: e.target.value })}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-xs font-semibold text-slate-300 uppercase">E-mail</span>
                  <input
                    type="email"
                    className={CAMPO}
                    placeholder="email@exemplo.com"
                    value={formContato.email}
                    onChange={(e) => definirFormContato({ ...formContato, email: e.target.value })}
                  />
                </label>
                <label>
                  <span className="text-xs font-semibold text-slate-300 uppercase">Telefone</span>
                  <input
                    className={CAMPO}
                    placeholder="(11) 98888-7777"
                    value={formContato.telefone}
                    onChange={(e) => definirFormContato({ ...formContato, telefone: e.target.value })}
                  />
                </label>
              </div>
              <p className="text-xs text-slate-400">Informe ao menos um meio de contato (e-mail ou telefone).</p>
              <label>
                <span className="text-xs font-semibold text-slate-300 uppercase">Observação</span>
                <textarea
                  rows={2}
                  className={CAMPO}
                  placeholder="Informações adicionais sobre este contato..."
                  value={formContato.observacao}
                  onChange={(e) => definirFormContato({ ...formContato, observacao: e.target.value })}
                />
              </label>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  className={BOTAO_SECUNDARIO}
                  onClick={() => definirModalContatoAberto(false)}
                  disabled={enviandoContato}
                >
                  Cancelar
                </button>
                <button type="submit" className={BOTAO} disabled={enviandoContato}>
                  {enviandoContato ? 'Salvando…' : editandoContato ? 'Salvar contato' : 'Adicionar contato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmação de Exclusão de Contato */}
      {contatoParaExcluir && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-100">Excluir Contato</h3>
            <p className="text-sm text-slate-300">
              Tem certeza que deseja remover o contato <strong>{contatoParaExcluir.nome}</strong> deste cliente?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className={BOTAO_SECUNDARIO}
                onClick={() => definirContatoParaExcluir(null)}
                disabled={enviandoContato}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={BOTAO}
                onClick={() => void confirmarExclusaoContato()}
                disabled={enviandoContato}
              >
                {enviandoContato ? 'Removendo…' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Inativação / Reativação */}
      {clienteSituacao && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-100">
              {clienteSituacao.novaSituacao === 'ATIVO' ? 'Reativar Cliente' : 'Inativar Cliente'}
            </h2>
            <p className="text-sm text-slate-300">
              Tem certeza que deseja {clienteSituacao.novaSituacao === 'ATIVO' ? 'reativar' : 'inativar'} o cliente{' '}
              <strong>{clienteSituacao.cliente.nome}</strong>?
            </p>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-400">Motivo (opcional):</span>
              <input
                className={CAMPO}
                placeholder="Ex.: Encerramento de contrato, cliente solicitou..."
                value={motivoSituacao}
                onChange={(e) => definirMotivoSituacao(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className={BOTAO_SECUNDARIO}
                onClick={() => {
                  definirClienteSituacao(null);
                  definirMotivoSituacao('');
                }}
                disabled={enviando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={BOTAO}
                onClick={() => void confirmarAlteracaoSituacao()}
                disabled={enviando}
              >
                {enviando ? 'Processando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Gaveta de Linha do Tempo */}
      {linhaTempoCliente && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-700 p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-100">Linha do Tempo</h2>
                <p className="text-xs text-slate-400">{linhaTempoCliente.nome}</p>
              </div>
              <button
                type="button"
                className={BOTAO_SECUNDARIO}
                onClick={() => definirLinhaTempoCliente(null)}
              >
                Fechar
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pr-1">
              {carregandoLinhaTempo ? (
                <p className="text-slate-400 text-center py-6">Carregando histórico…</p>
              ) : eventosLinhaTempo.length === 0 ? (
                <p className="text-slate-400 text-center py-6">Nenhum evento registrado.</p>
              ) : (
                <ol className="relative border-l border-slate-700 ml-3 space-y-6">
                  {eventosLinhaTempo.map((ev) => (
                    <li key={ev.id} className="ml-6">
                      <span className="absolute -left-2.5 flex items-center justify-center w-5 h-5 bg-cyan-950 border border-cyan-400 rounded-full">
                        <span className="w-2 h-2 bg-cyan-300 rounded-full" />
                      </span>
                      <div className="text-sm font-semibold text-slate-100">
                        {ROTULOS_ACOES[ev.acao] ?? ev.acao}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {dataHoraBrasileira(ev.criadoEm)}
                        {ev.nomeAutor ? ` por ${ev.nomeAutor}` : ''}
                      </div>
                      {ev.motivo && (
                        <div className="text-xs text-slate-300 mt-1 bg-slate-800/60 p-2 rounded border border-slate-700">
                          Motivo: {ev.motivo}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Vínculos do Cliente (RF-029 / RF-030) */}
      {vinculosClienteModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700 p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-100">Vínculos do Cliente</h2>
                <p className="text-xs text-slate-400">{vinculosClienteModal.nome}</p>
              </div>
              <button
                type="button"
                className={BOTAO_SECUNDARIO}
                onClick={() => {
                  definirVinculosClienteModal(null);
                  definirVinculosDados(null);
                  definirErroVinculos('');
                }}
              >
                Fechar
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pr-1">
              {renderConteudoVinculos(vinculosDados, carregandoVinculos, erroVinculos)}
            </div>
          </div>
        </div>
      )}
    </Pagina>
  );
}

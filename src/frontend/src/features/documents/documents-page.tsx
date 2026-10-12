import { useEffect, useRef, useState, type FormEvent } from 'react';
import { baixarArquivo, dataHoraBrasileira, requisitarApi } from '../../shared/api';
import { useAutenticacao } from '../../shared/auth/auth-context';
import { ROTULOS_VINCULO, SeletorVinculo, type Vinculo } from '../../shared/link-picker';
import { BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO, Pagina } from '../../shared/ui';

type Categoria = 'CONTRATO' | 'PROCURACAO' | 'PETICAO' | 'DECISAO' | 'PROVA' | 'DOCUMENTO_PESSOAL' | 'COMPROVANTE' | 'OUTRO';
const CATEGORIAS: Record<Categoria, string> = { CONTRATO: 'Contrato', PROCURACAO: 'Procuração', PETICAO: 'Petição', DECISAO: 'Decisão', PROVA: 'Prova',
  DOCUMENTO_PESSOAL: 'Documento pessoal', COMPROVANTE: 'Comprovante', OUTRO: 'Outro' };
const EVENTOS: Record<string, string> = { CRIADO: 'Enviado', VISUALIZADO: 'Visualizado', BAIXADO: 'Baixado', NOVA_VERSAO: 'Nova versão', ALTERADO: 'Dados alterados',
  INATIVADO: 'Inativado', REATIVADO: 'Reativado' };
const EXTENSOES = '.pdf,.doc,.docx,.xls,.xlsx,.odt,.ods,.rtf,.txt,.jpg,.jpeg,.png';
const TAMANHO_PAGINA = 20;
interface Pessoa { id: string; nome: string }
interface Versao { numero: number; nomeOriginal: string; tipoConteudo: string; tamanhoBytes: number; enviadoPor: Pessoa; criadoEm: string }
interface Documento { id: string; nome: string; descricao: string; categoria: Categoria; confidencial: boolean; ativo: boolean; vinculo: Vinculo | null;
  versaoAtual: Versao; criador: Pessoa; inativadoEm: string | null; versao: number; atualizadoEm: string; podeAlterar: boolean; podeAlterarSituacao: boolean; versoes?: Versao[] }
interface Evento { id: string; autor: Pessoa; acao: string; numeroVersao: number | null; criadoEm: string }
interface Metadados { nome: string; descricao: string; categoria: Categoria; confidencial: boolean; vinculo: Vinculo | null }

const tamanho = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function PaginaDocumentos() {
  const { cliente, identidade } = useAutenticacao();
  const podeConfidencial = ['PROPRIETARIO', 'ADMINISTRADOR', 'ADVOGADO'].includes(identidade?.escritorio.papel ?? '');
  const [filtros, definirFiltros] = useState({ pesquisa: '', categoria: '', situacao: 'ATIVOS' });
  const [pesquisa, definirPesquisa] = useState(''), [pagina, definirPagina] = useState(1);
  const [documentos, definirDocumentos] = useState<Documento[]>([]), [total, definirTotal] = useState(0);
  const [selecionado, definirSelecionado] = useState<Documento | null>(null), [enviandoNovo, definirEnviandoNovo] = useState(false);
  const [revisao, definirRevisao] = useState(0), [carregando, definirCarregando] = useState(true);
  const [mensagem, definirMensagem] = useState(''), [erro, definirErro] = useState('');
  useEffect(() => {
    const controle = new AbortController(); definirCarregando(true);
    const consulta = new URLSearchParams({ situacao: filtros.situacao, pagina: String(pagina), tamanhoPagina: String(TAMANHO_PAGINA), pesquisa: filtros.pesquisa });
    if (filtros.categoria) consulta.set('categoria', filtros.categoria);
    void requisitarApi<{ documentos: Documento[]; total: number }>(cliente, `/api/v1/documentos?${consulta}`, { signal: controle.signal })
      .then((resposta) => { if (controle.signal.aborted) return; if (resposta.ok) { definirDocumentos(resposta.dados.documentos); definirTotal(resposta.dados.total); } else definirErro(resposta.mensagem); })
      .catch(() => { if (!controle.signal.aborted) definirErro('Não foi possível carregar os documentos.'); })
      .finally(() => { if (!controle.signal.aborted) definirCarregando(false); });
    return () => controle.abort();
  }, [cliente, filtros, pagina, revisao]);
  async function abrir(id: string) {
    const resposta = await requisitarApi<Documento>(cliente, `/api/v1/documentos/${id}`).catch(() => null);
    if (resposta?.ok) { definirSelecionado(resposta.dados); definirEnviandoNovo(false); } else definirErro(resposta?.mensagem ?? 'Não foi possível abrir o documento.');
  }
  function aoAtualizar(documento: Documento | null, aviso: string) {
    definirMensagem(aviso); definirErro(''); definirRevisao((atual) => atual + 1);
    if (documento) void abrir(documento.id); else definirSelecionado(null);
  }
  return <Pagina caminho="/documentos" titulo="Documentos">
    {mensagem && <p role="status" className="text-cyan-300">{mensagem}</p>}{erro && <p role="alert" className="text-rose-300">{erro}</p>}
    <form aria-label="Filtros" className="grid gap-3 md:grid-cols-5" onSubmit={(evento) => { evento.preventDefault(); definirPagina(1); definirFiltros({ ...filtros, pesquisa: pesquisa.trim() }); }}>
      <label className="md:col-span-2">Pesquisar por nome ou descrição<input className={CAMPO} value={pesquisa} onChange={(evento) => definirPesquisa(evento.target.value)} /></label>
      <label>Categoria<select className={CAMPO} value={filtros.categoria} onChange={(evento) => { definirPagina(1); definirFiltros({ ...filtros, categoria: evento.target.value }); }}>
        <option value="">Todas</option>{(Object.keys(CATEGORIAS) as Categoria[]).map((categoria) => <option key={categoria} value={categoria}>{CATEGORIAS[categoria]}</option>)}</select></label>
      <label>Situação<select className={CAMPO} value={filtros.situacao} onChange={(evento) => { definirPagina(1); definirFiltros({ ...filtros, situacao: evento.target.value }); }}>
        <option value="ATIVOS">Ativos</option><option value="INATIVOS">Inativos</option></select></label>
      <div className="flex items-end gap-2"><button className={BOTAO_SECUNDARIO} disabled={carregando}>Pesquisar</button>
        <button type="button" className={BOTAO} onClick={() => { definirEnviandoNovo(true); definirSelecionado(null); }}>Enviar documento</button></div>
    </form>
    {carregando ? <p role="status">Carregando documentos…</p> : documentos.length === 0 ? <p>Nenhum documento encontrado.</p> :
      <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Nome', 'Categoria', 'Versão', 'Arquivo', 'Atualizado em', ''].map((titulo) => <th key={titulo} className="p-2">{titulo}</th>)}</tr></thead>
        <tbody>{documentos.map((documento) => <tr key={documento.id} className="border-t border-slate-700">
          <td className="p-2">{documento.nome}{documento.confidencial && <span className="ml-2 rounded bg-amber-900 px-2 text-xs">Confidencial</span>}</td>
          <td>{CATEGORIAS[documento.categoria]}</td><td>v{documento.versaoAtual.numero}</td>
          <td>{documento.versaoAtual.nomeOriginal} ({tamanho(documento.versaoAtual.tamanhoBytes)})</td><td>{dataHoraBrasileira(documento.atualizadoEm)}</td>
          <td><button type="button" className={BOTAO_SECUNDARIO} onClick={() => { void abrir(documento.id); }}>Abrir</button></td></tr>)}</tbody></table></div>}
    <nav aria-label="Paginação" className="flex gap-4"><button disabled={pagina === 1 || carregando} onClick={() => definirPagina(pagina - 1)}>Anterior</button>
      <span>Página {pagina} de {Math.max(1, Math.ceil(total / TAMANHO_PAGINA))}</span><button disabled={pagina * TAMANHO_PAGINA >= total || carregando} onClick={() => definirPagina(pagina + 1)}>Próxima</button></nav>
    {enviandoNovo && <FormularioDocumento podeConfidencial={podeConfidencial} aoCancelar={() => definirEnviandoNovo(false)}
      aoSalvar={(documento) => { definirEnviandoNovo(false); aoAtualizar(documento, 'Documento enviado.'); }} />}
    {selecionado && <DetalheDocumento documento={selecionado} podeConfidencial={podeConfidencial} aoAtualizar={aoAtualizar} aoFechar={() => definirSelecionado(null)} />}
  </Pagina>;
}

function CamposMetadados({ dados, definirDados, podeConfidencial }: { dados: Metadados; definirDados: (dados: Metadados) => void; podeConfidencial: boolean }) {
  return <>
    <label className="block">Nome do documento<input className={CAMPO} required maxLength={200} value={dados.nome} onChange={(evento) => definirDados({ ...dados, nome: evento.target.value })} /></label>
    <label className="block">Categoria<select className={CAMPO} value={dados.categoria} onChange={(evento) => definirDados({ ...dados, categoria: evento.target.value as Categoria })}>
      {(Object.keys(CATEGORIAS) as Categoria[]).map((categoria) => <option key={categoria} value={categoria}>{CATEGORIAS[categoria]}</option>)}</select></label>
    <label className="block">Descrição (opcional)<textarea className={CAMPO} maxLength={2000} value={dados.descricao} onChange={(evento) => definirDados({ ...dados, descricao: evento.target.value })} /></label>
    {podeConfidencial && <label className="flex gap-2"><input type="checkbox" checked={dados.confidencial} onChange={(evento) => definirDados({ ...dados, confidencial: evento.target.checked })} />
      Confidencial: visível somente a proprietários, administradores, advogados e a quem enviou.</label>}
    <SeletorVinculo valor={dados.vinculo} aoAlterar={(vinculo) => definirDados({ ...dados, vinculo })} />
  </>;
}

function FormularioDocumento({ podeConfidencial, aoSalvar, aoCancelar }: { podeConfidencial: boolean; aoSalvar: (documento: Documento) => void; aoCancelar: () => void }) {
  const { cliente } = useAutenticacao();
  const [dados, definirDados] = useState<Metadados>({ nome: '', descricao: '', categoria: 'OUTRO', confidencial: false, vinculo: null });
  const [arquivo, definirArquivo] = useState<File | null>(null), [enviando, definirEnviando] = useState(false), [erro, definirErro] = useState('');
  const pendente = useRef(false);
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (pendente.current) return;
    if (!arquivo) { definirErro('Selecione um arquivo.'); return; }
    pendente.current = true; definirEnviando(true); definirErro('');
    // Metadados precedem o arquivo: o servidor os valida antes de receber o conteúdo.
    const corpo = new FormData();
    corpo.append('nome', dados.nome); corpo.append('descricao', dados.descricao); corpo.append('categoria', dados.categoria);
    corpo.append('confidencial', String(dados.confidencial));
    if (dados.vinculo) { corpo.append('vinculoTipo', dados.vinculo.tipo); corpo.append('vinculoId', dados.vinculo.id); }
    corpo.append('arquivo', arquivo);
    try {
      const resposta = await requisitarApi<Documento>(cliente, '/api/v1/documentos', { method: 'POST', body: corpo });
      if (resposta.ok) aoSalvar(resposta.dados); else definirErro(resposta.mensagem);
    } catch { definirErro('Não foi possível enviar o documento.'); } finally { pendente.current = false; definirEnviando(false); }
  }
  return <form onSubmit={(evento) => { void enviar(evento); }} aria-busy={enviando} className={`${CARTAO} max-w-2xl space-y-3`}>
    <h2 className="text-2xl">Enviar documento</h2>{erro && <p role="alert" className="text-rose-300">{erro}</p>}
    <fieldset disabled={enviando} className="space-y-3">
      <label className="block">Arquivo<input className={CAMPO} type="file" accept={EXTENSOES} onChange={(evento) => {
        const selecionado = evento.target.files?.[0] ?? null; definirArquivo(selecionado);
        if (selecionado && !dados.nome) definirDados({ ...dados, nome: selecionado.name.replace(/\.[^.]+$/, '') });
      }} /></label>
      <CamposMetadados dados={dados} definirDados={definirDados} podeConfidencial={podeConfidencial} />
      <div className="flex gap-3"><button className={BOTAO} type="submit">{enviando ? 'Enviando…' : 'Enviar'}</button>
        <button type="button" className={BOTAO_SECUNDARIO} onClick={aoCancelar}>Cancelar</button></div>
    </fieldset>
  </form>;
}

function DetalheDocumento({ documento, podeConfidencial, aoAtualizar, aoFechar }: { documento: Documento; podeConfidencial: boolean;
  aoAtualizar: (documento: Documento | null, aviso: string) => void; aoFechar: () => void }) {
  const { cliente } = useAutenticacao();
  const [editando, definirEditando] = useState<Metadados | null>(null), [novaVersao, definirNovaVersao] = useState<File | null>(null);
  const [confirmarSituacao, definirConfirmarSituacao] = useState(false), [eventos, definirEventos] = useState<Evento[] | null>(null);
  const [enviando, definirEnviando] = useState(false), [erro, definirErro] = useState('');
  async function executar(operacao: () => Promise<{ ok: boolean; mensagem: string; dados: Documento }>, aviso: string) {
    if (enviando) return;
    definirEnviando(true); definirErro('');
    try {
      const resposta = await operacao();
      if (resposta.ok) { definirEditando(null); definirNovaVersao(null); definirConfirmarSituacao(false); aoAtualizar(resposta.dados, aviso); } else definirErro(resposta.mensagem);
    } catch { definirErro('Não foi possível concluir a operação.'); } finally { definirEnviando(false); }
  }
  function enviarVersao(evento: FormEvent) {
    evento.preventDefault();
    if (!novaVersao) return;
    const corpo = new FormData(); corpo.append('versao', String(documento.versao)); corpo.append('arquivo', novaVersao);
    void executar(() => requisitarApi<Documento>(cliente, `/api/v1/documentos/${documento.id}/versoes`, { method: 'POST', body: corpo }), 'Nova versão enviada. As anteriores continuam disponíveis.');
  }
  async function baixar(versao: Versao) {
    const baixou = await baixarArquivo(cliente, `/api/v1/documentos/${documento.id}/download?versao=${versao.numero}`, versao.nomeOriginal).catch(() => false);
    if (!baixou) definirErro('Não foi possível baixar o arquivo.');
  }
  async function consultarEventos() {
    const resposta = await requisitarApi<Evento[]>(cliente, `/api/v1/documentos/${documento.id}/eventos`).catch(() => null);
    if (resposta?.ok) definirEventos(resposta.dados); else definirErro('Não foi possível consultar os registros de acesso.');
  }
  return <section aria-label="Detalhes do documento" className={`${CARTAO} space-y-4`}>
    <div className="flex justify-between gap-3"><h2 className="text-2xl">{documento.nome}</h2><button type="button" className={BOTAO_SECUNDARIO} onClick={aoFechar}>Fechar</button></div>
    {erro && <p role="alert" className="text-rose-300">{erro}</p>}
    {!documento.ativo && <p role="note" className="rounded border border-amber-400 p-3">Documento inativo desde {dataHoraBrasileira(documento.inativadoEm!)}. Arquivos e histórico foram preservados.</p>}
    <dl className="grid gap-2 md:grid-cols-2">
      <div><dt className="text-slate-400">Categoria</dt><dd>{CATEGORIAS[documento.categoria]}{documento.confidencial && ' · Confidencial'}</dd></div>
      <div><dt className="text-slate-400">Enviado por</dt><dd>{documento.criador.nome}</dd></div>
      <div><dt className="text-slate-400">Vínculo</dt><dd>{documento.vinculo ? `${ROTULOS_VINCULO[documento.vinculo.tipo]} ${documento.vinculo.id}` : '—'}</dd></div>
      {documento.descricao && <div className="md:col-span-2"><dt className="text-slate-400">Descrição</dt><dd className="whitespace-pre-wrap">{documento.descricao}</dd></div>}
    </dl>
    <section aria-label="Versões"><h3 className="text-xl">Versões</h3>
      <table className="w-full text-left"><thead><tr>{['Versão', 'Arquivo', 'Tipo', 'Tamanho', 'Enviado por', 'Em', ''].map((titulo) => <th key={titulo} className="p-1">{titulo}</th>)}</tr></thead>
        <tbody>{(documento.versoes ?? [documento.versaoAtual]).map((versao) => <tr key={versao.numero} className="border-t border-slate-800">
          <td className="p-1">v{versao.numero}{versao.numero === documento.versaoAtual.numero && ' (atual)'}</td><td>{versao.nomeOriginal}</td><td>{versao.tipoConteudo}</td>
          <td>{tamanho(versao.tamanhoBytes)}</td><td>{versao.enviadoPor.nome}</td><td>{dataHoraBrasileira(versao.criadoEm)}</td>
          <td><button type="button" className={BOTAO_SECUNDARIO} onClick={() => { void baixar(versao); }}>Baixar</button></td></tr>)}</tbody></table>
    </section>
    {documento.ativo && documento.podeAlterar && <form className="flex flex-wrap items-end gap-3" onSubmit={enviarVersao}>
      <label>Substituir por nova versão<input className={CAMPO} type="file" accept={EXTENSOES} onChange={(evento) => definirNovaVersao(evento.target.files?.[0] ?? null)} /></label>
      <button className={BOTAO_SECUNDARIO} disabled={!novaVersao || enviando}>{enviando ? 'Enviando…' : 'Enviar nova versão'}</button></form>}
    {editando && <form className="space-y-3" onSubmit={(evento) => { evento.preventDefault();
      void executar(() => requisitarApi<Documento>(cliente, `/api/v1/documentos/${documento.id}`, { method: 'PATCH', json: { ...editando, versao: documento.versao } }), 'Dados do documento atualizados.'); }}>
      <fieldset disabled={enviando} className="space-y-3"><CamposMetadados dados={editando} definirDados={definirEditando} podeConfidencial={podeConfidencial} />
        <div className="flex gap-2"><button className={BOTAO}>Salvar</button><button type="button" className={BOTAO_SECUNDARIO} onClick={() => definirEditando(null)}>Cancelar</button></div></fieldset>
    </form>}
    <div className="flex flex-wrap gap-2">
      {documento.ativo && documento.podeAlterar && !editando && <button type="button" className={BOTAO_SECUNDARIO} onClick={() => definirEditando({ nome: documento.nome,
        descricao: documento.descricao, categoria: documento.categoria, confidencial: documento.confidencial, vinculo: documento.vinculo })}>Editar dados</button>}
      {documento.podeAlterarSituacao && <button type="button" className={BOTAO_SECUNDARIO} onClick={() => definirConfirmarSituacao(true)}>{documento.ativo ? 'Inativar' : 'Reativar'}</button>}
      <button type="button" className={BOTAO_SECUNDARIO} onClick={() => { void consultarEventos(); }}>Registros de acesso e alterações</button>
    </div>
    {confirmarSituacao && <section role="alertdialog" aria-label="Confirmar situação do documento" className="space-y-3 rounded-xl border border-amber-400 p-4">
      <p>{documento.ativo ? 'Inativar o documento? Ele deixa de aparecer na lista de ativos, mas versões e histórico são preservados.' : 'Reativar o documento?'}</p>
      <div className="flex gap-2"><button type="button" className={BOTAO} disabled={enviando} onClick={() => { void executar(() => requisitarApi<Documento>(cliente,
        `/api/v1/documentos/${documento.id}/${documento.ativo ? 'inativar' : 'reativar'}`, { method: 'POST', json: { versao: documento.versao } }), documento.ativo ? 'Documento inativado.' : 'Documento reativado.'); }}>Confirmar</button>
        <button type="button" className={BOTAO_SECUNDARIO} onClick={() => definirConfirmarSituacao(false)}>Voltar</button></div>
    </section>}
    {eventos && <section aria-label="Registros do documento" className="space-y-2"><h3 className="text-xl">Registros de acesso e alterações (últimos 200)</h3>
      <ol>{eventos.map((evento) => <li key={evento.id} className="text-sm">{dataHoraBrasileira(evento.criadoEm)} — {EVENTOS[evento.acao] ?? evento.acao}
        {evento.numeroVersao ? ` (v${evento.numeroVersao})` : ''} — {evento.autor.nome}</li>)}</ol>
      <button type="button" className={BOTAO_SECUNDARIO} onClick={() => definirEventos(null)}>Fechar registros</button></section>}
  </section>;
}

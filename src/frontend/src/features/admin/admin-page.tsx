import { useEffect, useState, type FormEvent } from 'react';
import { useAutenticacao } from '../../shared/auth/auth-context';
import { baixarArquivo, dataHoraBrasileira, requisitarApi } from '../../shared/api';
import { BOTAO, BOTAO_SECUNDARIO, CAMPO, CARTAO, Pagina } from '../../shared/ui';

interface RegistroAuditoria {
  id: string; ocorridoEm: string; autor: { id: string; nome: string } | null; acao: string;
  tipoEntidade: string; idEntidade: string | null; anterior: unknown; atual: unknown; detalhes: unknown;
}
interface PaginaAuditoria { registros: RegistroAuditoria[]; total: number; pagina: number; tamanhoPagina: number }
interface Filtros { tipoEntidade: string; de: string; ate: string }

const TAMANHO_PAGINA = 20;
const TIPOS: Record<string, string> = { TAREFA: 'Tarefa', PRAZO_JUDICIAL: 'Prazo judicial', DOCUMENTO: 'Documento', MEMBRO: 'Equipe',
  SESSAO: 'Sessão', AUTENTICACAO: 'Autenticação', ESCRITORIO: 'Escritório' };
const ACOES: Record<string, string> = {
  SESSAO_INICIADA: 'Sessão iniciada', SESSAO_ENCERRADA: 'Sessão encerrada', LOGIN_FALHOU: 'Falha de login',
  ESCRITORIO_RENOMEADO: 'Escritório renomeado', EXPORTACAO_REALIZADA: 'Dados exportados',
  CRIADA: 'Criada', CRIADO: 'Criado', ALTERADA: 'Alterada', ALTERADO: 'Alterado', CONCLUIDA: 'Concluída', REABERTA: 'Reaberta', CANCELADA: 'Cancelada',
  VISUALIZADO: 'Visualizado', BAIXADO: 'Baixado', NOVA_VERSAO: 'Nova versão', INATIVADO: 'Inativado', REATIVADO: 'Reativado',
  USUARIO_CRIADO: 'Usuário criado', VINCULO_CRIADO: 'Vínculo criado', AUTORIZACAO_ALTERADA: 'Permissões alteradas',
};
const FILTROS_VAZIOS: Filtros = { tipoEntidade: '', de: '', ate: '' };

// Datas do filtro são dias civis no fuso do navegador, enviadas em UTC.
function consultaAuditoria(pagina: number, filtros: Filtros): string {
  const parametros = new URLSearchParams({ pagina: String(pagina), tamanhoPagina: String(TAMANHO_PAGINA) });
  if (filtros.tipoEntidade) parametros.set('tipoEntidade', filtros.tipoEntidade);
  if (filtros.de) parametros.set('de', new Date(`${filtros.de}T00:00:00`).toISOString());
  if (filtros.ate) parametros.set('ate', new Date(`${filtros.ate}T23:59:59.999`).toISOString());
  return `/api/v1/administracao/auditoria?${parametros}`;
}

export function PaginaAdministracao() {
  const { cliente, identidade } = useAutenticacao();
  const papel = identidade?.escritorio.papel;
  const podeAdministrar = papel === 'PROPRIETARIO' || papel === 'ADMINISTRADOR';
  const [nome, definirNome] = useState('');
  const [mensagemNome, definirMensagemNome] = useState(''), [erroNome, definirErroNome] = useState(''), [salvando, definirSalvando] = useState(false);
  const [rascunho, definirRascunho] = useState<Filtros>(FILTROS_VAZIOS), [filtros, definirFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [pagina, definirPagina] = useState(1), [auditoria, definirAuditoria] = useState<PaginaAuditoria | null>(null);
  const [erroAuditoria, definirErroAuditoria] = useState(''), [mensagemExportacao, definirMensagemExportacao] = useState('');

  useEffect(() => {
    if (!podeAdministrar) return;
    let ativo = true;
    void requisitarApi<{ nome: string }>(cliente, '/api/v1/administracao/escritorio').then((resposta) => {
      if (ativo && resposta.ok) definirNome(resposta.dados.nome);
    });
    return () => { ativo = false; };
  }, [cliente, podeAdministrar]);

  useEffect(() => {
    if (!podeAdministrar) return;
    let ativo = true;
    void requisitarApi<PaginaAuditoria>(cliente, consultaAuditoria(pagina, filtros)).then((resposta) => {
      if (!ativo) return;
      if (resposta.ok) { definirAuditoria(resposta.dados); definirErroAuditoria(''); } else definirErroAuditoria(resposta.mensagem);
    });
    return () => { ativo = false; };
  }, [cliente, podeAdministrar, pagina, filtros]);

  if (!podeAdministrar) {
    return <Pagina caminho="/administracao" titulo="Administração">
      <p role="alert">Somente proprietário e administrador acessam a administração do escritório.</p>
    </Pagina>;
  }

  async function salvarNome(evento: FormEvent) {
    evento.preventDefault();
    definirSalvando(true); definirErroNome(''); definirMensagemNome('');
    const resposta = await requisitarApi<{ nome: string }>(cliente, '/api/v1/administracao/escritorio', { method: 'PATCH', json: { nome } });
    definirSalvando(false);
    if (!resposta.ok) { definirErroNome(resposta.mensagem); return; }
    definirNome(resposta.dados.nome); definirMensagemNome('Nome do escritório atualizado.');
    void cliente.revalidarSessaoSemRenovar();
  }

  async function exportar() {
    definirMensagemExportacao('');
    const dia = new Date().toISOString().slice(0, 10);
    const baixou = await baixarArquivo(cliente, '/api/v1/administracao/exportacao', `webdireito-exportacao-${dia}.json`);
    definirMensagemExportacao(baixou ? 'Exportação gerada.' : 'Não foi possível exportar. Tente novamente.');
  }

  const totalPaginas = auditoria ? Math.max(1, Math.ceil(auditoria.total / TAMANHO_PAGINA)) : 1;
  return <Pagina caminho="/administracao" titulo="Administração">
    <section className={CARTAO} aria-labelledby="titulo-escritorio">
      <h2 id="titulo-escritorio" className="mb-3 text-xl font-semibold">Escritório</h2>
      <form onSubmit={salvarNome} className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1">Nome do escritório
          <input className={CAMPO} value={nome} maxLength={120} required onChange={(e) => definirNome(e.target.value)} /></label>
        <button type="submit" className={BOTAO} disabled={salvando}>Salvar nome</button>
      </form>
      {erroNome && <p role="alert" className="mt-2 text-red-300">{erroNome}</p>}
      {mensagemNome && <p role="status" className="mt-2 text-emerald-300">{mensagemNome}</p>}
    </section>

    {papel === 'PROPRIETARIO' && <section className={CARTAO} aria-labelledby="titulo-exportacao">
      <h2 id="titulo-exportacao" className="mb-2 text-xl font-semibold">Exportação de dados</h2>
      <p className="mb-3 text-slate-300">Gera um arquivo JSON com equipe, tarefas, prazos, metadados de documentos e histórico. Os arquivos dos documentos não são incluídos.</p>
      <button type="button" className={BOTAO} onClick={() => { void exportar(); }}>Exportar dados (JSON)</button>
      {mensagemExportacao && <p role="status" className="mt-2">{mensagemExportacao}</p>}
    </section>}

    <section className={CARTAO} aria-labelledby="titulo-historico">
      <h2 id="titulo-historico" className="mb-3 text-xl font-semibold">Histórico administrativo</h2>
      <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); definirPagina(1); definirFiltros(rascunho); }}>
        <label>Tipo de registro
          <select className={CAMPO} value={rascunho.tipoEntidade} onChange={(e) => definirRascunho({ ...rascunho, tipoEntidade: e.target.value })}>
            <option value="">Todos</option>
            {Object.entries(TIPOS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
          </select></label>
        <label>De<input type="date" className={CAMPO} value={rascunho.de} onChange={(e) => definirRascunho({ ...rascunho, de: e.target.value })} /></label>
        <label>Até<input type="date" className={CAMPO} value={rascunho.ate} onChange={(e) => definirRascunho({ ...rascunho, ate: e.target.value })} /></label>
        <button type="submit" className={BOTAO_SECUNDARIO}>Filtrar</button>
      </form>
      {erroAuditoria && <p role="alert" className="text-red-300">{erroAuditoria}</p>}
      {auditoria && (auditoria.registros.length === 0 ? <p>Nenhum registro encontrado.</p> : <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-slate-700"><th className="p-2">Quando</th><th className="p-2">Quem</th><th className="p-2">Ação</th><th className="p-2">Registro</th></tr></thead>
          <tbody>{auditoria.registros.map((r) => <tr key={r.id} className="border-b border-slate-800">
            <td className="p-2">{dataHoraBrasileira(r.ocorridoEm)}</td>
            <td className="p-2">{r.autor?.nome ?? 'Não identificado'}</td>
            <td className="p-2">{ACOES[r.acao] ?? r.acao}</td>
            <td className="p-2">{TIPOS[r.tipoEntidade] ?? r.tipoEntidade}</td>
          </tr>)}</tbody>
        </table>
      </div>)}
      <nav aria-label="Paginação do histórico" className="mt-3 flex items-center gap-3">
        <button type="button" className={BOTAO_SECUNDARIO} disabled={pagina <= 1} onClick={() => definirPagina(pagina - 1)}>Anterior</button>
        <span>Página {pagina} de {totalPaginas}</span>
        <button type="button" className={BOTAO_SECUNDARIO} disabled={pagina >= totalPaginas} onClick={() => definirPagina(pagina + 1)}>Próxima</button>
      </nav>
    </section>
  </Pagina>;
}

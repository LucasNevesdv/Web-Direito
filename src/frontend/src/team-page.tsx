import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAutenticacao } from './auth-context';

type Papel = 'PROPRIETARIO' | 'ADMINISTRADOR' | 'ADVOGADO' | 'ESTAGIARIO' | 'SECRETARIO';
interface Membro { id: string; idUsuario: string; nome: string; email: string; papel: Papel; permissoes: string[]; estaAtivo: boolean; deveAlterarSenha: boolean; criadoEm: string; versao: number }
interface Configuracao { permissoes: string[]; papeis: { papel: Papel; permissoesPadrao: string[]; permissoesPermitidas: string[] }[] }
const ROTULOS: Record<string, string> = { PROPRIETARIO: 'Proprietário', ADMINISTRADOR: 'Administrador', ADVOGADO: 'Advogado', ESTAGIARIO: 'Estagiário', SECRETARIO: 'Secretário',
  EQUIPE_VISUALIZAR: 'Visualizar equipe', EQUIPE_CADASTRAR_USUARIO: 'Cadastrar usuários', EQUIPE_ALTERAR_USUARIO: 'Alterar usuários', EQUIPE_DEFINIR_PERMISSOES: 'Definir permissões', EQUIPE_ATIVAR_INATIVAR_USUARIO: 'Ativar e inativar usuários' };
const FORMULARIO_VAZIO = { nome: '', email: '', papel: 'ADVOGADO' as Papel, permissoes: [] as string[], senhaTemporaria: '', confirmacaoSenhaTemporaria: '' };
const CAMPO = 'w-full rounded-lg border border-slate-600 bg-slate-950 p-3';
const BOTAO = 'rounded-lg bg-cyan-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50';

export function PaginaEquipe() {
  const { cliente, identidade } = useAutenticacao();
  const [configuracao, definirConfiguracao] = useState<Configuracao | null>(null);
  const [usuarios, definirUsuarios] = useState<Membro[]>([]), [total, definirTotal] = useState(0);
  const [pagina, definirPagina] = useState(1), [pesquisa, definirPesquisa] = useState(''), [filtro, definirFiltro] = useState('');
  const [revisao, definirRevisao] = useState(0), [carregando, definirCarregando] = useState(true);
  const [mensagem, definirMensagem] = useState(''), [erro, definirErro] = useState('');
  const [formulario, definirFormulario] = useState<typeof FORMULARIO_VAZIO | null>(null), [editando, definirEditando] = useState<Membro | null>(null);
  const [confirmacao, definirConfirmacao] = useState<{ tipo: 'existente' | 'situacao' | 'editar'; membro?: Membro } | null>(null);
  const [mostrarSenha, definirMostrarSenha] = useState(false), [enviando, definirEnviando] = useState(false);
  const [historico, definirHistorico] = useState<Array<{ id: string; acao: string; idAutor: string; criadoEm: string; anterior: unknown; atual: unknown }> | null>(null);
  const envioPendente = useRef(false);
  const possui = (permissao: string) => configuracao?.permissoes.includes(permissao) ?? false;
  const podeGerenciar = (membro: Membro) => membro.idUsuario !== identidade?.usuario.id && !!configuracao?.papeis.some((p) => p.papel === membro.papel);
  useEffect(() => {
    const controle = new AbortController(); definirCarregando(true); definirErro('');
    void (async () => {
      const opcoes = { signal: controle.signal };
      const respostaConfiguracao = await cliente.enviarRequisicaoAutenticada('/api/v1/equipe/usuarios/configuracao', opcoes);
      if (!respostaConfiguracao.ok) throw new Error('Não foi possível carregar as permissões.');
      const dados = await respostaConfiguracao.json() as Configuracao;
      definirConfiguracao(dados);
      if (!dados.permissoes.includes('EQUIPE_VISUALIZAR')) { definirUsuarios([]); throw new Error('Você não tem permissão para visualizar a equipe.'); }
      const resposta = await cliente.enviarRequisicaoAutenticada(`/api/v1/equipe/usuarios?pagina=${pagina}&tamanhoPagina=10&pesquisa=${encodeURIComponent(filtro)}`, opcoes);
      if (!resposta.ok) throw new Error('Não foi possível carregar a equipe.');
      const resultado = await resposta.json(); if (!controle.signal.aborted) { definirUsuarios(resultado.usuarios); definirTotal(resultado.total); }
    })().catch((falha: unknown) => { if (!controle.signal.aborted) definirErro(falha instanceof Error ? falha.message : 'Não foi possível carregar.'); })
      .finally(() => { if (!controle.signal.aborted) definirCarregando(false); });
    return () => controle.abort();
  }, [cliente, pagina, filtro, revisao]);
  function novoUsuario() { definirFormulario({ ...FORMULARIO_VAZIO }); definirEditando(null); definirConfirmacao(null); definirErro(''); definirMensagem(''); definirMostrarSenha(false); }
  function editar(membro: Membro) { definirEditando(membro); definirFormulario({ ...FORMULARIO_VAZIO, nome: membro.nome, email: membro.email, papel: membro.papel, permissoes: [...membro.permissoes] }); definirConfirmacao(null); definirErro(''); }
  async function salvar(confirmado = false) {
    if (!formulario || envioPendente.current) return;
    if (editando && !confirmado) { definirConfirmacao({ tipo: 'editar' }); return; }
    const existente = confirmacao?.tipo === 'existente';
    const dados = { ...formulario, email: formulario.email.trim().toLowerCase(), permissoes: [...formulario.permissoes] };
    if (!editando && !existente && (Array.from(dados.senhaTemporaria).length < 12 || Array.from(dados.senhaTemporaria).length > 128 || dados.senhaTemporaria !== dados.confirmacaoSenhaTemporaria)) {
      definirErro('Use uma senha entre 12 e 128 caracteres e confirmação igual.'); return;
    }
    envioPendente.current = true; definirEnviando(true); definirErro('');
    // Os campos são apagados ao enviar, inclusive quando a API responde com conflito.
    definirFormulario({ ...dados, senhaTemporaria: '', confirmacaoSenhaTemporaria: '' }); definirMostrarSenha(false);
    try {
      const caminho = editando ? `/api/v1/equipe/usuarios/${editando.id}` : existente ? '/api/v1/equipe/usuarios/confirmar-vinculo' : '/api/v1/equipe/usuarios';
      const corpo = editando ? { papel: dados.papel, permissoes: dados.permissoes, versao: editando.versao }
        : existente ? { email: dados.email, papel: dados.papel, permissoes: dados.permissoes, confirmacaoVinculo: true } : dados;
      const resposta = await cliente.enviarRequisicaoAutenticada(caminho, { method: editando ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      const resultado = await resposta.json();
      if (resposta.status === 409 && resultado.erro === 'CONTA_EXISTENTE') { definirConfirmacao({ tipo: 'existente' }); return; }
      if (!resposta.ok) { definirErro(resposta.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : resultado.mensagem ?? 'Não foi possível salvar.'); definirConfirmacao(null); return; }
      definirMensagem(existente ? 'Vínculo criado. A conta utilizará sua senha atual.' : editando ? 'Papel e permissões atualizados. Novo login será necessário.' : 'Usuário cadastrado. Forneça a senha temporária por um canal separado; ela não será enviada por e-mail.');
      definirFormulario(null); definirEditando(null); definirConfirmacao(null); definirRevisao((atual) => atual + 1);
    } catch { definirErro('Não foi possível salvar. Atualize a lista antes de tentar novamente.'); }
    finally { envioPendente.current = false; definirEnviando(false); }
  }
  async function alterarSituacao(membro: Membro) {
    if (envioPendente.current) return; envioPendente.current = true; definirEnviando(true); definirErro('');
    try {
      const resposta = await cliente.enviarRequisicaoAutenticada(`/api/v1/equipe/usuarios/${membro.id}/${membro.estaAtivo ? 'inativar' : 'ativar'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versao: membro.versao }) });
      const resultado = await resposta.json(); if (!resposta.ok) { definirErro(resultado.mensagem ?? 'Não foi possível alterar o vínculo.'); return; }
      definirMensagem(membro.estaAtivo ? 'Vínculo inativado e sessões do escritório revogadas.' : 'Vínculo reativado. É necessário um novo login.'); definirRevisao((atual) => atual + 1);
    } catch { definirErro('Não foi possível alterar o vínculo.'); }
    finally { definirConfirmacao(null); envioPendente.current = false; definirEnviando(false); }
  }
  async function consultarHistorico(membro: Membro) {
    try { const resposta = await cliente.enviarRequisicaoAutenticada(`/api/v1/equipe/usuarios/${membro.id}/historico`); if (!resposta.ok) throw new Error(); definirHistorico(await resposta.json()); }
    catch { definirErro('Não foi possível consultar o histórico.'); }
  }
  function enviarFormulario(evento: FormEvent) { evento.preventDefault(); void salvar(); }
  const papelSelecionado = configuracao?.papeis.find((p) => p.papel === formulario?.papel);
  return <main className="min-h-screen bg-slate-950 p-6 text-slate-100"><section className="mx-auto max-w-6xl space-y-6">
    <nav className="flex gap-5"><a href="/app" className="text-cyan-300 underline">Início</a><button onClick={() => { void cliente.encerrarSessao().catch(() => definirErro('Não foi possível encerrar a sessão. Tente novamente.')); }}>Sair</button></nav>
    <h1 className="text-3xl font-bold">Equipe</h1><p>{identidade?.escritorio.nome}</p>
    {mensagem && <p role="status">{mensagem}</p>}{erro && <p role="alert" className="text-rose-300">{erro}</p>}
    {possui('EQUIPE_VISUALIZAR') && <form onSubmit={(evento) => { evento.preventDefault(); definirPagina(1); definirFiltro(pesquisa.trim()); }} className="flex gap-3">
      <label className="flex-1">Pesquisar por nome ou e-mail<input className={CAMPO} value={pesquisa} onChange={(evento) => definirPesquisa(evento.target.value)} /></label><button className={BOTAO} disabled={carregando}>Pesquisar</button>
    </form>}
    {possui('EQUIPE_CADASTRAR_USUARIO') && possui('EQUIPE_DEFINIR_PERMISSOES') && !!configuracao?.papeis.length && <button className={BOTAO} onClick={novoUsuario} disabled={enviando}>Novo usuário</button>}
    {carregando ? <p role="status">Carregando equipe…</p> : possui('EQUIPE_VISUALIZAR') && <>
      {usuarios.length === 0 ? <p>Nenhum usuário encontrado.</p> : <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Nome', 'E-mail (login)', 'Papel', 'Estado', 'Primeiro acesso', 'Criado em', 'Ações'].map((titulo) => <th className="p-2" key={titulo}>{titulo}</th>)}</tr></thead>
        <tbody>{usuarios.map((membro) => <tr key={membro.id} data-membro={membro.email} className="border-t border-slate-700"><td className="p-2">{membro.nome}</td><td>{membro.email}</td><td>{ROTULOS[membro.papel]}</td><td>{membro.estaAtivo ? 'Ativo' : 'Inativo'}</td><td>{membro.deveAlterarSenha ? 'Pendente' : 'Concluído'}</td><td>{new Date(membro.criadoEm).toLocaleDateString('pt-BR')}</td>
          <td className="space-x-3">{podeGerenciar(membro) && possui('EQUIPE_ALTERAR_USUARIO') && <button onClick={() => editar(membro)} disabled={enviando}>Editar</button>}
            {podeGerenciar(membro) && possui('EQUIPE_ATIVAR_INATIVAR_USUARIO') && <button onClick={() => definirConfirmacao({ tipo: 'situacao', membro })} disabled={enviando}>{membro.estaAtivo ? 'Inativar' : 'Reativar'}</button>}
            <button onClick={() => { void consultarHistorico(membro); }}>Histórico</button></td></tr>)}</tbody></table></div>}
      <nav aria-label="Paginação" className="flex gap-4"><button disabled={pagina === 1 || carregando} onClick={() => definirPagina(pagina - 1)}>Anterior</button><span>Página {pagina} de {Math.max(1, Math.ceil(total / 10))}</span><button disabled={pagina * 10 >= total || carregando} onClick={() => definirPagina(pagina + 1)}>Próxima</button></nav>
    </>}
    {formulario && <form onSubmit={enviarFormulario} aria-busy={enviando} className="max-w-2xl rounded-xl bg-slate-900 p-6"><h2 className="mb-5 text-2xl">{editando ? 'Editar papel e permissões' : 'Novo usuário'}</h2>
      <fieldset disabled={enviando || confirmacao?.tipo === 'existente'} className="space-y-4">
        {!editando && <><label className="block">Nome<input id="equipe-nome" className={CAMPO} autoComplete="name" required value={formulario.nome} onChange={(evento) => definirFormulario({ ...formulario, nome: evento.target.value })} /></label>
          <label className="block">E-mail utilizado como login<input id="equipe-email" className={CAMPO} type="email" autoComplete="username" required value={formulario.email} onChange={(evento) => definirFormulario({ ...formulario, email: evento.target.value })} /></label></>}
        {editando && <p>{editando.nome} — {editando.email}</p>}
        <label className="block">Papel<select id="equipe-papel" className={CAMPO} value={formulario.papel} onChange={(evento) => {
          const papel = evento.target.value as Papel; definirFormulario({ ...formulario, papel, permissoes: configuracao?.papeis.find((p) => p.papel === papel)?.permissoesPadrao ?? [] });
        }}>{configuracao?.papeis.map(({ papel }) => <option key={papel} value={papel}>{ROTULOS[papel]}</option>)}</select></label>
        <fieldset disabled={!possui('EQUIPE_DEFINIR_PERMISSOES')}><legend>Permissões deste escritório</legend>{papelSelecionado?.permissoesPermitidas.filter((p) => configuracao?.permissoes.includes(p)).map((permissao) => <label className="mr-4 block" key={permissao}><input type="checkbox" checked={formulario.permissoes.includes(permissao)} onChange={(evento) => definirFormulario({ ...formulario, permissoes: evento.target.checked ? [...formulario.permissoes, permissao] : formulario.permissoes.filter((p) => p !== permissao) })} /> {ROTULOS[permissao]}</label>)}</fieldset>
        {!editando && <><p>O usuário será obrigado a substituir a senha no primeiro acesso. Use entre 12 e 128 caracteres. Forneça-a por um canal separado.</p>
          <label className="block">Senha temporária<input id="equipe-senhaTemporaria" className={CAMPO} type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password" required value={formulario.senhaTemporaria} onChange={(evento) => definirFormulario({ ...formulario, senhaTemporaria: evento.target.value })} /></label>
          <label className="block">Confirmar senha temporária<input id="equipe-confirmacaoSenhaTemporaria" className={CAMPO} type={mostrarSenha ? 'text' : 'password'} autoComplete="new-password" required value={formulario.confirmacaoSenhaTemporaria} onChange={(evento) => definirFormulario({ ...formulario, confirmacaoSenhaTemporaria: evento.target.value })} /></label>
          <button type="button" aria-pressed={mostrarSenha} onClick={() => definirMostrarSenha(!mostrarSenha)}>{mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}</button></>}
        <button className={BOTAO} type="submit">{enviando ? 'Salvando…' : 'Salvar usuário'}</button>
      </fieldset><button type="button" disabled={enviando} onClick={() => { definirFormulario(null); definirEditando(null); definirConfirmacao(null); }}>Cancelar</button>
    </form>}
    {confirmacao && <section role="alertdialog" aria-label="Confirmar ação administrativa" className="rounded-xl border border-amber-400 p-5"><p>{confirmacao.tipo === 'existente' ? 'Esta conta já existe. Criar somente o vínculo com este escritório? A pessoa utilizará sua senha atual, que não será alterada.'
      : confirmacao.tipo === 'editar' ? 'Confirmar alteração de papel e permissões? As sessões deste escritório serão encerradas.' : `${confirmacao.membro?.estaAtivo ? 'Inativar' : 'Reativar'} o vínculo de ${confirmacao.membro?.nome}? Será necessário novo login.`}</p>
      <button className={BOTAO} disabled={enviando} onClick={() => { if (confirmacao.tipo === 'situacao') void alterarSituacao(confirmacao.membro!); else void salvar(true); }}>Confirmar</button>
      <button disabled={enviando} onClick={() => definirConfirmacao(null)}>Voltar</button></section>}
    {historico && <section aria-label="Histórico administrativo"><h2>Histórico administrativo (últimos 100 eventos)</h2>{historico.length === 0 && <p>Nenhum evento administrativo registrado.</p>}{historico.map((evento) => <article key={evento.id} className="my-4 rounded border border-slate-700 p-3"><p>{evento.acao} — {new Date(evento.criadoEm).toLocaleString('pt-BR')} — Autor: {evento.idAutor}</p><p>Anterior: {JSON.stringify(evento.anterior)}</p><p>Atual: {JSON.stringify(evento.atual)}</p></article>)}<button onClick={() => definirHistorico(null)}>Fechar histórico</button></section>}
  </section></main>;
}

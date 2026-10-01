import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAutenticacao } from './auth-context';
import { navegar } from './routing';

// Executado antes da montagem dos componentes e dos efeitos de autenticação.
let tokenRecebido: string | null = null;
if (window.location.pathname === '/redefinir-senha') {
  tokenRecebido = new URLSearchParams(window.location.hash.slice(1)).get('token');
  window.history.replaceState(null, '', window.location.pathname);
}

export function PaginaSenhas({ finalidade }: { finalidade: 'recuperar' | 'redefinir' | 'alterar' | 'primeiro' }) {
  const { cliente } = useAutenticacao();
  const [token, definirToken] = useState(tokenRecebido);
  const [valores, definirValores] = useState({ email: '', senhaAtual: '', novaSenha: '', confirmacaoNovaSenha: '' });
  const [erros, definirErros] = useState<Record<string, string>>({});
  const [mensagem, definirMensagem] = useState('');
  const [estaEnviando, definirEnvio] = useState(false);
  const envioPendente = useRef(false);
  const [foiEnviado, definirEnviado] = useState(false);
  useEffect(() => {
    tokenRecebido = null;
    const limparSegredos = () => { definirToken(null); definirValores({ email: '', senhaAtual: '', novaSenha: '', confirmacaoNovaSenha: '' }); };
    window.addEventListener('pagehide', limparSegredos);
    return () => window.removeEventListener('pagehide', limparSegredos);
  }, []);
  const estaRecuperando = finalidade === 'recuperar';
  const exigeSenhaAtual = finalidade === 'alterar' || finalidade === 'primeiro';
  const titulo = estaRecuperando ? 'Recuperar senha' : finalidade === 'redefinir' ? 'Redefinir senha' : finalidade === 'primeiro' ? 'Primeiro acesso' : 'Alterar senha';
  const faltaToken = finalidade === 'redefinir' && !token;

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (envioPendente.current || faltaToken || foiEnviado) return;
    const validacao: Record<string, string> = {};
    if (estaRecuperando) {
      if (valores.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valores.email.trim())) validacao.email = 'Informe um e-mail válido.';
    } else {
      if (Array.from(valores.novaSenha).length < 12 || Array.from(valores.novaSenha).length > 128) validacao.novaSenha = 'Use entre 12 e 128 caracteres.';
      if (valores.novaSenha !== valores.confirmacaoNovaSenha) validacao.confirmacaoNovaSenha = 'A confirmação deve ser igual à nova senha.';
      if (exigeSenhaAtual && !valores.senhaAtual) validacao.senhaAtual = 'Informe sua senha atual.';
    }
    definirErros(validacao); definirMensagem('');
    if (Object.keys(validacao).length) { document.getElementById(`senha-${Object.keys(validacao)[0]}`)?.focus(); return; }
    envioPendente.current = true; definirEnvio(true);
    try {
      const corpo = estaRecuperando ? { email: valores.email.trim().toLowerCase() }
        : { novaSenha: valores.novaSenha, confirmacaoNovaSenha: valores.confirmacaoNovaSenha,
          ...(finalidade === 'primeiro' ? { senhaTemporaria: valores.senhaAtual } : finalidade === 'alterar' ? { senhaAtual: valores.senhaAtual } : { token }) };
      const caminho = `/api/v1/auth/${finalidade}-senha`;
      const opcoes = { method: 'POST', credentials: 'include' as const, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(15000) };
      const resposta = estaRecuperando ? await fetch(caminho, opcoes)
        : await cliente.trocarSenha(finalidade === 'primeiro' ? '/api/v1/auth/primeiro-acesso' : finalidade === 'alterar' ? '/api/v1/auth/alterar-senha' : '/api/v1/auth/redefinir-senha', corpo);
      if (resposta.status === 429) { definirMensagem('Muitas tentativas. Aguarde antes de tentar novamente.'); return; }
      if (resposta.status === 401) { definirMensagem('Entre novamente para continuar.'); return; }
      const resultado = await resposta.json();
      if (!resposta.ok) {
        const mensagens: Record<string, string> = { TOKEN_INVALIDO: 'Link inválido, utilizado ou expirado. Solicite uma nova recuperação.',
          SENHA_REPETIDA: 'A nova senha deve ser diferente da atual.', SENHA_ATUAL_INCORRETA: 'Não foi possível confirmar sua senha atual.',
          SENHA_INVALIDA: 'Use entre 12 e 128 caracteres.', CONFIRMACAO_DIFERENTE: 'A confirmação deve ser igual à nova senha.' };
        definirMensagem(mensagens[resultado.erro] ?? 'Não foi possível concluir. Tente novamente.'); return;
      }
      definirEnviado(true);
      definirValores({ email: '', senhaAtual: '', novaSenha: '', confirmacaoNovaSenha: '' });
      if (estaRecuperando) definirMensagem('Se houver uma conta elegível, enviaremos as instruções de recuperação por e-mail.');
      else {
        definirToken(null);
        navegar('/login?senha=alterada');
      }
    } catch { definirMensagem('Não foi possível concluir. Tente novamente.'); }
    finally { envioPendente.current = false; definirEnvio(false); }
  }
  const campos: Array<{ nome: keyof typeof valores; rotulo: string; tipo: string; preenchimento: string }> = estaRecuperando
    ? [{ nome: 'email', rotulo: 'E-mail', tipo: 'email', preenchimento: 'username' }]
    : [...(exigeSenhaAtual ? [{ nome: 'senhaAtual' as const, rotulo: finalidade === 'primeiro' ? 'Senha temporária' : 'Senha atual', tipo: 'password', preenchimento: 'current-password' }] : []),
      { nome: 'novaSenha', rotulo: 'Nova senha', tipo: 'password', preenchimento: 'new-password' },
      { nome: 'confirmacaoNovaSenha', rotulo: 'Confirmar nova senha', tipo: 'password', preenchimento: 'new-password' }];
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100">
    <section className="w-full max-w-lg"><p className="text-cyan-300">Web Direito</p><h1 className="my-6 text-3xl font-bold">{titulo}</h1>
      {finalidade === 'primeiro' && <p className="mb-5">Substitua a senha temporária para acessar o sistema. Entre novamente após definir sua senha própria.</p>}
      {faltaToken ? <p role="alert">Link inválido, utilizado ou expirado. Solicite uma nova recuperação.</p> :
        <form onSubmit={enviar} noValidate aria-busy={estaEnviando}><fieldset disabled={estaEnviando || foiEnviado} className="space-y-5 rounded-xl bg-slate-900 p-6">
          <legend className="sr-only">{titulo}</legend>
          {campos.map((campo) => <div key={campo.nome}><label htmlFor={`senha-${campo.nome}`} className="mb-2 block">{campo.rotulo}</label>
            <input id={`senha-${campo.nome}`} name={campo.nome} type={campo.tipo} autoComplete={campo.preenchimento} required value={valores[campo.nome]}
              onChange={(evento) => definirValores({ ...valores, [campo.nome]: evento.target.value })}
              aria-invalid={!!erros[campo.nome]} aria-describedby={erros[campo.nome] ? `erro-${campo.nome}` : undefined}
              className="w-full rounded-lg border border-slate-600 bg-slate-950 p-3 focus:border-cyan-300" />
            {erros[campo.nome] && <p role="alert" id={`erro-${campo.nome}`} className="text-rose-300">{erros[campo.nome]}</p>}</div>)}
          {!estaRecuperando && <p>Use entre 12 e 128 caracteres. Todas as sessões serão encerradas após a troca.</p>}
          <button type="submit" className="rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950">{estaEnviando ? 'Enviando…' : titulo}</button>
        </fieldset></form>}
      {mensagem && <p role="status" className="my-5">{mensagem}</p>}
      <nav className="mt-6 flex gap-5"><a href="/login" className="text-cyan-300 underline">Voltar ao login</a>
        {finalidade === 'primeiro' && <button onClick={() => { void cliente.encerrarSessao().catch(() => definirMensagem('Não foi possível encerrar a sessão.')); }}>Sair</button>}
        {!estaRecuperando && <a href="/recuperar-senha" className="text-cyan-300 underline">Solicitar nova recuperação</a>}</nav>
    </section></main>;
}

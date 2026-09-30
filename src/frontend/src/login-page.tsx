import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ErroLogin } from './auth-client';
import { useAutenticacao } from './auth-context';

const observarMensagemDeLogin = (atualizar: () => void) => {
  window.addEventListener('popstate', atualizar);
  return () => window.removeEventListener('popstate', atualizar);
};

export function PaginaLogin() {
  const parametrosDaPagina = useSyncExternalStore(observarMensagemDeLogin, () => window.location.search);
  const [email, definirEmail] = useState('');
  const [senha, definirSenha] = useState('');
  const [errosDeValidacao, definirErrosDeValidacao] = useState<{ email?: string; senha?: string }>({});
  const [mensagem, definirMensagem] = useState<string | null>(null);
  const [estaAutenticando, definirAutenticacaoEmAndamento] = useState(false);
  const { cliente, identidade } = useAutenticacao();
  const possuiEnvioPendente = useRef(false);

  async function tratarSolicitacaoDeLogin(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (possuiEnvioPendente.current) return;
    const emailNormalizado = email.trim().toLowerCase();
    const errosDasCredenciais: typeof errosDeValidacao = {};
    if (emailNormalizado.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) errosDasCredenciais.email = 'Informe um e-mail válido.';
    if (!senha || Array.from(senha).length > 128) errosDasCredenciais.senha = 'Informe sua senha com até 128 caracteres.';
    definirErrosDeValidacao(errosDasCredenciais);
    definirMensagem(null);
    if (Object.keys(errosDasCredenciais).length) {
      document.getElementById(errosDasCredenciais.email ? 'login-email' : 'login-password')?.focus();
      return;
    }
    possuiEnvioPendente.current = true;
    definirAutenticacaoEmAndamento(true);
    try {
      await cliente.autenticarUsuario(emailNormalizado, senha);
      definirSenha('');
    } catch (erro) {
      const situacao = erro instanceof ErroLogin ? erro.situacao : 500;
      if (situacao === 401) {
        definirMensagem('Não foi possível entrar. Confira suas credenciais.');
      } else if (situacao === 429) {
        definirMensagem('Muitas tentativas. Aguarde antes de tentar novamente.');
      } else if (situacao === 409) {
        definirMensagem('A seleção entre escritórios ainda não está disponível.');
      } else if (situacao === 400) {
        definirMensagem('Confira o e-mail e a senha informados.');
      } else {
        definirMensagem('Não foi possível entrar. Tente novamente em instantes.');
      }
    } finally {
      possuiEnvioPendente.current = false;
      definirAutenticacaoEmAndamento(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <section className="w-full max-w-lg" aria-labelledby="login-title">
        <a href="/" className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300 focus-visible:outline focus-visible:outline-cyan-300">Legal System</a>
        <h1 id="login-title" className="mt-6 text-3xl font-bold">{identidade ? 'Sessão autenticada' : 'Entre no seu escritório'}</h1>
        {parametrosDaPagina === '?senha=alterada' && <p role="status" className="mt-5 text-cyan-300">Senha alterada. Entre novamente com sua nova senha.</p>}
        {identidade ? (
          <div role="status" className="mt-8 space-y-4 rounded-xl border border-cyan-300/30 bg-slate-900 p-6">
            <h2 className="text-2xl text-cyan-300">Olá, {identidade.usuario.nome}</h2>
            <p>Escritório: <strong>{identidade.escritorio.nome}</strong></p>
            <p>Papel: <strong>{identidade.escritorio.papel}</strong></p>
            <p className="text-sm leading-6 text-slate-300">Esta é uma área autenticada provisória.</p>
            <a href="/seguranca" className="block text-cyan-300 underline">Segurança e alteração de senha</a>
            <button type="button" onClick={() => {
              void cliente.encerrarSessao().catch(() => definirMensagem('Não foi possível encerrar a sessão no servidor. Tente novamente.'));
            }} className="rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950">Sair</button>
          </div>
        ) : (
          <form noValidate onSubmit={tratarSolicitacaoDeLogin} aria-busy={estaAutenticando} className="mt-8">
            <a href="/recuperar-senha" className="mb-5 block text-cyan-300 underline">Esqueci minha senha</a>
            <fieldset disabled={estaAutenticando} className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
              <legend className="sr-only">Dados de acesso</legend>
              <div>
                <label htmlFor="login-email" className="mb-2 block font-semibold">E-mail</label>
                <input id="login-email" name="email" type="email" autoComplete="username" required value={email}
                  onChange={(evento) => definirEmail(evento.target.value)} aria-invalid={!!errosDeValidacao.email} aria-describedby={errosDeValidacao.email ? 'login-email-error' : undefined}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30" />
                {errosDeValidacao.email && <p id="login-email-error" role="alert" className="mt-2 text-sm text-rose-300">{errosDeValidacao.email}</p>}
              </div>
              <div>
                <label htmlFor="login-password" className="mb-2 block font-semibold">Senha</label>
                <input id="login-password" name="password" type="password" autoComplete="current-password" required value={senha}
                  onChange={(evento) => definirSenha(evento.target.value)} aria-invalid={!!errosDeValidacao.senha} aria-describedby={errosDeValidacao.senha ? 'login-password-error' : undefined}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30" />
                {errosDeValidacao.senha && <p id="login-password-error" role="alert" className="mt-2 text-sm text-rose-300">{errosDeValidacao.senha}</p>}
              </div>
              {mensagem && <p role="alert" className="text-sm text-rose-300">{mensagem}</p>}
              <button type="submit" disabled={estaAutenticando} className="w-full rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-cyan-300 disabled:cursor-wait disabled:opacity-60">
                {estaAutenticando ? 'Entrando…' : 'Entrar'}
              </button>
            </fieldset>
            <p className="mt-6 text-center text-slate-300">Ainda não tem escritório? <a href="/register" className="text-cyan-300 underline underline-offset-4">Criar escritório</a></p>
          </form>
        )}
      </section>
    </main>
  );
}

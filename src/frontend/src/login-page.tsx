import { useRef, useState, type FormEvent } from 'react';

interface Identity {
  user: { id: string; name: string; email: string };
  office: { id: string; name: string; role: 'OWNER' };
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const accessToken = useRef<string | null>(null);
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const normalizedEmail = email.trim().toLowerCase();
    const invalid: typeof errors = {};
    if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) invalid.email = 'Informe um e-mail válido.';
    if (!password || Array.from(password).length > 128) invalid.password = 'Informe sua senha com até 128 caracteres.';
    setErrors(invalid);
    setMessage(null);
    if (Object.keys(invalid).length) {
      document.getElementById(invalid.email ? 'login-email' : 'login-password')?.focus();
      return;
    }
    pending.current = true;
    setLoading(true);
    accessToken.current = null;
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      if (response.status === 401) {
        setMessage('Não foi possível entrar. Confira suas credenciais.');
      } else if (response.status === 429) {
        setMessage('Muitas tentativas. Aguarde antes de tentar novamente.');
      } else if (response.status === 409) {
        setMessage('A seleção entre escritórios ainda não está disponível.');
      } else if (response.status === 400) {
        setMessage('Confira o e-mail e a senha informados.');
      } else if (response.status !== 200) {
        setMessage('Não foi possível entrar. Tente novamente em instantes.');
      } else {
        const result: { accessToken?: unknown } = await response.json();
        if (typeof result.accessToken !== 'string') throw new Error('Invalid login response');
        accessToken.current = result.accessToken;
        const me = await fetch('/api/v1/auth/me', {
          credentials: 'include', headers: { Authorization: `Bearer ${accessToken.current}` },
        });
        if (me.status !== 200) throw new Error('Identity unavailable');
        const current: Identity = await me.json();
        if (typeof current.user?.name !== 'string' || typeof current.office?.name !== 'string' || current.office.role !== 'OWNER') {
          throw new Error('Invalid identity response');
        }
        setPassword('');
        setIdentity(current);
      }
    } catch {
      accessToken.current = null;
      setMessage('Não foi possível entrar. Tente novamente em instantes.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <section className="w-full max-w-lg" aria-labelledby="login-title">
        <a href="/" className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300 focus-visible:outline focus-visible:outline-cyan-300">Legal System</a>
        <h1 id="login-title" className="mt-6 text-3xl font-bold">{identity ? 'Sessão autenticada' : 'Entre no seu escritório'}</h1>
        {identity ? (
          <div role="status" className="mt-8 space-y-4 rounded-xl border border-cyan-300/30 bg-slate-900 p-6">
            <h2 className="text-2xl text-cyan-300">Olá, {identity.user.name}</h2>
            <p>Escritório: <strong>{identity.office.name}</strong></p>
            <p>Papel: <strong>{identity.office.role}</strong></p>
            <p className="text-sm leading-6 text-slate-300">Esta é uma área autenticada provisória. O logout será implementado posteriormente.</p>
            <p className="text-sm leading-6 text-slate-300">Ao atualizar esta página, será necessário entrar novamente até a renovação de sessão estar disponível.</p>
          </div>
        ) : (
          <form noValidate onSubmit={submit} aria-busy={loading} className="mt-8">
            <fieldset disabled={loading} className="space-y-5 rounded-xl border border-slate-800 bg-slate-900/70 p-6">
              <legend className="sr-only">Dados de acesso</legend>
              <div>
                <label htmlFor="login-email" className="mb-2 block font-semibold">E-mail</label>
                <input id="login-email" name="email" type="email" autoComplete="username" required value={email}
                  onChange={(event) => setEmail(event.target.value)} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'login-email-error' : undefined}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30" />
                {errors.email && <p id="login-email-error" role="alert" className="mt-2 text-sm text-rose-300">{errors.email}</p>}
              </div>
              <div>
                <label htmlFor="login-password" className="mb-2 block font-semibold">Senha</label>
                <input id="login-password" name="password" type="password" autoComplete="current-password" required value={password}
                  onChange={(event) => setPassword(event.target.value)} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'login-password-error' : undefined}
                  className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30" />
                {errors.password && <p id="login-password-error" role="alert" className="mt-2 text-sm text-rose-300">{errors.password}</p>}
              </div>
              {message && <p role="alert" className="text-sm text-rose-300">{message}</p>}
              <button type="submit" disabled={loading} className="w-full rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 focus-visible:outline focus-visible:outline-offset-4 focus-visible:outline-cyan-300 disabled:cursor-wait disabled:opacity-60">
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </fieldset>
            <p className="mt-6 text-center text-slate-300">Ainda não tem escritório? <a href="/register" className="text-cyan-300 underline underline-offset-4">Criar escritório</a></p>
          </form>
        )}
      </section>
    </main>
  );
}

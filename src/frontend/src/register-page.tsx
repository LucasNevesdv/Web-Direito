import { useRef, useState, type FormEvent } from 'react';

interface CamposDoCadastro {
  nomeEscritorio: string;
  nomeAdministrador: string;
  email: string;
  senha: string;
  confirmacaoSenha: string;
}

type NomeCampoDoCadastro = keyof CamposDoCadastro;
type ErrosDeValidacaoDoCadastro = Partial<Record<NomeCampoDoCadastro, string>>;

const FORMULARIO_VAZIO: CamposDoCadastro = {
  nomeEscritorio: '',
  nomeAdministrador: '',
  email: '',
  senha: '',
  confirmacaoSenha: '',
};

const MENSAGENS_CAMPOS: Record<NomeCampoDoCadastro, string> = {
  nomeEscritorio: 'Informe um nome de escritório entre 2 e 120 caracteres.',
  nomeAdministrador: 'Informe um nome de administrador entre 2 e 120 caracteres.',
  email: 'Informe um e-mail válido com até 254 caracteres.',
  senha: 'A senha deve ter entre 12 e 128 caracteres.',
  confirmacaoSenha: 'As senhas devem ser iguais.',
};

const CAMPOS: {
  nome: NomeCampoDoCadastro;
  rotulo: string;
  tipo: 'text' | 'email' | 'password';
  autoComplete: string;
}[] = [
  { nome: 'nomeEscritorio', rotulo: 'Nome do escritório', tipo: 'text', autoComplete: 'organization' },
  { nome: 'nomeAdministrador', rotulo: 'Nome do administrador', tipo: 'text', autoComplete: 'name' },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email', autoComplete: 'email' },
  { nome: 'senha', rotulo: 'Senha', tipo: 'password', autoComplete: 'new-password' },
  {
    nome: 'confirmacaoSenha',
    rotulo: 'Confirme a senha',
    tipo: 'password',
    autoComplete: 'new-password',
  },
];

function validarCamposDoCadastro(camposDoCadastro: CamposDoCadastro): ErrosDeValidacaoDoCadastro {
  const errosDeValidacao: ErrosDeValidacaoDoCadastro = {};

  for (const nome of ['nomeEscritorio', 'nomeAdministrador'] as const) {
    const tamanho = Array.from(camposDoCadastro[nome].trim()).length;
    if (tamanho < 2 || tamanho > 120) errosDeValidacao[nome] = MENSAGENS_CAMPOS[nome];
  }

  const email = camposDoCadastro.email.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errosDeValidacao.email = MENSAGENS_CAMPOS.email;
  }

  const tamanhoSenha = Array.from(camposDoCadastro.senha).length;
  if (tamanhoSenha < 12 || tamanhoSenha > 128) errosDeValidacao.senha = MENSAGENS_CAMPOS.senha;

  if (!camposDoCadastro.confirmacaoSenha || camposDoCadastro.confirmacaoSenha !== camposDoCadastro.senha) {
    errosDeValidacao.confirmacaoSenha = MENSAGENS_CAMPOS.confirmacaoSenha;
  }

  return errosDeValidacao;
}

function focarCampo(nome: string) {
  document.getElementById(`register-${nome}`)?.focus();
}

function extrairErrosDeValidacaoDaResposta(corpo: unknown): ErrosDeValidacaoDoCadastro {
  if (!corpo || typeof corpo !== 'object' || !('campos' in corpo)) return {};
  if (!corpo.campos || typeof corpo.campos !== 'object') return {};

  const errosDeValidacao: ErrosDeValidacaoDoCadastro = {};
  for (const nome of ['nomeEscritorio', 'nomeAdministrador', 'email', 'senha'] as const) {
    if (nome in corpo.campos) errosDeValidacao[nome] = MENSAGENS_CAMPOS[nome];
  }
  return errosDeValidacao;
}

export function PaginaCadastro() {
  const [camposDoCadastro, definirCamposDoCadastro] = useState<CamposDoCadastro>(FORMULARIO_VAZIO);
  const [errosDeValidacao, definirErrosDeValidacao] = useState<ErrosDeValidacaoDoCadastro>({});
  const [erroGeral, definirErroGeral] = useState<string | null>(null);
  const [estaEnviandoCadastro, definirEnvioDoCadastro] = useState(false);
  const [foiCadastrado, definirCadastroConcluido] = useState(false);
  const possuiEnvioPendente = useRef(false);

  async function tratarEnvioDoCadastro(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (possuiEnvioPendente.current) return;

    const errosValidacao = validarCamposDoCadastro(camposDoCadastro);
    definirErrosDeValidacao(errosValidacao);
    definirErroGeral(null);

    const primeiroCampoInvalido = Object.keys(errosValidacao)[0];
    if (primeiroCampoInvalido) {
      focarCampo(primeiroCampoInvalido);
      return;
    }

    possuiEnvioPendente.current = true;
    definirEnvioDoCadastro(true);

    try {
      const resposta = await fetch('/api/v1/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nomeEscritorio: camposDoCadastro.nomeEscritorio.trim(),
          nomeAdministrador: camposDoCadastro.nomeAdministrador.trim(),
          email: camposDoCadastro.email.trim().toLowerCase(),
          senha: camposDoCadastro.senha,
        }),
      });

      if (resposta.status === 201) {
        definirCamposDoCadastro((anterior) => ({ ...anterior, senha: '', confirmacaoSenha: '' }));
        definirCadastroConcluido(true);
      } else if (resposta.status === 409) {
        definirErrosDeValidacao({ email: 'Este e-mail já está cadastrado. Use outro e-mail.' });
        focarCampo('email');
      } else if (resposta.status === 400) {
        const corpo: unknown = await resposta.json().catch(() => null);
        const errosCampos = extrairErrosDeValidacaoDaResposta(corpo);
        definirErrosDeValidacao(errosCampos);
        definirErroGeral('Não foi possível validar o cadastro. Revise os dados informados.');
      } else {
        definirErroGeral('Não foi possível criar o escritório. Tente novamente em instantes.');
      }
    } catch {
      definirErroGeral('Não foi possível criar o escritório. Tente novamente em instantes.');
    } finally {
      possuiEnvioPendente.current = false;
      definirEnvioDoCadastro(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100 sm:px-6 sm:py-16">
      <section className="w-full max-w-2xl" aria-labelledby="register-title">
        <a
          href="/"
          className="inline-block text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
        >
          Legal System
        </a>
        <h1 id="register-title" className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
          Crie seu escritório
        </h1>
        <p className="mt-3 text-base leading-7 text-slate-300">
          Cadastre o escritório e seu primeiro administrador em uma única etapa.
        </p>

        {foiCadastrado ? (
          <div role="status" className="mt-8 rounded-xl border border-cyan-300/30 bg-slate-900 p-6">
            <h2 className="text-2xl font-semibold text-cyan-300">Escritório criado com sucesso</h2>
            <p className="mt-3 leading-7 text-slate-300">
              O escritório e seu administrador foram cadastrados. Entre para acessar seu escritório.
            </p>
            <a className="mt-5 inline-block text-cyan-300 underline underline-offset-4" href="/login">
              Ir para o login
            </a>
          </div>
        ) : (
          <form onSubmit={tratarEnvioDoCadastro} noValidate aria-busy={estaEnviandoCadastro} className="mt-8">
            <fieldset disabled={estaEnviandoCadastro} className="min-w-0 space-y-5 rounded-xl border border-slate-800 bg-slate-900/70 p-5 sm:p-8">
              <legend className="sr-only">Dados do escritório e do administrador</legend>
              {CAMPOS.map(({ nome, rotulo, tipo, autoComplete }) => (
                <div key={nome}>
                  <label htmlFor={`register-${nome}`} className="mb-2 block text-sm font-semibold text-slate-100">
                    {rotulo}
                  </label>
                  <input
                    id={`register-${nome}`}
                    name={nome}
                    type={tipo}
                    autoComplete={autoComplete}
                    required
                    value={camposDoCadastro[nome]}
                    aria-invalid={errosDeValidacao[nome] ? true : undefined}
                    aria-describedby={[
                      nome === 'senha' ? 'password-hint' : '',
                      errosDeValidacao[nome] ? `${nome}-error` : '',
                    ].filter(Boolean).join(' ') || undefined}
                    onChange={(evento) => {
                      definirCamposDoCadastro((anterior) => ({ ...anterior, [nome]: evento.target.value }));
                      definirErrosDeValidacao((anterior) => ({ ...anterior, [nome]: undefined }));
                    }}
                    className="block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-base text-slate-100 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30 disabled:opacity-60 aria-[invalid=true]:border-rose-400"
                  />
                  {nome === 'senha' && (
                    <p id="password-hint" className="mt-2 text-sm text-slate-400">
                      Use entre 12 e 128 caracteres.
                    </p>
                  )}
                  {errosDeValidacao[nome] && (
                    <p id={`${nome}-error`} role="alert" className="mt-2 text-sm text-rose-300">
                      {errosDeValidacao[nome]}
                    </p>
                  )}
                </div>
              ))}
              {erroGeral && <p role="alert" className="text-sm leading-6 text-rose-300">{erroGeral}</p>}
              <button
                type="submit"
                disabled={estaEnviandoCadastro}
                className="w-full rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 disabled:cursor-wait disabled:opacity-60"
              >
                {estaEnviandoCadastro ? 'Criando escritório…' : 'Criar escritório'}
              </button>
              <p className="text-center text-sm leading-6 text-slate-400">
                O administrador terá acesso completo ao escritório.
              </p>
            </fieldset>
          </form>
        )}
      </section>
    </main>
  );
}

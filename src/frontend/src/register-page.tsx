import { useRef, useState, type FormEvent } from 'react';

interface FormValues {
  officeName: string;
  adminName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
}

type FieldName = keyof FormValues;
type FieldErrors = Partial<Record<FieldName, string>>;

const emptyForm: FormValues = {
  officeName: '',
  adminName: '',
  email: '',
  password: '',
  passwordConfirmation: '',
};

const fieldMessages: Record<FieldName, string> = {
  officeName: 'Informe um nome de escritório entre 2 e 120 caracteres.',
  adminName: 'Informe um nome de administrador entre 2 e 120 caracteres.',
  email: 'Informe um e-mail válido com até 254 caracteres.',
  password: 'A senha deve ter entre 12 e 128 caracteres.',
  passwordConfirmation: 'As senhas devem ser iguais.',
};

const fields: {
  name: FieldName;
  label: string;
  type: 'text' | 'email' | 'password';
  autoComplete: string;
}[] = [
  { name: 'officeName', label: 'Nome do escritório', type: 'text', autoComplete: 'organization' },
  { name: 'adminName', label: 'Nome do administrador', type: 'text', autoComplete: 'name' },
  { name: 'email', label: 'E-mail', type: 'email', autoComplete: 'email' },
  { name: 'password', label: 'Senha', type: 'password', autoComplete: 'new-password' },
  {
    name: 'passwordConfirmation',
    label: 'Confirme a senha',
    type: 'password',
    autoComplete: 'new-password',
  },
];

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};

  for (const name of ['officeName', 'adminName'] as const) {
    const length = Array.from(values[name].trim()).length;
    if (length < 2 || length > 120) errors[name] = fieldMessages[name];
  }

  const email = values.email.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = fieldMessages.email;
  }

  const passwordLength = Array.from(values.password).length;
  if (passwordLength < 12 || passwordLength > 128) errors.password = fieldMessages.password;

  if (!values.passwordConfirmation || values.passwordConfirmation !== values.password) {
    errors.passwordConfirmation = fieldMessages.passwordConfirmation;
  }

  return errors;
}

function focusField(name: string) {
  document.getElementById(`register-${name}`)?.focus();
}

function serverFieldErrors(body: unknown): FieldErrors {
  if (!body || typeof body !== 'object' || !('fields' in body)) return {};
  if (!body.fields || typeof body.fields !== 'object') return {};

  const errors: FieldErrors = {};
  for (const name of ['officeName', 'adminName', 'email', 'password'] as const) {
    if (name in body.fields) errors[name] = fieldMessages[name];
  }
  return errors;
}

export function RegisterPage() {
  const [values, setValues] = useState<FormValues>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const submissionInProgress = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionInProgress.current) return;

    const validationErrors = validate(values);
    setErrors(validationErrors);
    setGeneralError(null);

    const firstInvalidField = Object.keys(validationErrors)[0];
    if (firstInvalidField) {
      focusField(firstInvalidField);
      return;
    }

    submissionInProgress.current = true;
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/v1/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          officeName: values.officeName.trim(),
          adminName: values.adminName.trim(),
          email: values.email.trim().toLowerCase(),
          password: values.password,
        }),
      });

      if (response.status === 201) {
        setValues((previous) => ({ ...previous, password: '', passwordConfirmation: '' }));
        setIsRegistered(true);
      } else if (response.status === 409) {
        setErrors({ email: 'Este e-mail já está cadastrado. Use outro e-mail.' });
        focusField('email');
      } else if (response.status === 400) {
        const body: unknown = await response.json().catch(() => null);
        const fieldErrors = serverFieldErrors(body);
        setErrors(fieldErrors);
        setGeneralError('Não foi possível validar o cadastro. Revise os dados informados.');
      } else {
        setGeneralError('Não foi possível criar o escritório. Tente novamente em instantes.');
      }
    } catch {
      setGeneralError('Não foi possível criar o escritório. Tente novamente em instantes.');
    } finally {
      submissionInProgress.current = false;
      setIsSubmitting(false);
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

        {isRegistered ? (
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
          <form onSubmit={handleSubmit} noValidate aria-busy={isSubmitting} className="mt-8">
            <fieldset disabled={isSubmitting} className="min-w-0 space-y-5 rounded-xl border border-slate-800 bg-slate-900/70 p-5 sm:p-8">
              <legend className="sr-only">Dados do escritório e do administrador</legend>
              {fields.map(({ name, label, type, autoComplete }) => (
                <div key={name}>
                  <label htmlFor={`register-${name}`} className="mb-2 block text-sm font-semibold text-slate-100">
                    {label}
                  </label>
                  <input
                    id={`register-${name}`}
                    name={name}
                    type={type}
                    autoComplete={autoComplete}
                    required
                    value={values[name]}
                    aria-invalid={errors[name] ? true : undefined}
                    aria-describedby={[
                      name === 'password' ? 'password-hint' : '',
                      errors[name] ? `${name}-error` : '',
                    ].filter(Boolean).join(' ') || undefined}
                    onChange={(event) => {
                      setValues((previous) => ({ ...previous, [name]: event.target.value }));
                      setErrors((previous) => ({ ...previous, [name]: undefined }));
                    }}
                    className="block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-base text-slate-100 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/30 disabled:opacity-60 aria-[invalid=true]:border-rose-400"
                  />
                  {name === 'password' && (
                    <p id="password-hint" className="mt-2 text-sm text-slate-400">
                      Use entre 12 e 128 caracteres.
                    </p>
                  )}
                  {errors[name] && (
                    <p id={`${name}-error`} role="alert" className="mt-2 text-sm text-rose-300">
                      {errors[name]}
                    </p>
                  )}
                </div>
              ))}
              {generalError && <p role="alert" className="text-sm leading-6 text-rose-300">{generalError}</p>}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-cyan-300 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 disabled:cursor-wait disabled:opacity-60"
              >
                {isSubmitting ? 'Criando escritório…' : 'Criar escritório'}
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

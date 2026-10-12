// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClienteAutenticacao } from '../../shared/auth/auth-client';
import { ProvedorAutenticacao } from '../../shared/auth/auth-context';
import { PaginaEquipe } from './team-page';
import { Aplicacao } from '../../app';

const requisicao = vi.fn<typeof fetch>();
const permissoes = ['EQUIPE_VISUALIZAR', 'EQUIPE_CADASTRAR_USUARIO', 'EQUIPE_ALTERAR_USUARIO', 'EQUIPE_DEFINIR_PERMISSOES', 'EQUIPE_ATIVAR_INATIVAR_USUARIO'];
const identidade = { usuario: { id: 'proprietario', nome: 'Maria', email: 'maria@example.test' }, escritorio: { id: 'escritorio', nome: 'Escritório', papel: 'PROPRIETARIO' } };
const membro = { id: 'vinculo', idUsuario: 'pessoa', nome: 'Ana', email: 'ana@example.test', papel: 'ADVOGADO', permissoes: [], estaAtivo: true, deveAlterarSenha: true, criadoEm: '2026-09-30T12:00:00Z', versao: 2 };
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
let cliente: ClienteAutenticacao;
let configuracao: { permissoes: string[]; papeis: { papel: string; permissoesPadrao: string[]; permissoesPermitidas: string[] }[] };
let usuarios: typeof membro[], total: number;
beforeEach(async () => {
  window.history.replaceState(null, '', '/equipe'); localStorage.clear(); sessionStorage.clear();
  requisicao.mockReset(); vi.stubGlobal('fetch', requisicao);
  cliente = new ClienteAutenticacao(requisicao);
  requisicao.mockResolvedValueOnce(resposta({}, 401)); await cliente.restaurarSessao();
  requisicao.mockResolvedValueOnce(resposta({ tokenAcesso: 'token-isolado', expiraEmSegundos: 900 })).mockResolvedValueOnce(resposta(identidade));
  await cliente.autenticarUsuario('maria@example.test', 'senha de teste');
  configuracao = { permissoes: [...permissoes], papeis: ['ADMINISTRADOR', 'ADVOGADO', 'ESTAGIARIO', 'SECRETARIO'].map((papel) => ({ papel, permissoesPadrao: papel === 'ADMINISTRADOR' ? [...permissoes] : [], permissoesPermitidas: papel === 'ADMINISTRADOR' ? [...permissoes] : ['EQUIPE_VISUALIZAR'] })) };
  usuarios = [{ ...membro }]; total = 1;
  requisicao.mockReset().mockImplementation(async (url) => {
    if (String(url).endsWith('/configuracao')) return resposta(configuracao);
    if (String(url).includes('?pagina=')) return resposta({ usuarios, total });
    if (String(url).endsWith('/me')) return resposta(identidade);
    return resposta(membro);
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function abrir() { render(<ProvedorAutenticacao cliente={cliente}><PaginaEquipe /></ProvedorAutenticacao>); await screen.findByText('Ana'); }
function preencher() {
  fireEvent.click(screen.getByRole('button', { name: 'Novo usuário' }));
  for (const [rotulo, valor] of [['Nome', 'Bruna'], ['E-mail utilizado como login', 'BRUNA@EXAMPLE.TEST'], ['Senha temporária', 'senha temporária segura'], ['Confirmar senha temporária', 'senha temporária segura']]) {
    fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
  }
}
const formulario = () => screen.getByRole('button', { name: 'Salvar usuário' }).closest('form')!;
describe('gestão da equipe no frontend', () => {
  it('mostra estado, primeiro acesso, data e pesquisa paginada', async () => {
    total = 21; await abrir(); expect(screen.getByText('Pendente')).toBeTruthy(); expect(screen.getByText('Ativo')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(requisicao.mock.calls.some(([url]) => String(url).includes('pagina=2'))).toBe(true));
    fireEvent.change(screen.getByLabelText('Pesquisar por nome ou e-mail'), { target: { value: ' Ana ' } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Pesquisar' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Pesquisar' }));
    await waitFor(() => expect(requisicao.mock.calls.some(([url]) => String(url).includes('pagina=1&tamanhoPagina=10&pesquisa=Ana'))).toBe(true));
  });
  it('mostra loading e resultado vazio', async () => {
    usuarios = []; render(<ProvedorAutenticacao cliente={cliente}><PaginaEquipe /></ProvedorAutenticacao>);
    expect(screen.getByText('Carregando equipe…')).toBeTruthy(); expect(await screen.findByText('Nenhum usuário encontrado.')).toBeTruthy();
  });
  it('preenche padrões por papel sem permitir proprietário', async () => {
    await abrir(); preencher(); expect(screen.queryByRole('option', { name: 'Proprietário' })).toBeNull();
    expect(screen.getAllByRole('checkbox').every((campo) => !(campo as HTMLInputElement).checked)).toBe(true);
    fireEvent.change(screen.getByLabelText('Papel'), { target: { value: 'ADMINISTRADOR' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(5); expect(screen.getAllByRole('checkbox').every((campo) => (campo as HTMLInputElement).checked)).toBe(true);
    fireEvent.change(screen.getByLabelText('Papel'), { target: { value: 'ESTAGIARIO' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1); expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });
  it('envia contrato correto, limpa imediatamente senhas e impede duplicidade', async () => {
    await abrir(); preencher(); let concluir!: (r: Response) => void;
    requisicao.mockReturnValueOnce(new Promise((resolver) => { concluir = resolver; }));
    const form = formulario(); fireEvent.submit(form); fireEvent.submit(form);
    await waitFor(() => expect(requisicao.mock.calls.filter(([, opcoes]) => opcoes?.method === 'POST')).toHaveLength(1));
    const corpo = JSON.parse(requisicao.mock.calls.find(([, opcoes]) => opcoes?.method === 'POST')![1]!.body as string);
    expect(corpo).toEqual({ nome: 'Bruna', email: 'bruna@example.test', papel: 'ADVOGADO', permissoes: [], senhaTemporaria: 'senha temporária segura', confirmacaoSenhaTemporaria: 'senha temporária segura' });
    expect((screen.getByLabelText('Senha temporária') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Confirmar senha temporária') as HTMLInputElement).value).toBe('');
    expect(localStorage.length + sessionStorage.length).toBe(0);
    concluir(resposta(membro, 201)); expect(await screen.findByText(/Usuário cadastrado/)).toBeTruthy();
  });
  it('permite mostrar e ocultar senha com autocomplete adequado', async () => {
    await abrir(); preencher(); const campo = screen.getByLabelText('Senha temporária');
    expect(campo.getAttribute('autocomplete')).toBe('new-password'); expect(campo.getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' })); expect(campo.getAttribute('type')).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' })); expect(campo.getAttribute('type')).toBe('password');
  });
  it('valida política e confirmação antes de enviar', async () => {
    await abrir(); preencher(); fireEvent.change(screen.getByLabelText('Senha temporária'), { target: { value: 'curta' } });
    fireEvent.submit(formulario()); expect(screen.getByRole('alert').textContent).toContain('12 e 128');
    expect(requisicao.mock.calls.filter(([, opcoes]) => opcoes?.method === 'POST')).toHaveLength(0);
  });
  it('exige confirmação explícita de conta existente e não reenvia senha', async () => {
    await abrir(); preencher(); requisicao.mockResolvedValueOnce(resposta({ erro: 'CONTA_EXISTENTE' }, 409)); fireEvent.submit(formulario());
    const dialogo = await screen.findByRole('alertdialog'); expect(dialogo.textContent).toContain('senha atual');
    expect(requisicao.mock.calls.filter(([, opcoes]) => opcoes?.method === 'POST')).toHaveLength(1);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar' }));
    await screen.findByText('Vínculo criado. A conta utilizará sua senha atual.');
    const chamada = requisicao.mock.calls.find(([url]) => String(url).endsWith('/confirmar-vinculo'))!;
    expect(JSON.parse(chamada[1]!.body as string)).toEqual({ email: 'bruna@example.test', papel: 'ADVOGADO', permissoes: [], confirmacaoVinculo: true });
  });
  it('confirma edição e envia versão sem email, nome ou senha', async () => {
    await abrir(); fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.queryByLabelText('E-mail utilizado como login')).toBeNull(); fireEvent.submit(formulario());
    expect(requisicao.mock.calls.filter(([, opcoes]) => opcoes?.method === 'PATCH')).toHaveLength(0);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirmar' }));
    await screen.findByText(/Papel e permissões atualizados/);
    expect(JSON.parse(requisicao.mock.calls.find(([, opcoes]) => opcoes?.method === 'PATCH')![1]!.body as string)).toEqual({ papel: 'ADVOGADO', permissoes: [], versao: 2 });
  });
  it.each([true, false])('confirma alteração de estado ativo=%s', async (ativo) => {
    usuarios[0].estaAtivo = ativo; await abrir(); fireEvent.click(screen.getByRole('button', { name: ativo ? 'Inativar' : 'Reativar' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(requisicao.mock.calls.some(([url]) => String(url).endsWith(ativo ? '/inativar' : '/ativar'))).toBe(true));
  });
  it('oculta ações administrativas de quem só pode visualizar', async () => {
    configuracao = { permissoes: ['EQUIPE_VISUALIZAR'], papeis: [] }; await abrir();
    for (const name of ['Novo usuário', 'Editar', 'Inativar']) expect(screen.queryByRole('button', { name })).toBeNull();
  });
  it('mostra erros do backend e recupera botão de envio', async () => {
    await abrir(); preencher(); requisicao.mockResolvedValueOnce(resposta({ mensagem: 'Vínculo já existente.' }, 409)); fireEvent.submit(formulario());
    expect((await screen.findByRole('alert')).textContent).toBe('Vínculo já existente.'); expect(screen.getByRole('button', { name: 'Salvar usuário' })).toBeTruthy();
  });
  it('bloqueia /equipe durante primeiro acesso e mostra senha temporária', async () => {
    requisicao.mockResolvedValueOnce(resposta({ tokenAcesso: 'token-restrito', expiraEmSegundos: 900 })).mockResolvedValueOnce(resposta({ ...identidade, deveAlterarSenha: true }));
    await cliente.autenticarUsuario('maria@example.test', 'senha temporária'); render(<Aplicacao cliente={cliente} />);
    expect(await screen.findByLabelText('Senha temporária')).toBeTruthy(); expect(window.location.pathname).toBe('/primeiro-acesso');
    expect(screen.queryByRole('heading', { name: 'Equipe' })).toBeNull();
  });
});

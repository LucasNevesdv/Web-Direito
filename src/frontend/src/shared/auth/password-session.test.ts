import { describe, expect, it, vi } from 'vitest';
import { ClienteAutenticacao } from './auth-client';
import type { CoordenadorSessao } from './session-coordinator';

const IDENTIDADE = { usuario: { id: 'usuario', nome: 'Pessoa', email: 'pessoa@example.test' }, escritorio: { id: 'escritorio', nome: 'Escritório', papel: 'PROPRIETARIO' } };
describe('troca de senha e sessão', () => {
  it('aguarda refresh e usa o mesmo lock, depois limpa memória e propaga logout', async () => {
    const coordenador: CoordenadorSessao = {
      podeRenovar: true, obterSessaoCompartilhada: () => null, sincronizarSessaoEntreAbas: async () => {},
      executarOperacaoExclusiva: vi.fn(async (executar) => executar()), compartilharCredenciaisDaSessao: vi.fn(),
      propagarInvalidacaoDaSessao: vi.fn(), observarMudancasDaSessao: () => () => {}, registrarAoExpirarSessao: () => {}, encerrarCoordenacao: () => {},
    };
    let resolverRenovacao!: (r: Response) => void;
    const requisicao = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (url === '/api/v1/auth/refresh') return new Promise((resolver) => { resolverRenovacao = resolver; });
      if (url === '/api/v1/auth/me') return new Response(JSON.stringify(IDENTIDADE));
      return new Response(JSON.stringify({ mensagem: 'Senha alterada.' }));
    });
    const novoLogin = vi.fn(), cliente = new ClienteAutenticacao(requisicao, novoLogin, coordenador);
    const renovacao = cliente.renovarSessao();
    await vi.waitFor(() => expect(resolverRenovacao).toBeTypeOf('function'));
    const troca = cliente.trocarSenha('/api/v1/auth/alterar-senha', { senhaAtual: 'anterior', novaSenha: 'nova', confirmacaoNovaSenha: 'nova' });
    await Promise.resolve(); expect(requisicao).toHaveBeenCalledTimes(1);
    resolverRenovacao(new Response(JSON.stringify({ ...IDENTIDADE, tokenAcesso: 'token-renovado', expiraEmSegundos: 900 })));
    await renovacao; expect((await troca).status).toBe(200);
    expect(coordenador.executarOperacaoExclusiva).toHaveBeenCalledTimes(2);
    expect(requisicao.mock.calls.at(-1)?.[1]?.headers).toMatchObject({ Authorization: 'Bearer token-renovado' });
    expect(coordenador.propagarInvalidacaoDaSessao).toHaveBeenCalledWith('sair');
    expect(cliente.obterEstadoDaAutenticacao().situacao).toBe('naoAutenticado'); expect(novoLogin).toHaveBeenCalledOnce();
  });
  it('redefinição pública não exige autenticação nem renova sessão', async () => {
    const requisicao = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'));
    const cliente = new ClienteAutenticacao(requisicao);
    await cliente.trocarSenha('/api/v1/auth/redefinir-senha', { token: 'temporario', novaSenha: 'nova', confirmacaoNovaSenha: 'nova' });
    expect(requisicao).toHaveBeenCalledTimes(1); expect(requisicao.mock.calls[0][0]).toBe('/api/v1/auth/redefinir-senha');
    expect(requisicao.mock.calls[0][1]?.headers).not.toHaveProperty('Authorization');
  });
  it('não desconecta ao receber erro de validação da senha', async () => {
    const novoLogin = vi.fn(), requisicao = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 400 }));
    const cliente = new ClienteAutenticacao(requisicao, novoLogin);
    expect((await cliente.trocarSenha('/api/v1/auth/redefinir-senha', {})).status).toBe(400); expect(novoLogin).not.toHaveBeenCalled();
  });
});

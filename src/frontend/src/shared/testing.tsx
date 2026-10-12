import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { ClienteAutenticacao } from './auth/auth-client';
import { ProvedorAutenticacao } from './auth/auth-context';

export const IDENTIDADE_TESTE = { usuario: { id: 'usuario-1', nome: 'Maria', email: 'maria@example.test' }, escritorio: { id: 'escritorio-1', nome: 'Escritório Teste', papel: 'ADVOGADO' } };
export const respostaJson = (corpo: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(corpo), { status });

// Cliente real autenticado sobre fetch simulado; cada teste define as respostas da API.
export async function criarClienteAutenticado(rotas: (url: string, opcoes?: RequestInit) => Response | Promise<Response>) {
  const requisicao = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', requisicao);
  const cliente = new ClienteAutenticacao(requisicao);
  requisicao.mockResolvedValueOnce(respostaJson({}, 401)); await cliente.restaurarSessao();
  requisicao.mockResolvedValueOnce(respostaJson({ tokenAcesso: 'token-teste', expiraEmSegundos: 900 })).mockResolvedValueOnce(respostaJson(IDENTIDADE_TESTE));
  await cliente.autenticarUsuario('maria@example.test', 'senha de teste');
  requisicao.mockReset().mockImplementation(async (url, opcoes) => String(url).endsWith('/me') ? respostaJson(IDENTIDADE_TESTE) : rotas(String(url), opcoes));
  return { cliente, requisicao };
}

export function renderizarComCliente(cliente: ClienteAutenticacao, elemento: ReactElement) {
  return render(<ProvedorAutenticacao cliente={cliente}>{elemento}</ProvedorAutenticacao>);
}

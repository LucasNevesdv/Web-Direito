import type { ClienteAutenticacao } from './auth/auth-client';

export interface RespostaApi<T> { ok: boolean; status: number; dados: T; mensagem: string }

const MENSAGEM_PADRAO = 'Não foi possível concluir. Tente novamente.';

export async function requisitarApi<T>(cliente: ClienteAutenticacao, caminho: string, opcoes: RequestInit & { json?: unknown } = {}): Promise<RespostaApi<T>> {
  const { json, ...restante } = opcoes;
  const resposta = await cliente.enviarRequisicaoAutenticada(caminho, json === undefined ? restante
    : { ...restante, headers: { 'Content-Type': 'application/json', ...restante.headers }, body: JSON.stringify(json) });
  const texto = resposta.status === 204 ? '' : await resposta.text();
  let dados: unknown = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = null; }
  const mensagem = resposta.ok ? '' : resposta.status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.'
    : (dados as { mensagem?: string } | null)?.mensagem ?? MENSAGEM_PADRAO;
  return { ok: resposta.ok, status: resposta.status, dados: dados as T, mensagem };
}

export async function baixarArquivo(cliente: ClienteAutenticacao, caminho: string, nomeArquivo: string): Promise<boolean> {
  const resposta = await cliente.enviarRequisicaoAutenticada(caminho);
  if (!resposta.ok) return false;
  const url = URL.createObjectURL(await resposta.blob());
  const ancora = Object.assign(document.createElement('a'), { href: url, download: nomeArquivo });
  document.body.append(ancora); ancora.click(); ancora.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export const dataBrasileira = (data: string | null) => data ? data.split('-').reverse().join('/') : '—';
export const dataHoraBrasileira = (data: string) => new Date(data).toLocaleString('pt-BR');

// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarClienteAutenticado, renderizarComCliente, respostaJson } from './testing';
import { SeletorVinculo, type Vinculo } from './link-picker';

function Campo() {
  const [valor, definirValor] = useState<Vinculo | null>(null);
  return <SeletorVinculo valor={valor} aoAlterar={definirValor} />;
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('busca compartilhada de vínculos', () => {
  it('limpa opções anteriores e descarta resposta atrasada de outro tipo', async () => {
    let terminar!: (r: Response) => void;
    const { cliente, requisicao } = await criarClienteAutenticado((url) => {
      if (url.includes('pesquisa=antiga')) return new Promise<Response>((resolve) => { terminar = resolve; });
      return respostaJson(url.includes('tipo=CLIENTE') ? [{ tipo: 'CLIENTE', id: 'c-1', rotulo: 'Cliente Maria' }]
        : [{ tipo: 'CASO', id: 'caso-1', rotulo: 'Caso atual' }]);
    });
    renderizarComCliente(cliente, <Campo />);
    fireEvent.change(screen.getByLabelText('Tipo de vínculo'), { target: { value: 'CLIENTE' } });
    await screen.findByRole('option', { name: 'Cliente Maria' });
    fireEvent.change(screen.getByLabelText('Pesquisar cliente'), { target: { value: 'antiga' } });
    expect(screen.queryByRole('option', { name: 'Cliente Maria' })).toBeNull();
    await waitFor(() => expect(requisicao.mock.calls.some(([u]) => String(u).includes('pesquisa=antiga'))).toBe(true));
    fireEvent.change(screen.getByLabelText('Tipo de vínculo'), { target: { value: 'CASO' } });
    await screen.findByRole('option', { name: 'Caso atual' });
    await act(async () => { terminar(respostaJson([{ tipo: 'CLIENTE', id: 'c-2', rotulo: 'Resposta antiga' }])); });
    expect(screen.queryByRole('option', { name: 'Resposta antiga' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Caso atual' })).toBeTruthy();
  });
  it('informa falha de autorização sem apresentar falso resultado vazio', async () => {
    const { cliente } = await criarClienteAutenticado(() => respostaJson({ mensagem: 'Acesso negado ao cadastro.' }, 403));
    renderizarComCliente(cliente, <Campo />);
    fireEvent.change(screen.getByLabelText('Tipo de vínculo'), { target: { value: 'CLIENTE' } });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Acesso negado ao cadastro.');
    expect(screen.queryByText(/Nenhum registro/)).toBeNull();
  });
  it('preserva vínculo restrito sem pesquisar nem exibir seu nome', async () => {
    const { cliente, requisicao } = await criarClienteAutenticado(() => respostaJson([], 200));
    renderizarComCliente(cliente, <SeletorVinculo valor={{ tipo: 'CLIENTE', id: 'c-1' }} aoAlterar={vi.fn()} desabilitado
      tiposPermitidos={[]} rotuloSelecionado="Vínculo com acesso restrito" />);
    expect(screen.getByRole('option', { name: 'Vínculo atual com acesso restrito' })).toBeTruthy();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(requisicao.mock.calls.some(([u]) => String(u).includes('/vinculos?'))).toBe(false);
  });
});

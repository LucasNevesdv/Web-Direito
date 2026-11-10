import { describe, expect, it, vi } from 'vitest';
import { podeVisualizarVinculo, tiposVinculoPermitidos } from '../src/application/links/link-policy.js';
import { GestaoTarefas } from '../src/application/tasks/manage-tasks.js';
import type { OperacoesTarefas, RepositorioTarefas } from '../src/application/tasks/task-contracts.js';

describe('autorização dos vínculos compartilhados', () => {
  it.each(['PROPRIETARIO', 'ADMINISTRADOR', 'ADVOGADO', 'ESTAGIARIO'] as const)('reutiliza leitura padrão do papel %s', (papel) => {
    expect(tiposVinculoPermitidos({ idUsuario: 'u', papel })).toEqual(['CLIENTE', 'CASO', 'PROCESSO']);
  });
  it('separa concessões de clientes e casos/processos para perfil restrito', () => {
    const autor = { idUsuario: 'u', papel: 'SECRETARIO' as const };
    expect(tiposVinculoPermitidos(autor)).toEqual([]);
    expect(tiposVinculoPermitidos({ ...autor, permissoes: ['CLIENTE_VISUALIZAR'] })).toEqual(['CLIENTE']);
    expect(tiposVinculoPermitidos({ ...autor, permissoes: ['CASO_VISUALIZAR'] })).toEqual(['CASO', 'PROCESSO']);
    expect(podeVisualizarVinculo({ ...autor, permissoes: ['CLIENTE_EDITAR'] }, 'CLIENTE')).toBe(false);
  });
  it('recusa a busca antes de acessar o resolvedor e usa as permissões atuais', async () => {
    const pesquisar = vi.fn(async () => []), autor = { idUsuario: 'u', papel: 'SECRETARIO' as const, permissoes: [] as string[] };
    const repo: RepositorioTarefas = { executar: async (_contexto, operacao) => operacao({ autor, vinculos: { pesquisar } } as unknown as OperacoesTarefas) };
    const gestao = new GestaoTarefas(repo, { validarTokenDeAcesso: async () => ({ idUsuario: 'u', idSessao: 's', idEscritorioAtivo: 'e', papel: 'PROPRIETARIO' }) },
      { fusoHorario: 'America/Sao_Paulo', diasPrazoCritico: 3 });
    await expect(gestao.pesquisarVinculos('token', 'CLIENTE', '')).rejects.toMatchObject({ situacao: 403 });
    expect(pesquisar).not.toHaveBeenCalled();
    autor.permissoes = ['CLIENTE_VISUALIZAR'];
    await gestao.pesquisarVinculos('token', 'CLIENTE', '  Maria ');
    expect(pesquisar).toHaveBeenCalledWith('CLIENTE', 'Maria', 20);
    autor.permissoes = [];
    await expect(gestao.pesquisarVinculos('token', 'CLIENTE', '')).rejects.toMatchObject({ situacao: 403 });
    expect(pesquisar).toHaveBeenCalledTimes(1);
  });
});

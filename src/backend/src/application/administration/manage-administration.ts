import type { TokensAcesso } from '../authentication/authentication-contracts.js';
import { Escritorio } from '../../domain/offices/office.js';
import { ErroEscritorioInvalido } from '../../domain/offices/invalid-office-error.js';
import type { AutorAdministracao, FiltroAuditoria, OperacoesAdministracao, RepositorioAdministracao } from './administration-contracts.js';

export class ErroAdministracao extends Error {
  readonly situacao: number;
  constructor(readonly codigo: 'PROIBIDO' | 'DADOS_INVALIDOS') { super(codigo); this.situacao = codigo === 'PROIBIDO' ? 403 : 400; }
}

// Proprietário e administrador gerenciam o escritório; ações críticas são exclusivas do proprietário.
function exigirGestor(autor: AutorAdministracao): void {
  if (autor.papel !== 'PROPRIETARIO' && autor.papel !== 'ADMINISTRADOR') throw new ErroAdministracao('PROIBIDO');
}
function exigirProprietario(autor: AutorAdministracao): void {
  if (autor.papel !== 'PROPRIETARIO') throw new ErroAdministracao('PROIBIDO');
}

export class GestaoAdministracao {
  constructor(private readonly repositorio: RepositorioAdministracao, private readonly tokens: Pick<TokensAcesso, 'validarTokenDeAcesso'>) {}

  private async executar<T>(token: string, operacao: (operacoes: OperacoesAdministracao) => Promise<T>): Promise<T> {
    return this.repositorio.executar(await this.tokens.validarTokenDeAcesso(token), operacao);
  }

  consultarEscritorio(token: string) {
    return this.executar(token, async (operacoes) => { exigirGestor(operacoes.autor); return operacoes.consultarEscritorio(); });
  }

  async listarAuditoria(token: string, filtro: FiltroAuditoria) {
    if (filtro.de && filtro.ate && filtro.de > filtro.ate) throw new ErroAdministracao('DADOS_INVALIDOS');
    return this.executar(token, async (operacoes) => {
      exigirGestor(operacoes.autor);
      return { ...await operacoes.listarAuditoria(filtro), pagina: filtro.pagina, tamanhoPagina: filtro.tamanhoPagina };
    });
  }

  async renomearEscritorio(token: string, nomeInformado: string) {
    let nome: string;
    try {
      nome = Escritorio.criar({ nome: nomeInformado }).nome;
    } catch (erro) {
      if (erro instanceof ErroEscritorioInvalido) throw new ErroAdministracao('DADOS_INVALIDOS');
      throw erro;
    }
    return this.executar(token, async (operacoes) => { exigirGestor(operacoes.autor); return operacoes.renomearEscritorio(nome); });
  }

  exportarDados(token: string) {
    return this.executar(token, async (operacoes) => { exigirProprietario(operacoes.autor); return operacoes.exportar(); });
  }
}

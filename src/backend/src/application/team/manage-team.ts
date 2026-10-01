import { Usuario } from '../../domain/users/user.js';
import type { PapelVinculoEscritorio } from '../../domain/memberships/membership.js';
import type { TokensAcesso } from '../authentication/authentication-contracts.js';
import type { ProtecaoDeSenhas } from '../security/password-hasher.js';
import { senhaAtendePolitica } from '../security/password-policy.js';
import type { FiltroEquipe, RepositorioEquipe, OperacoesEquipe } from './team-contracts.js';
import { ErroEquipe, PERMISSOES_EQUIPE, PoliticaEquipe } from './team-policy.js';

export class GestaoEquipe {
  constructor(private readonly repositorio: RepositorioEquipe, private readonly tokens: TokensAcesso, private readonly senhas: ProtecaoDeSenhas) {}
  private async executar<T>(token: string, operacao: (equipe: OperacoesEquipe) => Promise<T>): Promise<T> {
    return this.repositorio.executar(await this.tokens.validarTokenDeAcesso(token), operacao);
  }
  async configuracao(token: string) {
    return this.executar(token, async ({ autor }) => {
      const permissoes = autor.papel === 'PROPRIETARIO' ? [...PERMISSOES_EQUIPE] : autor.permissoes;
      return { permissoes, papeis: PoliticaEquipe.papeisPermitidos(autor).map((papel) => ({ papel, permissoesPadrao: PoliticaEquipe.permissoesPadrao(papel), permissoesPermitidas: papel === 'ADMINISTRADOR' ? [...PERMISSOES_EQUIPE] : ['EQUIPE_VISUALIZAR'] })) };
    });
  }
  async listar(token: string, filtro: FiltroEquipe) {
    return this.executar(token, async (equipe) => { PoliticaEquipe.exigir(equipe.autor, 'EQUIPE_VISUALIZAR'); return { ...await equipe.listar(filtro), pagina: filtro.pagina, tamanhoPagina: filtro.tamanhoPagina }; });
  }
  async consultar(token: string, id: string) {
    return this.executar(token, async (equipe) => { PoliticaEquipe.exigir(equipe.autor, 'EQUIPE_VISUALIZAR'); return equipe.consultar(id); });
  }
  async historico(token: string, id: string) {
    return this.executar(token, async (equipe) => { PoliticaEquipe.exigir(equipe.autor, 'EQUIPE_VISUALIZAR'); await equipe.consultar(id); return equipe.historico(id); });
  }
  async cadastrar(token: string, dados: { nome: string; email: string; papel: PapelVinculoEscritorio; permissoes: string[]; senhaTemporaria: string; confirmacaoSenhaTemporaria: string }) {
    if (!senhaAtendePolitica(dados.senhaTemporaria) || dados.senhaTemporaria !== dados.confirmacaoSenhaTemporaria) throw new ErroEquipe('DADOS_INVALIDOS', 400);
    const nome = Usuario.normalizarNome(dados.nome), email = Usuario.normalizarEmail(dados.email);
    // Autorizar antes do trabalho caro; revalidar na transação que grava.
    await this.executar(token, async (equipe) => { PoliticaEquipe.exigir(equipe.autor, 'EQUIPE_CADASTRAR_USUARIO'); PoliticaEquipe.exigir(equipe.autor, 'EQUIPE_DEFINIR_PERMISSOES'); PoliticaEquipe.validarDestino(equipe.autor, dados.papel, dados.permissoes); });
    const usuarioNovo = Usuario.criar({ nome, email, hashSenha: await this.senhas.gerarHashDaSenha(dados.senhaTemporaria), deveAlterarSenha: true });
    return this.criarVinculo(token, { email, usuarioNovo, papel: dados.papel, permissoes: dados.permissoes, confirmarContaExistente: false });
  }
  async confirmarVinculo(token: string, dados: { email: string; papel: PapelVinculoEscritorio; permissoes: string[] }) {
    return this.criarVinculo(token, { ...dados, email: Usuario.normalizarEmail(dados.email), confirmarContaExistente: true });
  }
  private async criarVinculo(token: string, dados: Parameters<import('./team-contracts.js').OperacoesEquipe['criar']>[0]) {
    return this.executar(token, async (equipe) => {
      PoliticaEquipe.exigir(equipe.autor, 'EQUIPE_CADASTRAR_USUARIO'); PoliticaEquipe.exigir(equipe.autor, 'EQUIPE_DEFINIR_PERMISSOES');
      PoliticaEquipe.validarDestino(equipe.autor, dados.papel, dados.permissoes); return equipe.criar(dados);
    });
  }
  async alterar(token: string, id: string, dados: { papel: PapelVinculoEscritorio; permissoes: string[]; versao: number }) {
    return this.executar(token, async (equipe) => {
      PoliticaEquipe.exigir(equipe.autor, 'EQUIPE_ALTERAR_USUARIO'); const anterior = await equipe.consultar(id);
      PoliticaEquipe.validarDestino(equipe.autor, dados.papel, dados.permissoes, anterior);
      if ([...anterior.permissoes].sort().join() !== [...dados.permissoes].sort().join()) PoliticaEquipe.exigir(equipe.autor, 'EQUIPE_DEFINIR_PERMISSOES');
      if (anterior.versao !== dados.versao) throw new ErroEquipe('CONFLITO', 409);
      return equipe.alterar(anterior, { ...dados, estaAtivo: anterior.estaAtivo });
    });
  }
  async definirSituacao(token: string, id: string, estaAtivo: boolean, versao: number) {
    return this.executar(token, async (equipe) => {
      PoliticaEquipe.exigir(equipe.autor, 'EQUIPE_ATIVAR_INATIVAR_USUARIO'); const anterior = await equipe.consultar(id);
      PoliticaEquipe.validarHierarquia(equipe.autor, anterior.papel, anterior);
      if (anterior.versao !== versao || anterior.estaAtivo === estaAtivo) throw new ErroEquipe('CONFLITO', 409);
      return equipe.alterar(anterior, { papel: anterior.papel, permissoes: anterior.permissoes, estaAtivo });
    });
  }
}

import type { TokensAcesso } from '../authentication/authentication-contracts.js';
import { ErroTokenAcessoInvalido, ErroPrimeiroAcessoObrigatorio } from '../authentication/authentication-errors.js';
import type { ConsultaDeIdentidadeAutenticada } from '../authentication/get-authenticated-identity.js';
import type { ProtecaoDeSenhas } from '../security/password-hasher.js';
import { senhaAtendePolitica } from '../security/password-policy.js';
import type { RepositorioSenhas, TokensRecuperacao } from './password-contracts.js';
import { ErroTrocaDeSenha } from './password-errors.js';

export interface NovaSenha { novaSenha: string; confirmacaoNovaSenha: string }
function validarNovaSenha(dados: NovaSenha): void {
  if (!senhaAtendePolitica(dados.novaSenha)) throw new ErroTrocaDeSenha('SENHA_INVALIDA');
  if (dados.novaSenha !== dados.confirmacaoNovaSenha) throw new ErroTrocaDeSenha('CONFIRMACAO_DIFERENTE');
}

export class RedefinicaoDeSenha {
  constructor(private readonly repositorio: RepositorioSenhas, private readonly tokens: TokensRecuperacao,
    private readonly protecao: ProtecaoDeSenhas, private readonly relogio: () => Date = () => new Date()) {}

  async redefinirSenha(dados: NovaSenha & { token: string }): Promise<void> {
    validarNovaSenha(dados);
    if (!/^[A-Za-z0-9_-]{43}$/.test(dados.token)) throw new ErroTrocaDeSenha('TOKEN_INVALIDO');
    const resultado = await this.repositorio.buscarRecuperacaoPorHash(this.tokens.calcularHash(dados.token));
    if (!resultado?.usuario.estaAtivo || !resultado.recuperacao.estaUtilizavel(this.relogio())) throw new ErroTrocaDeSenha('TOKEN_INVALIDO');
    if (await this.protecao.compararSenhaComHash(resultado.usuario.hashSenha, dados.novaSenha)) throw new ErroTrocaDeSenha('SENHA_REPETIDA');
    const novoHashSenha = await this.protecao.gerarHashDaSenha(dados.novaSenha);
    const alterou = await this.repositorio.redefinirSenha({ idUsuario: resultado.usuario.id,
      idRecuperacao: resultado.recuperacao.obterEstadoDaRecuperacao().id,
      hashSenhaAnterior: resultado.usuario.hashSenha, novoHashSenha, agora: this.relogio() });
    if (!alterou) throw new ErroTrocaDeSenha('TOKEN_INVALIDO');
  }
}

export class AlteracaoDeSenhaAutenticada {
  constructor(private readonly repositorio: RepositorioSenhas, private readonly protecao: ProtecaoDeSenhas,
    private readonly tokensAcesso: TokensAcesso, private readonly identidade: Pick<ConsultaDeIdentidadeAutenticada, 'consultarIdentidadeAutenticada'>,
    private readonly relogio: () => Date = () => new Date()) {}

  async alterarSenha(tokenAcesso: string, dados: NovaSenha & { senhaAtual: string }, primeiroAcesso = false): Promise<void> {
    const identidade = await this.identidade.consultarIdentidadeAutenticada(tokenAcesso);
    if (!!identidade.deveAlterarSenha !== primeiroAcesso) throw new ErroPrimeiroAcessoObrigatorio();
    const credenciais = await this.tokensAcesso.validarTokenDeAcesso(tokenAcesso);
    const usuario = await this.repositorio.buscarUsuarioPorId(credenciais.idUsuario);
    if (!usuario?.estaAtivo) throw new ErroTokenAcessoInvalido();
    validarNovaSenha(dados);
    if (typeof dados.senhaAtual !== 'string' || Array.from(dados.senhaAtual).length > 128 ||
      !await this.protecao.compararSenhaComHash(usuario.hashSenha, dados.senhaAtual)) throw new ErroTrocaDeSenha('SENHA_ATUAL_INCORRETA');
    if (await this.protecao.compararSenhaComHash(usuario.hashSenha, dados.novaSenha)) throw new ErroTrocaDeSenha('SENHA_REPETIDA');
    const novoHashSenha = await this.protecao.gerarHashDaSenha(dados.novaSenha);
    if (!await this.repositorio.alterarSenha({ idUsuario: usuario.id, idSessao: credenciais.idSessao,
      hashSenhaAnterior: usuario.hashSenha, novoHashSenha, agora: this.relogio(), ...(primeiroAcesso ? { primeiroAcesso: true } : {}) })) throw new ErroTokenAcessoInvalido();
  }
}

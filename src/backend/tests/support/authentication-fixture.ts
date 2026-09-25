import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { AutenticacaoDeUsuario } from '../../src/application/authentication/authenticate-user.js';
import { ConsultaDeIdentidadeAutenticada } from '../../src/application/authentication/get-authenticated-identity.js';
import { RenovacaoDeSessao } from '../../src/application/authentication/refresh-session.js';
import { EncerramentoDeSessao } from '../../src/application/authentication/logout-session.js';
import type { UsuarioComVinculos, RepositorioAutenticacao } from '../../src/application/authentication/authentication-contracts.js';
import { Sessao } from '../../src/domain/sessions/session.js';
import { Usuario } from '../../src/domain/users/user.js';
import { ProtecaoDeSenhasArgon2 } from '../../src/infrastructure/security/argon2-password-hasher.js';
import { TokensRenovacaoCriptograficos } from '../../src/infrastructure/security/crypto-refresh-tokens.js';
import { TokensAcessoJose } from '../../src/infrastructure/security/jose-access-tokens.js';

export const SENHA_TESTE = 'isolated authentication test password';
export const SEGREDO_TESTE = Buffer.alloc(48, 9).toString('base64url');
const PROTECAO_DE_SENHAS = new ProtecaoDeSenhasArgon2();
let promessaHash: Promise<string[]> | undefined;

export async function criarCenarioAutenticacao() {
  promessaHash ??= Promise.all([PROTECAO_DE_SENHAS.gerarHashDaSenha(SENHA_TESTE), PROTECAO_DE_SENHAS.gerarHashDaSenha(randomUUID())]);
  const [hashSenha, hashSenhaReferencia] = await promessaHash;
  const usuario = Usuario.criar({ nome: 'Test User', email: 'user@example.test', hashSenha });
  const usuarioComVinculos: UsuarioComVinculos = {
    usuario, vinculos: [{ escritorio: { id: randomUUID(), nome: 'Test Office', situacao: 'ATIVO' }, papel: 'PROPRIETARIO' }],
  };
  const sessoes = new Map<string, Sessao>();
  const repositorio: RepositorioAutenticacao = {
    buscarUsuarioComVinculosPorEmail: vi.fn(async (email) => email === usuarioComVinculos.usuario.email ? usuarioComVinculos : null),
    salvarSessao: vi.fn(async (sessao) => { sessoes.set(sessao.id, sessao); }),
    buscarSessaoComUsuarioPorId: vi.fn(async (id) => {
      const sessao = sessoes.get(id);
      return sessao ? { sessao, usuarioComVinculos: usuarioComVinculos } : null;
    }),
    substituirHashDeRenovacao: vi.fn(async ({ id, hashAtual, proximoHash, agora }) => {
      const sessao = sessoes.get(id);
      if (!sessao || !sessao.estaAtiva(agora) || sessao.obterCopiaDoEstado().hashTokenRenovacao !== hashAtual) return false;
      sessoes.set(id, Sessao.restaurar({ ...sessao.obterCopiaDoEstado(), hashTokenRenovacao: proximoHash, ultimoUsoEm: agora, atualizadoEm: agora }));
      return true;
    }),
    revogarSessao: vi.fn(async (id, agora) => {
      const sessao = sessoes.get(id);
      if (sessao && !sessao.obterCopiaDoEstado().revogadaEm) sessoes.set(id, Sessao.restaurar({ ...sessao.obterCopiaDoEstado(), revogadaEm: agora, atualizadoEm: agora }));
    }),
  };
  const protecaoDeSenhas = { compararSenhaComHash: vi.fn((hash: string, senha: string) => PROTECAO_DE_SENHAS.compararSenhaComHash(hash, senha)) };
  const tokensAcesso = new TokensAcessoJose(SEGREDO_TESTE, 'test-issuer', 'test-audience', 900);
  const tokensRenovacao = new TokensRenovacaoCriptograficos();
  const autenticacaoUsuario = new AutenticacaoDeUsuario(repositorio, protecaoDeSenhas, tokensAcesso, tokensRenovacao, {
    hashSenhaReferencia, validadeAcessoSegundos: 900, validadeRenovacaoSegundos: 604800,
  });
  const consultaIdentidade = new ConsultaDeIdentidadeAutenticada(repositorio, tokensAcesso);
  const renovacaoSessao = new RenovacaoDeSessao(repositorio, tokensRenovacao, tokensAcesso, 900);
  const encerramentoSessao = new EncerramentoDeSessao(repositorio, tokensRenovacao);
  return { usuarioComVinculos, sessoes, repositorio, protecaoDeSenhas, tokensAcesso, tokensRenovacao, autenticacaoUsuario, consultaIdentidade, renovacaoSessao, encerramentoSessao, hashSenhaReferencia };
}

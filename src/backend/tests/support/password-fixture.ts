import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import type { RepositorioSenhas, TrocaDeSenha, UsuarioParaTrocaDeSenha, MensagemEmail } from '../../src/application/passwords/password-contracts.js';
import { RecuperacaoDeSenha } from '../../src/domain/password-recovery/password-recovery.js';
import { TokensRecuperacaoCriptograficos } from '../../src/infrastructure/security/crypto-password-recovery.js';
import { SolicitacaoRecuperacaoDeSenha } from '../../src/application/passwords/request-password-recovery.js';
import { RedefinicaoDeSenha, AlteracaoDeSenhaAutenticada } from '../../src/application/passwords/change-password.js';
import { ErroTokenAcessoInvalido } from '../../src/application/authentication/authentication-errors.js';
import type { RepositorioTrabalhosRecuperacao, ReservaEnvioRecuperacao } from '../../src/application/passwords/recovery-email-jobs.js';
import { EnvioRecuperacaoDeSenha } from '../../src/application/passwords/deliver-password-recovery.js';

export function criarCenarioSenhas(relogio = () => Date.now()) {
  const usuario: UsuarioParaTrocaDeSenha = { id: randomUUID(), email: 'pessoa@example.test', hashSenha: 'hash:senha antiga de teste', estaAtivo: true };
  const recuperacoes = new Map<string, RecuperacaoDeSenha>();
  const trabalhos = new Map<string, { id: string; idUsuario: string; idReserva: string; tentativas: number;
    situacao: 'PENDENTE' | 'EM_PROCESSAMENTO' | 'ENVIADO' | 'FALHA_DEFINITIVA'; disponivelEm: number; bloqueadoAte: number; idRecuperacao?: string }>();
  const mensagens: MensagemEmail[] = [];
  const sessoes = new Map<string, boolean>([[randomUUID(), true], [randomUUID(), true]]);
  const idSessao = [...sessoes.keys()][0];
  const tokens = new TokensRecuperacaoCriptograficos();
  const registrarFalha = vi.fn();
  const protecao = { gerarHashDaSenha: vi.fn(async (senha: string) => `hash:${senha}`), compararSenhaComHash: vi.fn(async (hash: string, senha: string) => hash === `hash:${senha}`) };
  function trocar(dados: TrocaDeSenha, idRecuperacao?: string, sessao?: string) {
    if (!usuario.estaAtivo || usuario.hashSenha !== dados.hashSenhaAnterior || (sessao && !sessoes.get(sessao))) return false;
    if (idRecuperacao && !recuperacoes.get(idRecuperacao)?.estaUtilizavel(dados.agora)) return false;
    usuario.hashSenha = dados.novoHashSenha;
    for (const id of sessoes.keys()) sessoes.set(id, false);
    for (const [id, recuperacao] of recuperacoes) recuperacoes.set(id, RecuperacaoDeSenha.restaurar({ ...recuperacao.obterEstadoDaRecuperacao(),
      ...(id === idRecuperacao ? { utilizadoEm: dados.agora } : { invalidadoEm: dados.agora }) }));
    for (const trabalho of trabalhos.values()) if (['PENDENTE', 'EM_PROCESSAMENTO'].includes(trabalho.situacao)) trabalho.situacao = 'FALHA_DEFINITIVA';
    return true;
  }
  const repositorio: RepositorioSenhas = {
    buscarUsuarioPorEmail: vi.fn(async (email) => email === usuario.email ? { ...usuario } : null),
    buscarUsuarioPorId: vi.fn(async (id) => id === usuario.id ? { ...usuario } : null),
    criarRecuperacao: vi.fn(async (recuperacao, hashEsperado) => {
      if (hashEsperado !== usuario.hashSenha || !usuario.estaAtivo) return false;
      for (const [id, anterior] of recuperacoes) recuperacoes.set(id, RecuperacaoDeSenha.restaurar({ ...anterior.obterEstadoDaRecuperacao(), invalidadoEm: new Date() }));
      recuperacoes.set(recuperacao.obterEstadoDaRecuperacao().id, recuperacao); return true;
    }),
    buscarRecuperacaoPorHash: vi.fn(async (hash) => {
      const recuperacao = [...recuperacoes.values()].find((item) => item.obterEstadoDaRecuperacao().hashToken === hash);
      return recuperacao ? { recuperacao, usuario: { ...usuario } } : null;
    }),
    invalidarRecuperacao: vi.fn(async (id, agora) => { const anterior = recuperacoes.get(id)!; recuperacoes.set(id, RecuperacaoDeSenha.restaurar({ ...anterior.obterEstadoDaRecuperacao(), invalidadoEm: agora })); }),
    redefinirSenha: vi.fn(async (dados) => trocar(dados, dados.idRecuperacao)),
    alterarSenha: vi.fn(async (dados) => trocar(dados, undefined, dados.idSessao)),
    removerRecuperacoesExpiradas: vi.fn(async () => 0),
  };
  const envioEmail = { enviarEmail: vi.fn(async (mensagem: MensagemEmail) => { mensagens.push(mensagem); }) };
  const consultaIdentidade = { consultarIdentidadeAutenticada: vi.fn(async () => {
    if (!sessoes.get(idSessao)) throw new ErroTokenAcessoInvalido();
    return { usuario: { id: usuario.id, nome: 'Pessoa', email: usuario.email }, escritorio: { id: randomUUID(), nome: 'Escritório', papel: 'PROPRIETARIO' as const } };
  }) };
  const tokensAcesso = { criarTokenDeAcesso: vi.fn(async () => 'acesso'), validarTokenDeAcesso: vi.fn(async () => ({ idUsuario: usuario.id, idSessao, idEscritorioAtivo: randomUUID(), papel: 'PROPRIETARIO' as const })) };
  function obterReservado(reserva: ReservaEnvioRecuperacao) {
    const trabalho = trabalhos.get(reserva.id);
    return trabalho?.situacao === 'EM_PROCESSAMENTO' && trabalho.idReserva === reserva.idReserva && trabalho.bloqueadoAte > relogio() ? trabalho : undefined;
  }
  const repositorioTrabalhos: RepositorioTrabalhosRecuperacao = {
    registrarSolicitacao: vi.fn(async (email) => {
      if (!usuario.estaAtivo || usuario.email !== email) return;
      for (const anterior of trabalhos.values()) if (['PENDENTE', 'EM_PROCESSAMENTO'].includes(anterior.situacao)) anterior.situacao = 'FALHA_DEFINITIVA';
      for (const [id, recuperacao] of recuperacoes) recuperacoes.set(id, RecuperacaoDeSenha.restaurar({ ...recuperacao.obterEstadoDaRecuperacao(), invalidadoEm: new Date(relogio()) }));
      const id = randomUUID(); trabalhos.set(id, { id, idUsuario: usuario.id, idReserva: '', tentativas: 0, situacao: 'PENDENTE', disponivelEm: relogio(), bloqueadoAte: 0 });
    }),
    reservarTrabalho: vi.fn(async (duracao) => {
      const trabalho = [...trabalhos.values()].find((t) => t.situacao === 'PENDENTE' && t.disponivelEm <= relogio() || t.situacao === 'EM_PROCESSAMENTO' && t.bloqueadoAte <= relogio());
      if (!trabalho) return null;
      trabalho.situacao = 'EM_PROCESSAMENTO'; trabalho.idReserva = randomUUID(); trabalho.bloqueadoAte = relogio() + duracao * 1000; trabalho.tentativas++;
      return { id: trabalho.id, idUsuario: trabalho.idUsuario, idReserva: trabalho.idReserva, tentativas: trabalho.tentativas };
    }),
    prepararTentativa: vi.fn(async (reserva, hash) => {
      const trabalho = obterReservado(reserva); if (!trabalho) return null;
      if (!usuario.estaAtivo || (trabalho.idRecuperacao && recuperacoes.get(trabalho.idRecuperacao)?.obterEstadoDaRecuperacao().utilizadoEm)) { trabalho.situacao = 'FALHA_DEFINITIVA'; return null; }
      const criada = RecuperacaoDeSenha.criar(usuario.id, hash, new Date(relogio()));
      const recuperacao = RecuperacaoDeSenha.restaurar({ ...criada.obterEstadoDaRecuperacao(), ...(trabalho.idRecuperacao ? { id: trabalho.idRecuperacao } : {}) });
      await repositorio.criarRecuperacao(recuperacao, usuario.hashSenha);
      trabalho.idRecuperacao = recuperacao.obterEstadoDaRecuperacao().id; return { email: usuario.email };
    }),
    concluirEnvio: vi.fn(async (reserva) => { const trabalho = obterReservado(reserva); if (!trabalho) return false; trabalho.situacao = 'ENVIADO'; return true; }),
    registrarFalha: vi.fn(async (reserva, _codigo, definitiva, atraso) => {
      const trabalho = obterReservado(reserva); if (!trabalho) return false;
      trabalho.situacao = definitiva ? 'FALHA_DEFINITIVA' : 'PENDENTE'; trabalho.disponivelEm = relogio() + atraso * 1000;
      if (trabalho.idRecuperacao) await repositorio.invalidarRecuperacao(trabalho.idRecuperacao, new Date(relogio())); return true;
    }),
    removerTrabalhosAntigos: vi.fn(async () => 0),
  };
  const envio = new EnvioRecuperacaoDeSenha(repositorioTrabalhos, tokens, envioEmail, 'https://app.example.test', {
    maximoTentativas: 5, atrasoInicialSegundos: 30, atrasoMaximoSegundos: 3600,
  }, () => registrarFalha());
  const solicitacao = new SolicitacaoRecuperacaoDeSenha(repositorioTrabalhos);
  return { usuario, recuperacoes, trabalhos, repositorioTrabalhos, envio, mensagens, sessoes, tokens, repositorio, protecao, envioEmail, registrarFalha, consultaIdentidade, solicitacao,
    redefinicao: new RedefinicaoDeSenha(repositorio, tokens, protecao), alteracao: new AlteracaoDeSenhaAutenticada(repositorio, protecao, tokensAcesso, consultaIdentidade),
    executarTarefas: async () => { const reserva = await repositorioTrabalhos.reservarTrabalho(60); if (reserva) await envio.enviarRecuperacao(reserva, new AbortController().signal); },
    obterToken: () => mensagens.at(-1)!.texto.match(/#token=([\w-]+)/)![1],
  };
}

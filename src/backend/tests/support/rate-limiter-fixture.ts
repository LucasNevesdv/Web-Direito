import { LimitadorRequisicoesCompartilhado, type PoliticaLimiteRequisicoes, type EscopoLimiteRequisicoes, type ArmazenamentoLimiteRequisicoes } from '../../src/application/security/rate-limiter.js';
import { ChavesLimiteRequisicoesHmac } from '../../src/infrastructure/security/hmac-rate-limit-keys.js';

export function criarCenarioLimitador(substituicoes: Partial<Record<EscopoLimiteRequisicoes, Partial<PoliticaLimiteRequisicoes>>> = {}, agora = () => Date.now()) {
  const contadores = new Map<string, { quantidade: number; expiraEm: number }>();
  const armazenamento: ArmazenamentoLimiteRequisicoes = {
    async incrementarContadorDaJanela(escopo, hashChave, politica) {
      const iniciar = Math.floor(agora() / (politica.janelaSegundos * 1000)) * politica.janelaSegundos * 1000;
      const chave = `${escopo}:${hashChave}:${iniciar}`;
      const contador = contadores.get(chave) ?? { quantidade: 0, expiraEm: iniciar + politica.janelaSegundos * 1000 };
      ++contador.quantidade;
      contadores.set(chave, contador);
      return { podeProsseguir: contador.quantidade <= politica.limite, tentarAposSegundos: Math.max(1, Math.ceil((contador.expiraEm - agora()) / 1000)) };
    },
    async removerLimitesExpirados() {
      let removidos = 0;
      for (const [chave, valor] of contadores) if (valor.expiraEm <= agora()) { contadores.delete(chave); ++removidos; }
      return removidos;
    },
  };
  const escopos: EscopoLimiteRequisicoes[] = ['team-create-ip', 'onboarding-ip', 'login-ip', 'login-identity', 'refresh-ip', 'recovery-ip', 'recovery-email', 'reset-ip', 'reset-token', 'password-change-ip', 'password-change-user'];
  const politicas = Object.fromEntries(escopos.map((escopo) => [escopo, { limite: 1000, janelaSegundos: 900, ...substituicoes[escopo] }])) as Record<EscopoLimiteRequisicoes, PoliticaLimiteRequisicoes>;
  const chaves = new ChavesLimiteRequisicoesHmac(Buffer.alloc(48, 8).toString('base64url'));
  return { limitador: new LimitadorRequisicoesCompartilhado(armazenamento, chaves, politicas), armazenamento, chaves, contadores, politicas };
}

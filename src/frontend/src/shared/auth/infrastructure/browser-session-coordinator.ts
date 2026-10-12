import type { IdentidadeAutenticada } from '../auth-client';
import type { CoordenadorSessao, SessaoCompartilhada } from '../session-coordinator';

const NOME_CANAL = 'web-direito:authentication:v1';
const NOME_LOCK = 'web-direito:authentication-mutation:v1';
const PADRAO_UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const PAPEIS_TOKEN: Record<string, string> = { PROPRIETARIO: 'OWNER', ADMINISTRADOR: 'ADMIN', ADVOGADO: 'LAWYER', ESTAGIARIO: 'INTERN', SECRETARIO: 'SECRETARY' };
interface CanalDeMensagensEntreAbas {
  postMessage(mensagem: unknown): void;
  addEventListener(tipo: 'message', observador: (evento: MessageEvent) => void): void;
  close(): void;
}
export interface RecursosDeCoordenacaoEntreAbas {
  canal?: CanalDeMensagensEntreAbas;
  bloqueios?: Pick<LockManager, 'request'>;
  tempoDeSincronizacaoMs?: number;
  tempoLimiteMs?: number;
}
interface MensagemDeSincronizacaoDeSessao {
  versao: 1; idAba: string; id: string; tipo: 'requisicao' | 'resposta' | 'estado' | 'suspender';
  instante: number; idCorrelacao: string | null; idSessao: string | null; estado: SessaoCompartilhada | null;
}

function validarCredenciaisCompartilhadas(tokenAcesso: string, identidadeRecebida: IdentidadeAutenticada) {
  if (typeof tokenAcesso !== 'string' || tokenAcesso.length > 4096 || tokenAcesso.split('.').length !== 3) throw new Error('Invalid shared session');
  // Metadata is only for coordination. The API still verifies the JWT on every request.
  const metadadosDoToken = JSON.parse(atob(tokenAcesso.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  if (!PADRAO_UUID.test(metadadosDoToken.sessionId) || metadadosDoToken.sub !== identidadeRecebida.usuario?.id || metadadosDoToken.activeOfficeId !== identidadeRecebida.escritorio?.id ||
    !Object.hasOwn(PAPEIS_TOKEN, identidadeRecebida.escritorio.papel) || metadadosDoToken.role !== PAPEIS_TOKEN[identidadeRecebida.escritorio.papel] || !PADRAO_UUID.test(identidadeRecebida.usuario.id) || !PADRAO_UUID.test(identidadeRecebida.escritorio.id) ||
    ![identidadeRecebida.usuario.nome, identidadeRecebida.usuario.email, identidadeRecebida.escritorio.nome].every((campo) => typeof campo === 'string' && campo.length > 0 && campo.length <= 254) ||
    !Number.isFinite(metadadosDoToken.exp) || metadadosDoToken.exp * 1000 > Date.now() + 902000 || metadadosDoToken.exp * 1000 <= Date.now()) throw new Error('Invalid shared session');
  const identidade: IdentidadeAutenticada = { ...(identidadeRecebida.deveAlterarSenha ? { deveAlterarSenha: true } : {}), usuario: { id: identidadeRecebida.usuario.id, nome: identidadeRecebida.usuario.nome, email: identidadeRecebida.usuario.email },
    escritorio: { id: identidadeRecebida.escritorio.id, nome: identidadeRecebida.escritorio.nome, papel: identidadeRecebida.escritorio.papel } };
  return { idSessao: metadadosDoToken.sessionId as string, credenciais: { tokenAcesso: tokenAcesso, identidade, expiraEm: metadadosDoToken.exp * 1000 } };
}

export class CoordenadorSessaoNavegador implements CoordenadorSessao {
  private readonly idAba = crypto.randomUUID();
  private sessaoCompartilhada: SessaoCompartilhada | null = null;
  private estaCoordenacaoEncerrada = false;
  private readonly observadoresDaSessao = new Set<(sessaoCompartilhada: SessaoCompartilhada) => void>();
  private readonly sincronizacoesPendentes = new Map<string, () => void>();
  private readonly identificadoresDasMensagensRecebidas = new Set<string>();
  private readonly controladoresDeCancelamento = new Set<AbortController>();
  private temporizadorDeExpiracao?: ReturnType<typeof setTimeout>;
  private aoExpirarSessao?: () => void;
  private aoIniciarTroca?: () => void;
  observarInicioDaTroca(observador: () => void) { this.aoIniciarTroca = observador; }
  prepararTrocaDeEscritorio() { this.enviarMensagemEntreAbas('suspender'); }
  readonly podeRenovar: boolean;

  constructor(private readonly recursosDeCoordenacao: RecursosDeCoordenacaoEntreAbas) {
    this.podeRenovar = !!recursosDeCoordenacao.bloqueios;
    recursosDeCoordenacao.canal?.addEventListener('message', (evento) => this.tratarMensagemDeOutraAba(evento.data));
  }

  obterSessaoCompartilhada() { return this.sessaoCompartilhada; }
  observarMudancasDaSessao(aoAlterarSessao: (estado: SessaoCompartilhada) => void) { this.observadoresDaSessao.add(aoAlterarSessao); return () => { this.observadoresDaSessao.delete(aoAlterarSessao); }; }
  registrarAoExpirarSessao(aoExpirarSessao: () => void) { this.aoExpirarSessao = aoExpirarSessao; }

  private agendarNotificacaoDeExpiracao() {
    clearTimeout(this.temporizadorDeExpiracao);
    if (this.sessaoCompartilhada?.credenciais && !this.estaCoordenacaoEncerrada) {
      this.temporizadorDeExpiracao = setTimeout(() => this.aoExpirarSessao?.(), Math.max(0, this.sessaoCompartilhada.credenciais.expiraEm - Date.now()));
    }
  }

  private enviarMensagemEntreAbas(tipo: MensagemDeSincronizacaoDeSessao['tipo'], idCorrelacao: string | null = null) {
    if (this.estaCoordenacaoEncerrada) return;
    const sessaoASincronizar = tipo === "requisicao" ? null : this.sessaoCompartilhada;
    const mensagem: MensagemDeSincronizacaoDeSessao = { versao: 1, idAba: this.idAba, id: crypto.randomUUID(), tipo,
      instante: Date.now(), idCorrelacao, idSessao: sessaoASincronizar?.idSessao ?? null, estado: sessaoASincronizar };
    this.recursosDeCoordenacao.canal?.postMessage(mensagem);
    return mensagem.id;
  }

  private tratarMensagemDeOutraAba(mensagemRecebida: unknown) {
    if (this.estaCoordenacaoEncerrada) return;
    try {
      const mensagem = mensagemRecebida as MensagemDeSincronizacaoDeSessao;
      if (!mensagem || mensagem.versao !== 1 || !PADRAO_UUID.test(mensagem.idAba) || !PADRAO_UUID.test(mensagem.id) || mensagem.idAba === this.idAba ||
        !Number.isFinite(mensagem.instante) || Math.abs(Date.now() - mensagem.instante) > 15000 || this.identificadoresDasMensagensRecebidas.has(mensagem.id)) return;
      this.identificadoresDasMensagensRecebidas.add(mensagem.id);
      if (this.identificadoresDasMensagensRecebidas.size > 256) this.identificadoresDasMensagensRecebidas.delete(this.identificadoresDasMensagensRecebidas.values().next().value!);
      if (mensagem.tipo === "requisicao") { if (this.sessaoCompartilhada) this.enviarMensagemEntreAbas("resposta", mensagem.id); return; }
      if (mensagem.tipo === 'suspender') {
        if (mensagem.idSessao && mensagem.idSessao === this.sessaoCompartilhada?.idSessao && this.sessaoCompartilhada.credenciais) this.aoIniciarTroca?.();
        return;
      }
      if (mensagem.tipo !== "estado" && mensagem.tipo !== "resposta") return;
      if (mensagem.tipo === "resposta" && (!mensagem.idCorrelacao || !this.sincronizacoesPendentes.has(mensagem.idCorrelacao))) return;
      const sessaoRecebida = mensagem.estado;
      if (!sessaoRecebida || !PADRAO_UUID.test(sessaoRecebida.id) || !Number.isFinite(sessaoRecebida.instante) || sessaoRecebida.instante > Date.now() + 2000 ||
        sessaoRecebida.idSessao !== mensagem.idSessao || (sessaoRecebida.idSessao !== null && !PADRAO_UUID.test(sessaoRecebida.idSessao)) ||
        !["entrar", "renovar", "sair", "invalido"].includes(sessaoRecebida.motivo)) return;
      if (this.sessaoCompartilhada?.idSessao && this.sessaoCompartilhada.idSessao !== sessaoRecebida.idSessao && sessaoRecebida.motivo !== "entrar") return;
      // Outras abas podem descobrir a mesma revogação em consultas sobrepostas.
      // A repetição não deve cancelar um novo login explícito já em andamento.
      // Logout explícito continua sendo processado, inclusive durante o login.
      if (this.sessaoCompartilhada && !this.sessaoCompartilhada.credenciais && !sessaoRecebida.credenciais
        && sessaoRecebida.motivo === 'invalido' && sessaoRecebida.idSessao === this.sessaoCompartilhada.idSessao) return;
      // Revocation is terminal for a session, even if an in-flight refresh broadcasts later.
      const deveInvalidarSessaoAtual = this.sessaoCompartilhada?.credenciais && sessaoRecebida.idSessao === this.sessaoCompartilhada.idSessao &&
        !sessaoRecebida.credenciais && (sessaoRecebida.motivo === "sair" || sessaoRecebida.motivo === "invalido");
      if (!deveInvalidarSessaoAtual && this.sessaoCompartilhada && (sessaoRecebida.instante < this.sessaoCompartilhada.instante || (sessaoRecebida.instante === this.sessaoCompartilhada.instante && sessaoRecebida.id <= this.sessaoCompartilhada.id))) return;
      if (this.sessaoCompartilhada && !this.sessaoCompartilhada.credenciais && sessaoRecebida.motivo === "renovar") return;
      let sessaoValidada: SessaoCompartilhada;
      if (sessaoRecebida.credenciais) {
        if (sessaoRecebida.motivo !== "entrar" && sessaoRecebida.motivo !== "renovar") return;
        const credenciaisValidadas = validarCredenciaisCompartilhadas(sessaoRecebida.credenciais.tokenAcesso, sessaoRecebida.credenciais.identidade);
        if (credenciaisValidadas.idSessao !== sessaoRecebida.idSessao) return;
        sessaoValidada = { id: sessaoRecebida.id, instante: sessaoRecebida.instante, motivo: sessaoRecebida.motivo, ...credenciaisValidadas };
      } else {
        if (sessaoRecebida.motivo !== "sair" && sessaoRecebida.motivo !== "invalido") return;
        sessaoValidada = { id: sessaoRecebida.id, instante: sessaoRecebida.instante, idSessao: sessaoRecebida.idSessao, motivo: sessaoRecebida.motivo, credenciais: null };
      }
      this.sessaoCompartilhada = sessaoValidada;
      this.agendarNotificacaoDeExpiracao();
      this.observadoresDaSessao.forEach((aoAlterarSessao) => aoAlterarSessao(sessaoValidada));
    } catch { /* Mensagens inválidas não afetam a identidade atual. */ }
  }

  async sincronizarSessaoEntreAbas(): Promise<void> {
    if (this.estaCoordenacaoEncerrada) throw new Error('Coordination closed');
    if (!this.recursosDeCoordenacao.canal) return;
    // Replies are collected for a bounded interval, including multiple peers.
    await new Promise<void>((resolver) => {
      const identificadorDaRequisicao = this.enviarMensagemEntreAbas("requisicao")!;
      const temporizador = setTimeout(() => { this.sincronizacoesPendentes.delete(identificadorDaRequisicao); resolver(); }, this.recursosDeCoordenacao.tempoDeSincronizacaoMs ?? 250);
      this.sincronizacoesPendentes.set(identificadorDaRequisicao, () => { clearTimeout(temporizador); resolver(); });
    });
  }

  async executarOperacaoExclusiva<T>(aoObterExclusividade: (sinal?: AbortSignal) => Promise<T>): Promise<T> {
    if (this.estaCoordenacaoEncerrada) throw new Error('Coordination closed');
    const controlador = new AbortController();
    this.controladoresDeCancelamento.add(controlador);
    const temporizador = setTimeout(() => controlador.abort(), this.recursosDeCoordenacao.tempoLimiteMs ?? 20000);
    const executarOperacaoSeNaoCancelada = () => {
      controlador.signal.throwIfAborted();
      return aoObterExclusividade(controlador.signal);
    };
    try {
      return this.recursosDeCoordenacao.bloqueios
        ? await this.recursosDeCoordenacao.bloqueios.request(NOME_LOCK, { mode: 'exclusive', signal: controlador.signal }, executarOperacaoSeNaoCancelada)
        : await executarOperacaoSeNaoCancelada();
    } finally { clearTimeout(temporizador); this.controladoresDeCancelamento.delete(controlador); }
  }

  compartilharCredenciaisDaSessao(tokenAcesso: string, identidade: IdentidadeAutenticada, motivo: 'entrar' | 'renovar') {
    if (this.estaCoordenacaoEncerrada) return;
    const credenciaisValidadas = validarCredenciaisCompartilhadas(tokenAcesso, identidade);
    this.sessaoCompartilhada = { id: crypto.randomUUID(), instante: Math.max(Date.now(), (this.sessaoCompartilhada?.instante ?? 0) + 1), motivo, ...credenciaisValidadas };
    this.agendarNotificacaoDeExpiracao();
    this.enviarMensagemEntreAbas("estado");
  }

  propagarInvalidacaoDaSessao(motivo: 'sair' | 'invalido') {
    if (this.estaCoordenacaoEncerrada) return;
    this.sessaoCompartilhada = { id: crypto.randomUUID(), instante: Math.max(Date.now(), (this.sessaoCompartilhada?.instante ?? 0) + 1),
      idSessao: this.sessaoCompartilhada?.idSessao ?? null, motivo, credenciais: null };
    clearTimeout(this.temporizadorDeExpiracao);
    this.enviarMensagemEntreAbas("estado");
  }

  encerrarCoordenacao() {
    this.estaCoordenacaoEncerrada = true;
    clearTimeout(this.temporizadorDeExpiracao);
    this.controladoresDeCancelamento.forEach((controlador) => controlador.abort());
    this.sincronizacoesPendentes.forEach((aoConcluirSincronizacao) => aoConcluirSincronizacao());
    this.sincronizacoesPendentes.clear();
    this.observadoresDaSessao.clear();
    this.recursosDeCoordenacao.canal?.close();
    this.sessaoCompartilhada = null;
  }
}

export function criarCoordenadorSessaoNavegador(): CoordenadorSessao {
  let canal: CanalDeMensagensEntreAbas | undefined;
  try { if (typeof BroadcastChannel !== 'undefined') canal = new BroadcastChannel(NOME_CANAL); } catch { /* Sem canal, mantém o modo limitado. */ }
  return new CoordenadorSessaoNavegador({ canal, bloqueios: typeof navigator !== 'undefined' ? navigator.locks : undefined });
}

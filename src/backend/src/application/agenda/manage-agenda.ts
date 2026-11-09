import type { TokensAcesso } from '../authentication/authentication-contracts.js';
import { hojeNoFuso, somarDias } from '../tasks/civil-date.js';
import type { Compromisso, DadosCompromisso, FiltroAgenda, OperacoesAgenda, RepositorioAgenda } from './agenda-contracts.js';
import { podeVisualizarVinculo, tiposVinculoPermitidos } from '../links/link-policy.js';
import { TIPOS_COMPROMISSO } from './agenda-contracts.js';
import { ErroAgenda, podeCancelar, podeEditar } from './agenda-policy.js';

export function validarPeriodo(inicio: string, fim: string, maximoDias: number): void {
  const a = Date.parse(inicio), b = Date.parse(fim);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > maximoDias * 86400000) throw new ErroAgenda('DADOS_INVALIDOS');
}
export function normalizarCompromisso(dados: DadosCompromisso): DadosCompromisso {
  validarPeriodo(dados.inicio, dados.fim, 31);
  const normalizado = { ...dados, titulo: dados.titulo.trim(), descricao: dados.descricao.trim(), local: dados.local.trim(), linkRemoto: dados.linkRemoto.trim() };
  if (normalizado.titulo.length < 3 || normalizado.titulo.length > 200 || normalizado.descricao.length > 4000 || normalizado.local.length > 500
    || !TIPOS_COMPROMISSO.includes(dados.tipo) || dados.participantes.length < 1 || dados.participantes.length > 50
    || new Set(dados.participantes).size !== dados.participantes.length
    || (dados.lembreteMinutos !== null && (!Number.isInteger(dados.lembreteMinutos) || dados.lembreteMinutos < 0 || dados.lembreteMinutos > 10080))) throw new ErroAgenda('DADOS_INVALIDOS');
  if (normalizado.linkRemoto) {
    try {
      const url = new URL(normalizado.linkRemoto);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || normalizado.linkRemoto.length > 2000) throw new Error();
    } catch { throw new ErroAgenda('DADOS_INVALIDOS'); }
  }
  return normalizado;
}

export class GestaoAgenda {
  constructor(private readonly repositorio: RepositorioAgenda, private readonly tokens: Pick<TokensAcesso, 'validarTokenDeAcesso'>,
    private readonly fusoHorario: string, private readonly agora: () => Date = () => new Date()) {}
  private async executar<T>(token: string, operacao: (op: OperacoesAgenda) => Promise<T>) {
    return this.repositorio.executar(await this.tokens.validarTokenDeAcesso(token), operacao);
  }
  configuracao(token: string) {
    return this.executar(token, async (op) => ({ fusoHorario: this.fusoHorario, hoje: hojeNoFuso(this.fusoHorario, this.agora()),
      idUsuario: op.autor.idUsuario, membros: await op.listarMembros(), tiposVinculoPermitidos: tiposVinculoPermitidos(op.autor) }));
  }
  listar(token: string, filtro: FiltroAgenda) {
    validarPeriodo(filtro.inicio, filtro.fim, 43);
    return this.executar(token, async (op) => {
      const lista = await op.listar(filtro);
      return { ...lista, compromissos: lista.compromissos.map((c) => this.apresentar(op, c)) };
    });
  }
  private apresentar(op: OperacoesAgenda, compromisso: Compromisso): Compromisso {
    const vinculoRestrito = !!compromisso.vinculo && !podeVisualizarVinculo(op.autor, compromisso.vinculo.tipo);
    return { ...compromisso, vinculoRestrito, rotuloVinculo: vinculoRestrito ? null : compromisso.rotuloVinculo };
  }
  private apresentarHistorico(op: OperacoesAgenda, valor: unknown): unknown {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return valor;
    const snapshot = valor as Partial<Compromisso>;
    return snapshot.vinculo && !podeVisualizarVinculo(op.autor, snapshot.vinculo.tipo)
      ? { ...snapshot, rotuloVinculo: null, vinculoRestrito: true } : valor;
  }
  consultar(token: string, id: string) { return this.executar(token, async (op) => this.apresentar(op, await op.consultar(id))); }
  proximos(token: string, filtro: FiltroAgenda) {
    validarPeriodo(filtro.inicio, filtro.fim, 90);
    return this.executar(token, async (op) => {
      const lista = await op.listar({ ...filtro, somenteAgendados: true });
      return { ...lista, compromissos: lista.compromissos.map((c) => this.apresentar(op, c)) };
    });
  }
  historico(token: string, id: string) {
    return this.executar(token, async (op) => {
      await op.consultar(id);
      return (await op.historico(id)).map((h) => ({ ...h, anterior: this.apresentarHistorico(op, h.anterior), atual: this.apresentarHistorico(op, h.atual) }));
    });
  }
  private async validarReferencias(op: OperacoesAgenda, dados: DadosCompromisso, anterior?: Compromisso) {
    for (const participante of dados.participantes) if (!await op.membroAtivo(participante)) throw new ErroAgenda('PARTICIPANTE_INVALIDO');
    if (dados.vinculo) {
      const preservado = dados.vinculo.id === anterior?.vinculo?.id && dados.vinculo.tipo === anterior?.vinculo?.tipo;
      if (!preservado && !podeVisualizarVinculo(op.autor, dados.vinculo.tipo)) throw new ErroAgenda('VINCULO_PROIBIDO');
      if (!await op.vinculos.existe(dados.vinculo)) throw new ErroAgenda('VINCULO_INVALIDO');
    }
    if (!dados.confirmarConflito && await op.possuiConflito(dados, anterior?.id)) throw new ErroAgenda('CONFLITO_HORARIO');
  }
  criar(token: string, entrada: DadosCompromisso) {
    const dados = normalizarCompromisso(entrada);
    return this.executar(token, async (op) => {
      await op.bloquearEscrita();
      await this.validarReferencias(op, dados);
      return this.apresentar(op, await op.criar(dados));
    });
  }
  alterar(token: string, id: string, entrada: DadosCompromisso & { versao: number }) {
    const dados = normalizarCompromisso(entrada);
    return this.executar(token, async (op) => {
      await op.bloquearEscrita();
      const anterior = await op.consultar(id);
      if (!podeEditar(op.autor, anterior)) throw new ErroAgenda('PROIBIDO');
      if (anterior.versao !== entrada.versao) throw new ErroAgenda('CONFLITO');
      if (anterior.situacao !== 'AGENDADO') throw new ErroAgenda('ENCERRADO');
      await this.validarReferencias(op, dados, anterior);
      return this.apresentar(op, await op.alterar(anterior, dados));
    });
  }
  situacao(token: string, id: string, dados: { situacao: 'REALIZADO' | 'CANCELADO'; versao: number; observacao: string }) {
    return this.executar(token, async (op) => {
      await op.bloquearEscrita();
      const anterior = await op.consultar(id);
      if (!(dados.situacao === 'CANCELADO' ? podeCancelar(op.autor, anterior) : podeEditar(op.autor, anterior))) throw new ErroAgenda('PROIBIDO');
      if (anterior.versao !== dados.versao) throw new ErroAgenda('CONFLITO');
      if (anterior.situacao !== 'AGENDADO') throw new ErroAgenda('ENCERRADO');
      return this.apresentar(op, await op.situacao(anterior, dados.situacao, dados.observacao.trim()));
    });
  }
  itensCivis(token: string, filtro: FiltroAgenda) {
    validarPeriodo(filtro.inicio, filtro.fim, 43);
    const inicio = hojeNoFuso(this.fusoHorario, new Date(filtro.inicio));
    const fim = somarDias(hojeNoFuso(this.fusoHorario, new Date(Date.parse(filtro.fim) - 1)), 1);
    return this.executar(token, (op) => op.itensCivis(inicio, fim, filtro.idParticipante));
  }
  lembretes(token: string) { return this.executar(token, (op) => op.lembretes(this.agora())); }
  marcarLembrete(token: string, id: string) { return this.executar(token, (op) => op.marcarLembrete(id, this.agora())); }
}

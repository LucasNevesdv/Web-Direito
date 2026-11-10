import type { TokensAcesso } from '../authentication/authentication-contracts.js';
import { podeVisualizarVinculo } from '../links/link-policy.js';
import type { TipoVinculo, Vinculo } from '../links/business-links.js';
import { dataCivilValida, hojeNoFuso, somarDias } from './civil-date.js';
import { estadoDaTarefa, type AlteracaoChecklist, type EstadoPrazo, type FiltroPrazos, type FiltroTarefas, type OperacoesTarefas, type OrigemPrazo,
  type PrazoJudicial, type PrioridadeTarefa, type RepositorioTarefas, type SituacaoPrazo, type SituacaoTarefa } from './task-contracts.js';
import { ErroTarefas, PoliticaTarefas } from './task-policy.js';

export interface DadosTarefa {
  titulo: string; descricao: string; prioridade: PrioridadeTarefa; idResponsavel: string; idRevisor: string | null;
  prazoInterno: string | null; vinculo: Vinculo | null;
}
export interface DadosPrazo {
  descricao: string; dataLimite: string; origem: OrigemPrazo; detalhesOrigem: string; idResponsavel: string;
  idTarefa: string | null; vinculo: Vinculo | null;
}
export interface ConfiguracaoTarefas { fusoHorario: string; diasPrazoCritico: number }

function texto(valor: string, minimo: number, maximo: number): string {
  const normalizado = valor.trim();
  if (Array.from(normalizado).length < minimo || Array.from(normalizado).length > maximo) throw new ErroTarefas('DADOS_INVALIDOS');
  return normalizado;
}
function observacao(valor: string | undefined): string | null {
  return valor?.trim() ? texto(valor, 1, 2000) : null;
}

export class GestaoTarefas {
  constructor(private readonly repositorio: RepositorioTarefas, private readonly tokens: Pick<TokensAcesso, 'validarTokenDeAcesso'>,
    private readonly configuracao: ConfiguracaoTarefas, private readonly agora: () => Date = () => new Date()) {}

  private async executar<T>(token: string, operacao: (operacoes: OperacoesTarefas) => Promise<T>): Promise<T> {
    return this.repositorio.executar(await this.tokens.validarTokenDeAcesso(token), operacao);
  }
  private hoje(): string { return hojeNoFuso(this.configuracao.fusoHorario, this.agora()); }
  private apresentarPrazo(prazo: PrazoJudicial, hoje = this.hoje()) {
    const pendente = prazo.situacao === 'PENDENTE';
    return { ...prazo, vencido: pendente && prazo.dataLimite < hoje,
      critico: pendente && prazo.dataLimite <= somarDias(hoje, this.configuracao.diasPrazoCritico) };
  }
  private async validarReferencias(operacoes: OperacoesTarefas, dados: { idResponsavel: string; idRevisor?: string | null; vinculo: Vinculo | null; prazo?: string | null }) {
    if (dados.prazo != null && !dataCivilValida(dados.prazo)) throw new ErroTarefas('DADOS_INVALIDOS');
    if (dados.idRevisor && dados.idRevisor === dados.idResponsavel) throw new ErroTarefas('DADOS_INVALIDOS');
    for (const id of [dados.idResponsavel, dados.idRevisor]) if (id && !await operacoes.membroAtivo(id)) throw new ErroTarefas('RESPONSAVEL_INVALIDO');
    if (dados.vinculo && !await operacoes.vinculos.existe(dados.vinculo)) throw new ErroTarefas('VINCULO_NAO_ENCONTRADO');
  }

  async configuracaoDoUsuario(token: string) {
    return this.executar(token, async (operacoes) => ({ hoje: this.hoje(), diasPrazoCritico: this.configuracao.diasPrazoCritico,
      podeGerirPrazos: PoliticaTarefas.podeGerirPrazos(operacoes.autor), idUsuario: operacoes.autor.idUsuario, membros: await operacoes.listarMembros() }));
  }
  async pesquisarVinculos(token: string, tipo: TipoVinculo, pesquisa: string) {
    return this.executar(token, (operacoes) => {
      if (!podeVisualizarVinculo(operacoes.autor, tipo)) throw new ErroTarefas('PROIBIDO');
      return operacoes.vinculos.pesquisar(tipo, pesquisa.trim(), 20);
    });
  }

  async listarTarefas(token: string, filtro: Omit<FiltroTarefas, 'hoje'>) {
    return this.executar(token, async (operacoes) => ({ ...await operacoes.listarTarefas({ ...filtro, hoje: this.hoje() }), pagina: filtro.pagina, tamanhoPagina: filtro.tamanhoPagina }));
  }
  async consultarTarefa(token: string, id: string) {
    return this.executar(token, async (operacoes) => {
      const tarefa = await operacoes.consultarTarefa(id);
      return { ...tarefa, podeEditar: PoliticaTarefas.podeEditarTarefa(operacoes.autor, tarefa) };
    });
  }
  async historicoTarefa(token: string, id: string) {
    return this.executar(token, async (operacoes) => { await operacoes.consultarTarefa(id); return operacoes.historicoTarefa(id); });
  }
  async criarTarefa(token: string, dados: DadosTarefa) {
    return this.executar(token, async (operacoes) => {
      await this.validarReferencias(operacoes, { ...dados, prazo: dados.prazoInterno });
      return operacoes.criarTarefa({ titulo: texto(dados.titulo, 3, 200), descricao: texto(dados.descricao, 0, 4000), situacao: 'PENDENTE',
        prioridade: dados.prioridade, idResponsavel: dados.idResponsavel, idRevisor: dados.idRevisor, prazoInterno: dados.prazoInterno,
        vinculo: dados.vinculo, conclusao: null });
    });
  }
  async alterarTarefa(token: string, id: string, dados: DadosTarefa & { versao: number }) {
    return this.executar(token, async (operacoes) => {
      const anterior = await this.tarefaEditavel(operacoes, id, dados.versao);
      if (!PoliticaTarefas.tarefaAberta(anterior.situacao)) throw new ErroTarefas('TAREFA_ENCERRADA');
      await this.validarReferencias(operacoes, { ...dados, prazo: dados.prazoInterno });
      return operacoes.alterarTarefa(anterior, { ...estadoDaTarefa(anterior), titulo: texto(dados.titulo, 3, 200), descricao: texto(dados.descricao, 0, 4000),
        prioridade: dados.prioridade, idResponsavel: dados.idResponsavel, idRevisor: dados.idRevisor, prazoInterno: dados.prazoInterno, vinculo: dados.vinculo }, 'ALTERADA');
    });
  }
  async alterarSituacaoTarefa(token: string, id: string, dados: { situacao: SituacaoTarefa; observacao?: string; versao: number }) {
    return this.executar(token, async (operacoes) => {
      const anterior = await this.tarefaEditavel(operacoes, id, dados.versao);
      PoliticaTarefas.exigirTransicao(operacoes.autor, anterior, dados.situacao);
      const conclusao = dados.situacao === 'CONCLUIDA' ? { em: this.agora(), idAutor: operacoes.autor.idUsuario, observacao: observacao(dados.observacao) } : null;
      const acao = dados.situacao === 'CONCLUIDA' ? 'CONCLUIDA' : dados.situacao === 'CANCELADA' ? 'CANCELADA'
        : PoliticaTarefas.tarefaAberta(anterior.situacao) ? 'SITUACAO_ALTERADA' : 'REABERTA';
      return operacoes.alterarTarefa(anterior, { ...estadoDaTarefa(anterior), situacao: dados.situacao, conclusao }, acao);
    });
  }
  async alterarChecklist(token: string, id: string, alteracao: AlteracaoChecklist, versao: number) {
    return this.executar(token, async (operacoes) => {
      const anterior = await this.tarefaEditavel(operacoes, id, versao);
      if (!PoliticaTarefas.tarefaAberta(anterior.situacao)) throw new ErroTarefas('TAREFA_ENCERRADA');
      if (alteracao.tipo === 'ADICIONAR') {
        if (anterior.checklist.length >= 50) throw new ErroTarefas('DADOS_INVALIDOS');
        return operacoes.alterarChecklist(anterior, { tipo: 'ADICIONAR', titulo: texto(alteracao.titulo, 1, 200) });
      }
      if (!anterior.checklist.some((item) => item.id === alteracao.idItem)) throw new ErroTarefas('NAO_ENCONTRADO');
      return operacoes.alterarChecklist(anterior, alteracao);
    });
  }
  private async tarefaEditavel(operacoes: OperacoesTarefas, id: string, versao: number) {
    const anterior = await operacoes.consultarTarefa(id);
    PoliticaTarefas.exigirEdicaoTarefa(operacoes.autor, anterior);
    if (anterior.versao !== versao) throw new ErroTarefas('CONFLITO');
    return anterior;
  }

  async listarPrazos(token: string, filtro: FiltroPrazos & { somenteCriticos: boolean }) {
    return this.executar(token, async (operacoes) => {
      const hoje = this.hoje();
      const { somenteCriticos, ...restante } = filtro;
      const resultado = await operacoes.listarPrazos({ ...restante, ...(somenteCriticos ? { situacao: 'PENDENTE' as const, ate: somarDias(hoje, this.configuracao.diasPrazoCritico) } : {}) });
      return { prazos: resultado.prazos.map((prazo) => this.apresentarPrazo(prazo, hoje)), total: resultado.total, pagina: filtro.pagina, tamanhoPagina: filtro.tamanhoPagina };
    });
  }
  async consultarPrazo(token: string, id: string) {
    return this.executar(token, async (operacoes) => this.apresentarPrazo(await operacoes.consultarPrazo(id)));
  }
  async historicoPrazo(token: string, id: string) {
    return this.executar(token, async (operacoes) => { await operacoes.consultarPrazo(id); return operacoes.historicoPrazo(id); });
  }
  async criarPrazo(token: string, dados: DadosPrazo) {
    return this.executar(token, async (operacoes) => {
      PoliticaTarefas.exigirGestaoPrazos(operacoes.autor);
      await this.validarPrazo(operacoes, dados);
      return this.apresentarPrazo(await operacoes.criarPrazo({ ...this.normalizarPrazo(dados), situacao: 'PENDENTE', conclusao: null,
        confirmacao: { em: this.agora(), idAutor: operacoes.autor.idUsuario } }));
    });
  }
  async alterarPrazo(token: string, id: string, dados: DadosPrazo & { versao: number }) {
    return this.executar(token, async (operacoes) => {
      PoliticaTarefas.exigirGestaoPrazos(operacoes.autor);
      const anterior = await this.prazoNaVersao(operacoes, id, dados.versao);
      if (anterior.situacao !== 'PENDENTE') throw new ErroTarefas('PRAZO_ENCERRADO');
      await this.validarPrazo(operacoes, dados);
      // Toda alteração exige nova confirmação de quem a realiza.
      return this.apresentarPrazo(await operacoes.alterarPrazo(anterior, { ...this.normalizarPrazo(dados), situacao: 'PENDENTE', conclusao: null,
        confirmacao: { em: this.agora(), idAutor: operacoes.autor.idUsuario } }, anterior.dataLimite !== dados.dataLimite ? 'DATA_ALTERADA' : 'ALTERADO'));
    });
  }
  async alterarSituacaoPrazo(token: string, id: string, dados: { situacao: SituacaoPrazo; observacao?: string; versao: number }) {
    return this.executar(token, async (operacoes) => {
      const anterior = await this.prazoNaVersao(operacoes, id, dados.versao);
      if (dados.situacao === 'CUMPRIDO') PoliticaTarefas.exigirCumprimentoPrazo(operacoes.autor, anterior);
      else PoliticaTarefas.exigirGestaoPrazos(operacoes.autor);
      const permitido = anterior.situacao === 'PENDENTE' ? dados.situacao !== 'PENDENTE' : dados.situacao === 'PENDENTE';
      if (!permitido) throw new ErroTarefas('TRANSICAO_INVALIDA');
      const conclusao = dados.situacao === 'CUMPRIDO' ? { em: this.agora(), idAutor: operacoes.autor.idUsuario, observacao: observacao(dados.observacao) } : null;
      return this.apresentarPrazo(await operacoes.alterarPrazo(anterior, { descricao: anterior.descricao, dataLimite: anterior.dataLimite, origem: anterior.origem,
        detalhesOrigem: anterior.detalhesOrigem, idResponsavel: anterior.responsavel.id, idTarefa: anterior.idTarefa, vinculo: anterior.vinculo,
        confirmacao: { em: anterior.confirmadoEm, idAutor: anterior.confirmadoPor.id }, situacao: dados.situacao, conclusao },
      dados.situacao === 'CUMPRIDO' ? 'CUMPRIDO' : dados.situacao === 'CANCELADO' ? 'CANCELADO' : 'REABERTO'));
    });
  }
  private async prazoNaVersao(operacoes: OperacoesTarefas, id: string, versao: number) {
    const anterior = await operacoes.consultarPrazo(id);
    if (anterior.versao !== versao) throw new ErroTarefas('CONFLITO');
    return anterior;
  }
  private async validarPrazo(operacoes: OperacoesTarefas, dados: DadosPrazo) {
    await this.validarReferencias(operacoes, { idResponsavel: dados.idResponsavel, vinculo: dados.vinculo, prazo: dados.dataLimite });
    if (dados.idTarefa) await operacoes.consultarTarefa(dados.idTarefa);
  }
  private normalizarPrazo(dados: DadosPrazo): Omit<EstadoPrazo, 'situacao' | 'conclusao' | 'confirmacao'> {
    const detalhesOrigem = texto(dados.detalhesOrigem, 0, 500);
    if (dados.origem === 'OUTRA' && !detalhesOrigem) throw new ErroTarefas('DADOS_INVALIDOS');
    return { descricao: texto(dados.descricao, 3, 500), dataLimite: dados.dataLimite, origem: dados.origem, detalhesOrigem,
      idResponsavel: dados.idResponsavel, idTarefa: dados.idTarefa, vinculo: dados.vinculo };
  }

  async painel(token: string) {
    return this.executar(token, async (operacoes) => {
      const hoje = this.hoje();
      const criticos = await operacoes.listarPrazos({ situacao: 'PENDENTE', ate: somarDias(hoje, this.configuracao.diasPrazoCritico), pagina: 1, tamanhoPagina: 10 });
      const { naoLidas } = await operacoes.listarNotificacoes(0);
      return { hoje, diasPrazoCritico: this.configuracao.diasPrazoCritico, minhasTarefas: await operacoes.contarTarefasDoUsuario(operacoes.autor.idUsuario, hoje),
        prazosCriticos: criticos.prazos.map((prazo) => this.apresentarPrazo(prazo, hoje)), totalPrazosCriticos: criticos.total, notificacoesNaoLidas: naoLidas };
    });
  }
  async listarNotificacoes(token: string) {
    return this.executar(token, (operacoes) => operacoes.listarNotificacoes(50));
  }
  async marcarNotificacaoLida(token: string, id: string) {
    await this.executar(token, (operacoes) => operacoes.marcarNotificacaoLida(id));
  }
}

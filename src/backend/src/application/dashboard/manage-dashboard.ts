import type { TokensAcesso } from '../authentication/authentication-contracts.js';
import { hojeNoFuso, somarDias } from '../tasks/civil-date.js';
import { ErroPainel, type FiltroPainel, type RepositorioPainel } from './dashboard-contracts.js';

export class GestaoPainel {
  constructor(private readonly repositorio: RepositorioPainel, private readonly tokens: Pick<TokensAcesso, 'validarTokenDeAcesso'>,
    private readonly configuracao: { fusoHorario: string; diasPrazoCritico: number }, private readonly agora = () => new Date()) {}
  async consultar(token: string, filtro: FiltroPainel) {
    if (![7, 30, 90].includes(filtro.dias)) throw new ErroPainel();
    const contexto = await this.tokens.validarTokenDeAcesso(token), agora = this.agora();
    const hoje = hojeNoFuso(this.configuracao.fusoHorario, agora);
    const resumo = await this.repositorio.consultar(contexto, { ...filtro, hoje, agora, ate: somarDias(hoje, filtro.dias),
      limiteCritico: somarDias(hoje, this.configuracao.diasPrazoCritico),
      fimCompromissos: new Date(agora.getTime() + filtro.dias * 86400000) });
    return { ...resumo, ...this.configuracao };
  }
}

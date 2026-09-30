export type SituacaoEnvioRecuperacao = 'PENDENTE' | 'EM_PROCESSAMENTO' | 'ENVIADO' | 'FALHA_DEFINITIVA';
export type CodigoFalhaEnvio = 'PROVEDOR_TRANSITORIO' | 'PROVEDOR_DEFINITIVO' | 'LIMITE_TENTATIVAS';
export interface ReservaEnvioRecuperacao { id: string; idUsuario: string; idReserva: string; tentativas: number }
export interface RepositorioTrabalhosRecuperacao {
  registrarSolicitacao(email: string): Promise<void>;
  reservarTrabalho(duracaoReservaSegundos: number): Promise<ReservaEnvioRecuperacao | null>;
  prepararTentativa(reserva: ReservaEnvioRecuperacao, hashToken: string): Promise<{ email: string } | null>;
  concluirEnvio(reserva: ReservaEnvioRecuperacao): Promise<boolean>;
  registrarFalha(reserva: ReservaEnvioRecuperacao, codigo: CodigoFalhaEnvio, definitiva: boolean, atrasoSegundos: number): Promise<boolean>;
  removerTrabalhosAntigos(retencaoDias: number): Promise<number>;
}
export class ErroEnvioEmail extends Error {
  constructor(readonly definitiva = false) { super('Falha no envio de e-mail.'); }
}

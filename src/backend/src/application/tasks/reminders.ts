import type { EnvioEmail } from '../passwords/password-contracts.js';
import { ErroEnvioEmail } from '../passwords/recovery-email-jobs.js';
import { hojeNoFuso, somarDias } from './civil-date.js';
import type { Notificacao } from './task-contracts.js';

export interface EnvioLembrete {
  id: string; idReserva: string; tentativas: number; email: string; nome: string; escritorio: string;
  tipo: Notificacao['tipo']; escalonada: boolean; titulo: string; dataLimite: string;
}
export interface JanelaLembretes { hoje: string; limiteTarefasProximas: string; limitePrazosCriticos: string }
export interface RepositorioLembretes {
  gerarLembretes(janela: JanelaLembretes): Promise<number>;
  reservarEnvios(limite: number, reservaSegundos: number): Promise<EnvioLembrete[]>;
  concluirEnvio(envio: EnvioLembrete): Promise<void>;
  registrarFalha(envio: EnvioLembrete, definitiva: boolean, atrasoSegundos: number): Promise<void>;
}
export interface PoliticaLembretes {
  fusoHorario: string; diasPrazoCritico: number; maximoTentativas: number; atrasoInicialSegundos: number; atrasoMaximoSegundos: number;
}

const ASSUNTOS: Record<Notificacao['tipo'], string> = {
  TAREFA_PROXIMA: 'Tarefa com prazo interno próximo', TAREFA_ATRASADA: 'Tarefa com prazo interno vencido',
  PRAZO_CRITICO: 'Prazo judicial crítico', PRAZO_VENCIDO: 'Prazo judicial vencido sem cumprimento',
};
const escaparHtml = (valor: string) => valor.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const dataBrasileira = (data: string) => data.split('-').reverse().join('/');

// Gera lembretes idempotentes por dia e entrega o e-mail de cada um com novas tentativas limitadas.
export class LembretesDePrazos {
  constructor(private readonly repositorio: RepositorioLembretes, private readonly envioEmail: EnvioEmail, private readonly urlFrontend: string,
    private readonly politica: PoliticaLembretes, private readonly agora: () => Date = () => new Date()) {}

  async gerar(): Promise<number> {
    const hoje = hojeNoFuso(this.politica.fusoHorario, this.agora());
    return this.repositorio.gerarLembretes({ hoje, limiteTarefasProximas: somarDias(hoje, 1), limitePrazosCriticos: somarDias(hoje, this.politica.diasPrazoCritico) });
  }

  async enviarPendentes(reservaSegundos: number, sinal: AbortSignal): Promise<number> {
    let enviados = 0;
    for (const envio of await this.repositorio.reservarEnvios(10, reservaSegundos)) {
      if (sinal.aborted) break;
      try {
        await this.envioEmail.enviarEmail(this.mensagem(envio), sinal);
      } catch (erro) {
        const definitiva = envio.tentativas >= this.politica.maximoTentativas || (erro instanceof ErroEnvioEmail && erro.definitiva);
        const atraso = Math.min(this.politica.atrasoMaximoSegundos, this.politica.atrasoInicialSegundos * 2 ** Math.min(envio.tentativas - 1, 20));
        await this.repositorio.registrarFalha(envio, definitiva, atraso);
        continue;
      }
      await this.repositorio.concluirEnvio(envio);
      enviados += 1;
    }
    return enviados;
  }

  private mensagem(envio: EnvioLembrete) {
    const destino = envio.tipo.startsWith('PRAZO') ? 'prazos' : 'tarefas';
    const link = `${this.urlFrontend}/${destino}`;
    const motivo = envio.escalonada ? 'Você recebe este aviso por administrar o escritório.' : 'Você é a pessoa responsável.';
    const linhas = [`Escritório: ${envio.escritorio}`, `${ASSUNTOS[envio.tipo]}: ${envio.titulo}`, `Data: ${dataBrasileira(envio.dataLimite)}`, motivo];
    return { destinatario: envio.email, assunto: `Web Direito — ${ASSUNTOS[envio.tipo]}`,
      texto: `Olá, ${envio.nome}.\n${linhas.join('\n')}\nAcesse: ${link}`,
      html: `<html lang="pt-BR"><body><p>Olá, ${escaparHtml(envio.nome)}.</p>${linhas.map((linha) => `<p>${escaparHtml(linha)}</p>`).join('')}<p><a href="${escaparHtml(link)}">Abrir no Web Direito</a></p></body></html>` };
  }
}

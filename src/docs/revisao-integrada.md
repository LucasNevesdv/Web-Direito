# Revisão técnica integrada — Agenda e Dashboard

Data: 09/11/2026. Escopo: RF-078 a RF-097 do catálogo da divisão do grupo/Entrega 3 e os componentes compartilhados diretamente usados por esses módulos. Branch: `feature/matheus-agenda-dashboard`. Alterações locais, sem commit ou publicação.

Esta etapa sucede a implementação documentada em [agenda.md](agenda.md) e [dashboard.md](dashboard.md). A revisão foi orientada pelos critérios de vínculo autorizado, permissões, persistência, navegação e tratamento de falhas do plano de entrega.

## Ajustes realizados

| Ponto identificado | Correção | Evidência |
| --- | --- | --- |
| A busca compartilhada validava escritório, mas não a leitura do cadastro de origem. | `/api/v1/vinculos` verifica leitura de clientes ou casos/processos antes de chamar o resolvedor. Usa o papel e as permissões atuais da sessão revalidada. | `links-access.test.ts` comprova ausência de consulta quando proibida; `agenda.check.ts` verifica HTTP 403 e concessão/revogação no PostgreSQL. |
| A Agenda podia devolver nomes automáticos de vínculos em detalhes e snapshots de histórico a um leitor sem acesso ao cadastro. | Apresentação oculta rótulos em listas, detalhes, respostas de gravação e histórico. Novos vínculos/substituições exigem a permissão correspondente. | Integração real com cliente, caso e processo; leitura do proprietário mantém o conteúdo original. |
| Uma revogação poderia obrigar o participante a perder um vínculo existente ao editar o compromisso. | Referência existente pode ser preservada; interface informa restrição e não pesquisa seu cadastro. Os demais campos seguem as permissões de edição já existentes. | Integração verifica edição por participante restrito, preservação da referência e rejeição de substituição não autorizada. |
| O seletor podia manter opções de uma busca/tipo anterior, inclusive ao falhar. | Limpeza imediata de opções, cancelamento de consultas antigas, estados de carregamento e erro distintos de resultado vazio. | Teste com resposta atrasada de cliente após troca para caso; teste de recusa HTTP. |
| Dois eventos de envio antes da conclusão da requisição podiam repetir a submissão do formulário. | Guarda síncrona durante o envio, além do bloqueio visual. | Teste dispara dois envios e verifica uma requisição e uma confirmação de gravação. |

A política de leitura da Agenda continua compartilhada entre membros ativos. A proteção de rótulos não altera o acesso aos campos próprios do compromisso nem apaga os snapshots persistidos. A referência por ID não concede acesso ao registro vinculado. As políticas dos módulos de origem permanecem responsáveis por seus próprios endpoints.

O novo comportamento da busca é compartilhado pelos formulários que usam `SeletorVinculo`. Perfis sem leitura do cadastro recebem recusa de acesso, e não uma lista de nomes. Não foram adicionadas dependências ou migrations nesta revisão.

## Verificações concluídas

| Verificação | Resultado |
| --- | --- |
| Lint backend/frontend | Aprovado. |
| Tipagem TypeScript backend/frontend | Aprovada. |
| Build backend/frontend | Aprovado. |
| Suíte completa backend | 40 arquivos, 662 testes aprovados. |
| Suíte completa frontend | 17 arquivos, 159 testes aprovados. |
| Integração real da Agenda | Aprovada, incluindo os novos cenários de permissões. |
| Integração real do Dashboard | Aprovada, incluindo contagens, filtros, links, sessões e concorrência. |
| Migrations em banco vazio | Todas as 14 migrations aplicadas pelos dois runners. |

Total da suíte: **821 testes**, dez a mais que na conclusão inicial do Dashboard. As duas integrações com PostgreSQL são verificações adicionais a esse número. Cada runner criou e removeu seu próprio banco descartável, sem limpar o banco de desenvolvimento.

Ambiente: Windows, Node 26.13.0, pnpm 9.15.4, Prisma 6.19.3 e PostgreSQL 18.6. Foram usados `--no-experimental-webstorage` para compatibilidade com Vitest/jsdom e até dois trabalhadores. Os comandos de execução estão nas documentações dos módulos.

## Limites deste registro

- Testes automatizados e integração HTTP/banco executados; não equivalem a aceite humano nem a uma demonstração visual.
- A navegação foi exercitada por testes de componentes, sem atestar aqui o fluxo completo no navegador com upload real em armazenamento S3.
- A guarda de envio do formulário não substitui idempotência para clientes externos fazendo requisições independentes.
- Conferência manual, evidências de tela, revisão do grupo e envio ao GitHub continuam separados desta etapa.
- A revisão e os ajustes receberam assistência de IA; os resultados registrados são de verificações executadas, não de validação humana.

Os registros anteriores foram preservados como evidências das respectivas etapas. Este documento apresenta a regressão automatizada mais recente.

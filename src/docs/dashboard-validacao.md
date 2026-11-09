# Registro de validação do Dashboard

Data: 09/11/2026. Branch: `feature/matheus-agenda-dashboard`. Base: `46b2e3708c612cbc759f5b3ff30631867d91d5a0`. Implementação local; nenhum commit, push ou pull request desta entrega foi realizado.

## Resultado

Este é o registro da implementação do Dashboard. Os ajustes e os resultados mais recentes da revisão conjunta estão em [revisao-integrada.md](revisao-integrada.md); os números abaixo preservam a evidência desta etapa.

| Verificação | Resultado |
| --- | --- |
| Lint do backend e frontend | Aprovado. |
| Tipagem TypeScript do backend e frontend | Aprovada. |
| Build de produção do backend e frontend | Aprovado. |
| Suíte completa do backend | 39 arquivos; 656 testes aprovados. |
| Suíte completa do frontend | 16 arquivos; 155 testes aprovados. |
| Integração do Dashboard com PostgreSQL real | Aprovada em banco temporário próprio, removido ao final. |
| Aplicação das migrations em banco vazio | 14 migrations aplicadas pelo runner. |
| Consultas simultâneas após inatividade da sessão | Aprovadas na integração real após a proteção final contra conflitos de serialização. |
| Revisão de espaços com `git diff --check` | Sem erros. |
| Conferência visual/manual e aceite do aluno/equipe | Pendente, adiada por solicitação do responsável. |

A suíte completa totaliza **811 testes**. A integração real é uma verificação adicional, executada por `verify:dashboard`, e não está incluída nesse número. Após o ajuste final de concorrência, foram repetidos a integração do Dashboard e os checks de lint, tipagem e build do backend.

Ambiente: Windows, Node 26.13.0, pnpm 9.15.4, Prisma 6.19.3, PostgreSQL 18.6. A suíte usou `NODE_OPTIONS=--no-experimental-webstorage` e até dois trabalhadores, conforme a compatibilidade documentada no projeto. Testes com conexão local foram executados com acesso ao PostgreSQL/SMTP de teste.

## Evidências automatizadas

O arquivo `backend/tests/integration/dashboard.check.ts` verifica:

- Data civil no fuso do escritório quando o dia UTC já é diferente.
- Tarefas pendentes/em andamento; exclusão de concluídas e canceladas.
- Contagem de doze atrasos mesmo com amostra limitada a dez.
- Limites inclusivos/exclusivos para hoje, tarefas futuras, prazos críticos e próximos.
- Atrasos antigos continuam visíveis com mudança de período.
- Compromissos em andamento, início/fim exatamente na fronteira, cancelados e realizados.
- Compromisso com dois participantes sem duplicação na contagem de todos.
- Responsável próprio, outro membro e todos do escritório.
- Casos ativos versus arquivados, última atividade e totais atuais de clientes.
- Dados de dois escritórios isolados.
- Responsável externo ou inativo recusado.
- Permissões atuais para proprietário, estagiário e secretário; concessão/revogação sem trocar o token.
- Campos de clientes/casos ausentes (`null`) quando não autorizados.
- Links de tarefas/prazos gerando consultas HTTP com os mesmos totais do resumo, além de abertura do registro por ID.
- Lista de compromissos com exatamente os limites e registros do resumo.
- Respostas sem cache, falta de token, parâmetros inválidos e sessão revogada.
- Cinco consultas concorrentes depois de inatividade da sessão.

Os testes de interface verificam:

- Contagens, amostras, links e horário do escritório.
- Filtros enviados à API, remoção de dados antigos em falha e descarte de resposta fora de ordem.
- Ausência de permissão diferenciada de zero; falha de lembretes sem bloquear o resumo.
- Marcação de lembrete como lido.
- Abertura de tarefa, prazo e caso fora da primeira página.
- Filtros de clientes/casos vindos do painel e opção de removê-los.
- Janela de compromissos de até noventa dias, paginação e retorno ao calendário.
- Regressão dos módulos existentes na suíte completa.

Os testes foram executados sobre dados fictícios. Algumas tentativas iniciais falharam por campos de fixture obrigatórios/regras de conclusão; os dados de teste foram corrigidos sem enfraquecer as restrições do banco. Um teste de paginação foi ajustado para aguardar o carregamento assíncrono antes do clique.

## Pendências de entrega

1. Conferência manual integrada de Agenda e Dashboard no navegador.
2. Captura de evidências e revisão humana das regras/documentação.
3. Revisão do diff e seleção dos arquivos da entrega, mantendo credenciais e artefatos locais fora do Git.
4. Commit, envio da branch e abertura/revisão de pull request conforme o fluxo do grupo.

Os passos pendentes não são atestados por este registro. O roteiro e os comandos estão em [dashboard.md](dashboard.md); o registro anterior da Agenda está em [agenda-validacao.md](agenda-validacao.md).

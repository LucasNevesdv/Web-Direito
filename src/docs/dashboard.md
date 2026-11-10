# Dashboard — RF-089 a RF-097

## Entrega

A página `/painel` amplia o painel existente sem alterar o fluxo de autenticação. Usa componentes, cores, formulários, respostas HTTP e organização em aplicação/infraestrutura/apresentação já adotados no projeto. Não depende de serviços externos nem exige nova migração além da Agenda.

| Requisito | Implementação |
| --- | --- |
| RF-089 | Tarefas abertas do usuário por padrão, agrupadas em hoje, atrasadas e futuras; link para todas as tarefas, incluindo as sem prazo e encerradas. |
| RF-090 | Contagem e amostra de tarefas atrasadas, com destaque visual e acesso à lista correspondente. |
| RF-091 | Prazos pendentes críticos (incluindo vencidos) e próximos, sem sobreposição entre os grupos; vencidos identificados. |
| RF-092 | Compromissos agendados em andamento ou com início no intervalo futuro, ordenados por início. |
| RF-093 | Casos ativos sem atividade registrada há pelo menos 7, 30 ou 90 dias, usando `lastActivityAt`. |
| RF-094 | Totais atuais de clientes e casos ativos para o responsável selecionado. |
| RF-095 | Períodos de 7, 30 e 90 dias; responsável Eu, Todos do escritório ou um membro ativo. |
| RF-096 | Sessão e vínculo revalidados; isolamento por escritório e políticas existentes de visualização de clientes/casos. |
| RF-097 | Links para detalhes por ID e para listas com os filtros do painel; paginação preservada nos módulos de destino. |

## Regras de cálculo

- O padrão é **Eu / próximos 7 dias**. O responsável de tarefas e prazos é o usuário atribuído; em clientes/casos é o vínculo responsável; em compromissos é o participante. Um compromisso com vários participantes é contado uma única vez.
- “Hoje” usa `FUSO_HORARIO` do escritório. Datas de tarefas e prazos são datas civis, sem conversão pelo fuso do computador.
- Tarefas pendentes ou em andamento: atrasadas antes de hoje, hoje na data atual e futuras de amanhã até hoje + período, inclusive. Tarefas sem prazo e encerradas não entram nesses três indicadores; o link para todas as tarefas permite consultá-las.
- Prazos críticos: pendentes com vencimento até hoje + `PRAZO_CRITICO_DIAS`, inclusive vencidos. Prazos próximos: após esse limite e até hoje + período. Quando o limite crítico for maior que o período, o grupo de próximos fica vazio.
- **O período nunca esconde atrasos antigos nem reduz a janela de alerta crítico.** Ambos continuam sujeitos ao filtro de responsável.
- Compromissos: `AGENDADO`, fim posterior ao instante da consulta e início anterior a esse instante + período × 24 horas. Inclui em andamento; exclui realizados/cancelados e os que terminam exatamente no início da janela.
- A lista aberta a partir dos compromissos conserva os limites exatos da consulta do painel. O botão “Voltar ao calendário” retoma as visões de dia/semana/mês. Atualizar o painel renova a janela.
- Casos sem movimentação usam o intervalo passado de mesma duração: última atividade menor ou igual ao instante atual menos período × 24 horas. Arquivados ficam excluídos.
- Clientes/casos ativos representam o estoque atual, não cadastros realizados no período. A interface informa essa diferença.
- Cada grupo exibe até dez registros, mas a contagem considera todos os correspondentes. Links abrem listas paginadas. Contagens e amostras são consultadas na mesma transação com snapshot consistente.
- Lembretes existentes de tarefas/prazos continuam pessoais, com marcação de leitura. Os lembretes próprios de compromissos permanecem na Agenda.
- Dados são recarregados ao entrar, alterar filtros ou clicar em “Atualizar painel”. Não há atualização automática em segundo plano do Dashboard.
- Ao trocar filtros, dados anteriores saem da tela; respostas antigas ou de componentes desmontados são descartadas. Falha em lembretes não impede o resumo.

## Autorização e integridade

O repositório verifica a sessão ativa, usuário, escritório e vínculo antes de consultar dados. O escritório vem do token validado e da sessão, nunca de um parâmetro livre. Responsável externo ou inativo é recusado.

As políticas `PoliticaClientes` e `PoliticaCasosProcessos` continuam sendo a fonte das permissões. Sem permissão, os campos do respectivo módulo retornam `null`, sem consultas aos seus registros; a interface informa a restrição em vez de apresentar zero. Concessões personalizadas e revogações são lidas do vínculo atual, mesmo com token emitido anteriormente.

Os endpoints de detalhes e listas de destino mantêm sua própria autorização. As respostas do painel não podem ser armazenadas em cache. Não são retornados documentos, valores financeiros, observações privadas ou dados de contato no resumo.

O snapshot usa isolamento `RepeatableRead`. Se houver conflito de serialização `P2034`, por exemplo na atualização concorrente da atividade da sessão, a consulta completa pode ser repetida até duas vezes além da tentativa inicial. Cada tentativa revalida a autorização e recalcula as contagens no novo snapshot; outros erros não são repetidos automaticamente.

## API e organização

- `GET /api/v1/painel/resumo?dias=7&responsavel=EU`: novo resumo. `responsavel` aceita `EU`, `TODOS` ou UUID de usuário ativo do escritório; `dias` aceita 7, 30 ou 90. Parâmetros desconhecidos são recusados.
- `GET /api/v1/painel`: contrato anterior preservado para compatibilidade; a interface ampliada usa `/painel/resumo`.
- `GET /api/v1/agenda/proximos`: reutiliza a consulta da Agenda com intervalo de até 90 dias, paginação e apenas agendados. Mantém os filtros de profissional e tipo.
- Lista de tarefas aceita `ate`; prazos aceitam `depois` exclusivo e `ate` inclusivo. São datas civis válidas.
- Interfaces de tarefas, prazos e casos abrem detalhes recebidos por `?id=`, independentemente da página atual.
- Clientes/casos aceitam os filtros provenientes do painel na URL, com indicação visível e opção de removê-los.
- Contratos e serviço: `backend/src/application/dashboard/`; consultas: `backend/src/infrastructure/prisma/prisma-dashboard-repository.ts`; HTTP: `backend/src/presentation/dashboard-routes.ts`; página e testes: `frontend/src/features/dashboard/`.

## Executar e verificar

No terminal, dentro de `src`, com as dependências e o banco já preparados:

```powershell
pnpm.cmd dev
```

Abra `http://localhost:5173/painel` com uma sessão válida. Reinicie o processo de desenvolvimento se ele ainda estiver executando a versão anterior. Não é necessário reinstalar Node, Git, PostgreSQL ou pnpm para esta etapa.

Verificações automatizadas:

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd build
$env:NODE_OPTIONS = '--no-experimental-webstorage'
pnpm.cmd --filter ./backend test -- --maxWorkers=2 --minWorkers=1
pnpm.cmd --filter ./frontend test -- --maxWorkers=2 --minWorkers=1
pnpm.cmd --filter ./backend run verify:dashboard
```

A opção de Node é necessária neste ambiente Node 26/Vitest 2/jsdom para evitar o conflito com o armazenamento experimental. Não é configuração do aplicativo nem mudança de política de execução do Windows.

`verify:dashboard` lê o `backend/.env` local, cria um banco com prefixo `webdireito_dashboard_test_` e nome aleatório, aplica as 14 migrations, verifica cenários fictícios e remove somente esse banco no final, inclusive em falhas. O usuário PostgreSQL usado na verificação precisa poder criar bancos. O banco normal do projeto não é limpo nem substituído. Credenciais não são impressas nem devem ser versionadas.

## Conferência manual e limites da entrega

A conferência manual foi adiada a pedido do responsável. Depois da implementação:

1. Entrar, abrir Painel e comparar “Eu” com “Todos do escritório”.
2. Alternar 7/30/90 dias e conferir a permanência dos atrasos.
3. Abrir um item e uma lista em cada grupo, conferir filtros e voltar.
4. Abrir os compromissos do painel, paginar quando houver mais de cem e retornar ao calendário.
5. Conferir os perfis autorizados e restritos, sem criar dados pessoais reais.
6. Registrar evidências de tela e explicar as regras de contagem para a apresentação.

Não há BI avançado, integração com calendário externo ou cálculo automático de prazos judiciais. As datas judiciais continuam informadas/confirmadas pelo fluxo existente.

A implementação e os testes receberam assistência de IA. A revisão humana, conferência visual, aceitação do grupo e publicação da entrega permanecem sob responsabilidade do aluno/equipe; os resultados automatizados não equivalem a essa aceitação.

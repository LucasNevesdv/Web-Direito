# Agenda — RF-078 a RF-088

Implementação do módulo atribuído a Matheus no catálogo da divisão do grupo e na Entrega 3. A numeração desta página é a do catálogo RF-001–117. A integração com o Dashboard RF-089–097 está implementada e documentada em [dashboard.md](dashboard.md).

## Uso

Entre no sistema e abra **Agenda**, ou `/agenda`. Selecione Dia, Semana ou Mês, a data de referência e, se necessário, profissional e tipo. A semana começa na segunda-feira; o mês mostra seis semanas, incluindo os dias vizinhos. Eventos que atravessam a meia-noite aparecem em todos os dias abrangidos. O fim do intervalo é exclusivo.

Em **Novo compromisso**, informe título, tipo, início e fim, participantes e, opcionalmente, descrição, local, link, vínculo e antecedência do lembrete. Os horários são interpretados no `FUSO_HORARIO` do backend, exibido na página, independentemente do fuso do computador. Links aceitam HTTP/HTTPS sem credenciais embutidas. A duração máxima de um compromisso é 31 dias.

Clique em um compromisso para abrir o detalhe. O endereço `/agenda?id=<identificador>` permite reabrir o mesmo registro, inclusive após recarregar. Edição usa a versão lida: uma gravação concorrente retorna conflito, preservando a primeira alteração. Realização e cancelamento exigem confirmação na tela, admitem observação e preservam o histórico. Registros encerrados não são editáveis; remarcações posteriores exigem novo compromisso.

## Requisitos atendidos pela implementação

| RF | Comportamento |
| --- | --- |
| 078 | Cadastro, consulta e edição persistentes no PostgreSQL. |
| 079 | Audiência, reunião, perícia e evento interno. |
| 080 | Vínculo opcional único a cliente, caso ou processo do escritório; seletor compartilhado e validação no servidor. |
| 081 | De 1 a 50 participantes distintos, identificados pelo ID do usuário com vínculo ativo no escritório. |
| 082 | Local e/ou link remoto opcionais; link validado no servidor e aberto sem acesso à janela de origem. |
| 083 | Início, fim e antecedência de 0 a 10.080 minutos; lembretes persistentes dentro da Agenda. |
| 084 | Dia, semana e mês, com navegação de período e eventos que atravessam dias. |
| 085 | Filtros de profissional e tipo executados no servidor. |
| 086 | Realização/cancelamento com controle de versão e histórico imutável. |
| 087 | Tarefas abertas e prazos pendentes na mesma visão, identificados pela origem e pela data civil. |
| 088 | Sobreposição de participantes exige confirmação explícita; confirmação registrada no histórico. |

## Decisões de acesso e concorrência

- A leitura é compartilhada entre membros ativos do escritório, seguindo o módulo de tarefas existente. Não há agenda privada por participante neste recorte.
- Todo membro ativo pode criar. Criador, participantes e gestores podem editar ou marcar realizado. Somente criador e gestores podem cancelar. Gestores são proprietário e administrador.
- Toda operação revalida sessão, usuário, escritório e vínculo pelo componente `office-access`; dados de outro escritório retornam 404. Lembretes são particulares do destinatário.
- A leitura compartilhada do compromisso não concede acesso aos cadastros vinculados. A busca de clientes exige `CLIENTE_VISUALIZAR`; casos e processos exigem `CASO_VISUALIZAR`, considerando os padrões do papel e as concessões atuais. Novos vínculos ou sua substituição na Agenda exigem essa leitura; a recusa retorna 403.
- Sem leitura do cadastro de origem, os rótulos automáticos do vínculo são ocultados nas listas, nos detalhes, nas respostas de gravação e no histórico apresentado. O identificador da referência é preservado, mas não autoriza consultar o cadastro. Título, descrição e demais campos próprios do compromisso continuam compartilhados segundo a regra da Agenda.
- Quem já pode editar um compromisso pode preservar seu vínculo atual mesmo após perder a leitura do cadastro. O formulário sinaliza o acesso restrito e mantém esse vínculo sem pesquisá-lo. O histórico persistido conserva o conteúdo original para leitores autorizados; a ocultação ocorre somente na resposta.
- Participantes são usuários do sistema, não contatos externos. Ao editar, participantes inativos precisam ser removidos. O histórico conserva os nomes anteriores.
- Um conflito é a interseção de intervalos de compromissos **agendados** que compartilham pelo menos um participante. Eventos adjacentes não conflitam. Realizados e cancelados não reservam horário.
- As escritas de Agenda são serializadas por escritório com bloqueio transacional PostgreSQL. A checagem e a gravação acontecem sob o mesmo bloqueio, inclusive com duas requisições simultâneas. Edições também verificam `version`.
- O banco aplica chaves estrangeiras, unicidade de participantes e regras de intervalo/vínculo. Compromisso, participantes, lembretes e histórico são gravados na mesma transação. Não se deve editar essas tabelas diretamente como fluxo de uso.

Essas regras são decisões de implementação alinhadas ao padrão de tarefas; ainda devem ser conferidas pelo grupo como regras do produto, especialmente a leitura compartilhada.

## Lembretes

São avisos **dentro da página Agenda**, sem e-mail, notificação do sistema operacional ou integração com calendários externos. A antecedência em branco desativa; zero avisa no início. Participantes e criador recebem um registro persistente por compromisso, sem duplicar o criador se ele também participa.

A API entrega os avisos com horário já atingido. A tela consulta imediatamente e a cada 30 segundos, mantendo um máximo de uma consulta em andamento. Ao retornar à Agenda depois de fechar o navegador, avisos pendentes continuam disponíveis. Marcar como lido persiste a leitura. Até 100 não lidos são exibidos por consulta; ao marcar os exibidos, os seguintes aparecem.

Editar o compromisso substitui seus agendamentos de lembrete, inclusive os já lidos; isso sinaliza a nova versão. Cancelar ou realizar remove os lembretes, mantendo o histórico do compromisso. Não depende do worker SMTP de tarefas/prazos.

## Integração e limites

- Usa os resolvedores existentes de cliente/caso/processo; não cria cópias desses cadastros.
- O trigger `appointment_history_audit` usa a função já existente `audit_from_history`. Eventos ficam disponíveis como **Compromisso** no filtro da Administração e entram na exportação do escritório.
- Histórico local mostra até 200 alterações recentes; o histórico completo permanece no banco e na exportação administrativa.
- Consultas do calendário e da visão unificada aceitam até 43 dias. Compromissos são paginados em 100 por página, com total e navegação visíveis. Em períodos com mais de 100, o calendário representa a página selecionada.
- A lista de compromissos aberta pelo Dashboard usa `GET /api/v1/agenda/proximos`, aceita até 90 dias e retorna somente agendados que intersectam a janela. Preserva o intervalo e o participante selecionados no painel, incluindo compromissos em andamento no início da janela. Exibe uma lista paginada; “Voltar ao calendário” retoma as visões diária/semanal/mensal.
- Visão unificada traz até 500 tarefas e 500 prazos por intervalo e avisa quando o total excede o carregado. Reduza o período/filtro para consultar o restante. O filtro de profissional usa o responsável dessas demandas; o filtro de tipo se aplica somente aos compromissos.
- “Abrir registro” nas tarefas e nos prazos da visão unificada leva ao detalhe específico por `/tarefas?id=<identificador>` ou `/prazos?id=<identificador>`, independentemente da página atual da listagem. Essa navegação foi integrada na etapa de Dashboard/RF-097.
- Google Calendar, Outlook, recorrência, disponibilidade externa e entrega de e-mail não estão incluídos. A interface permite um único horário de lembrete por compromisso.

## Organização do código

O módulo acompanha a arquitetura existente: contratos e regras em `application/agenda`, persistência em `infrastructure/prisma`, rotas Fastify/Zod em `presentation`, composição em `work-services` e React/Tailwind em `features/agenda`. Reutiliza autenticação, navegação, componentes de formulário, vínculos e tratamento de erros. Não adiciona dependências.

A busca compartilhada limpa opções antigas quando muda o tipo ou a pesquisa, descarta respostas canceladas e mostra falhas de acesso/rede em vez de um falso resultado vazio. O formulário de compromisso impede outro envio enquanto a gravação está pendente. Isso protege contra repetição na interface; não constitui uma chave de idempotência para requisições HTTP independentes.

Os ajustes e as verificações posteriores à implementação inicial estão em [revisao-integrada.md](revisao-integrada.md).

Principais rotas: `GET/POST /api/v1/agenda`, `GET /api/v1/agenda/proximos`, `GET/PATCH /api/v1/agenda/:id`, `POST /api/v1/agenda/:id/situacao`, `GET /api/v1/agenda/:id/historico`, configuração, itens civis, lembretes e marcação de leitura sob `/api/v1/agenda`. Todas exigem Bearer; escritas também exigem a origem configurada do frontend. Corpos são estritos e limitados; erros não expõem detalhes de persistência.

## Instalação e verificação

Na pasta `src`, com dependências instaladas e `backend/.env` configurado:

```powershell
pnpm.cmd --filter ./backend run prisma:generate
pnpm.cmd --filter ./backend exec prisma migrate deploy
pnpm.cmd dev
```

A migration `20261109010000_create_agenda` acrescenta as tabelas de Agenda e gatilhos. Não usa reset nem remove dados existentes. Ao atualizar um servidor já em execução, reinicie o backend depois da geração do Prisma e da migration.

Testes automatizados:

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
pnpm.cmd --filter ./backend run verify:agenda
```

`verify:agenda` exige um usuário PostgreSQL com permissão de criar banco. Cria um banco de nome aleatório `webdireito_agenda_test_*`, aplica todas as migrations, executa as verificações e remove somente esse banco. O banco do `.env` não é usado como destino dos testes. Cobre isolamento, participantes inativos, vínculos, filtros, eventos entre meses, conflitos simultâneos, edição concorrente, permissões, rollback, auditoria imutável, exportação, lembretes e HTTP.

No Node 26, os testes existentes com Vitest 2/jsdom podem conflitar com o `localStorage` nativo experimental. Para esta versão, execute os testes na mesma sessão PowerShell com:

```powershell
$env:NODE_OPTIONS = '--no-experimental-webstorage'
pnpm.cmd --filter ./backend --filter ./frontend exec vitest run --maxWorkers=2 --minWorkers=1
```

Essa opção é apenas para o processo de testes; não altera as políticas de segurança do navegador. O README geral também registra Node 24 como versão já verificada pelo projeto.

## Conferência manual antes da entrega

1. Entrar com uma conta de teste e criar uma reunião com participante, vínculo e lembrete de zero minutos.
2. Recarregar; abrir o mesmo registro; conferir dia, semana e mês, filtros e histórico.
3. Criar outra reunião sobreposta; verificar a recusa inicial e a confirmação explícita.
4. Editar em duas abas e verificar o conflito de versão na segunda gravação.
5. Marcar o lembrete como lido; recarregar; realizar/cancelar o evento e conferir histórico e Administração.
6. Conferir em tela estreita e por teclado. Registrar evidências reais; testes automatizados não substituem validação com o público-alvo.

Implementação produzida com assistência de IA (Codex), com verificações automatizadas descritas acima. Revisão e aceite humano pelo responsável/grupo e validação com público-alvo ainda devem ser registrados para a entrega acadêmica.

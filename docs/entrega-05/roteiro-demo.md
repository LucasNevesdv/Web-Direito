# Entrega 5 — Roteiro e dados da demonstração

Roteiro para preparar o ambiente e gravar o vídeo de demonstração do MVP. O ambiente deve estar pronto até
27/11/2026. Todos os dados abaixo são fictícios.

## 1. Preparar o ambiente (uma vez)

Siga o passo a passo do [README](../../README.md#como-executar-o-projeto-localmente). Resumo:

1. Crie um banco PostgreSQL **exclusivo para a demonstração** e configure `DATABASE_URL` em `src/backend/.env`.
2. Na pasta `src`, rode `pnpm install`, `pnpm --filter ./backend run configure:auth`,
   `pnpm --filter ./backend run prisma:generate` e `pnpm --filter ./backend exec prisma migrate deploy`.
3. Rode `pnpm run dev`, abra `http://localhost:5173/register` e cadastre o escritório da demonstração:

   | Campo | Valor |
   | :--- | :--- |
   | Nome do escritório | Silva & Paçoca Advogados |
   | Nome do administrador | Dra. Helena Silva |
   | E-mail | helena@demo.webdireito.test |
   | Senha | Demonstracao Web Direito 2026 |

   Depois, em **Equipe**, cadastre o advogado que fará as revisões: nome "Dr. Cocada Branca", e-mail
   `cocada@demo.webdireito.test`, papel Advogado e senha temporária `Primeiro Acesso 2026` (ele troca no primeiro
   acesso). O seed usa esse advogado como responsável pelas tarefas.
4. Pare o `pnpm run dev` (Ctrl+C) e rode `pnpm --filter ./backend run seed:dev`. O seed cria 6 clientes,
   4 casos, 3 processos com número CNJ, 3 prazos judiciais e 4 tarefas. Ele não cria compromissos de agenda. As tarefas "Revisar petição inicial…" e
   "Ligar para Dona Paçoca…" ficam vinculadas ao caso "Ação de Reparação por Explosão de Pipoca Doce em
   Cinema 4D".
5. Rode `pnpm run dev` novamente e entre com o e-mail e a senha acima.

**Envio de arquivos:** para mostrar um upload real, configure o MinIO conforme o
[guia técnico](../../src/README.md). Sem `S3_BUCKET`, o formulário abre normalmente, mas o envio responde que
o armazenamento está indisponível. Se não houver MinIO, mostre o formulário já vinculado (cena 5) sem enviar.

**Datas:** o seed calcula as datas a partir do dia em que roda. Rode o seed no dia da gravação ou na véspera
para que existam tarefas de hoje, atrasadas e futuras, e prazos críticos no painel.

## 2. Roteiro do vídeo (cerca de 4 minutos)

O cenário é o mesmo usado nos testes da Entrega 4: o escritório assumiu uma demanda urgente e a equipe
precisa organizar o trabalho sem perder prazos.

| Cena | Tela | O que fazer | O que falar | Tempo |
| :-: | :--- | :--- | :--- | :-: |
| 1 | Login | Entrar com a conta da Dra. Helena | "Cada escritório tem seus dados isolados; a sessão é protegida." | 0:15 |
| 2 | Painel | Mostrar prazos críticos e minhas tarefas | "Ao entrar, a advogada vê primeiro o que pode virar problema: prazos vencidos e próximos." | 0:30 |
| 3 | Clientes → Casos | Pesquisar "Paçoca", abrir Casos e **clicar na linha** do caso da pipoca | "Cliente, caso e processo ficam no mesmo lugar. Ajuste da validação: a linha inteira abre o caso." | 0:40 |
| 4 | Tarefas | Mostrar os **contadores** nas abas e abrir "Ligar para Dona Paçoca…" | "Depois dos testes, cada aba mostra quantas tarefas tem. Ninguém mais acha que a lista está vazia." | 0:40 |
| 5 | Tarefa → Documentos | Clicar em **Anexar arquivo ao caso da tarefa** | "A minuta é anexada direto da tarefa, já ligada ao caso certo." | 0:30 |
| 6 | Tarefa | Editar a tarefa, definir a Dra. Helena como revisora, concluir com observação e abrir o histórico | "Quem executa e quem revisa ficam claros, e o histórico não se perde." | 0:30 |
| 7 | Prazos judiciais | Mostrar origem, confirmação do advogado e destaque crítico | "O prazo judicial é separado da tarefa; a data é confirmada pelo advogado." | 0:25 |
| 8 | Agenda | Criar uma audiência ligada ao caso da pipoca e mostrar a semana | "A agenda junta compromissos, tarefas e prazos na mesma visão." | 0:30 |

## 3. Cuidados na gravação

- Use somente o banco de demonstração; não mostre dados reais de clientes.
- Feche outras abas e notificações do computador antes de gravar.
- Se algo falhar, recarregue a página; a sessão é restaurada automaticamente.
- Telas de referência para cada cena: [evidencias/entrega-05](../../evidencias/entrega-05).

# Arquitetura da TASK-002

O repositório Git está em `Neodireito/`; o workspace pnpm permanece em
`Neodireito/src/`, com as aplicações `backend/` e `frontend/`.

## Aplicação e infraestrutura

- `backend/src/database-health-checker.ts` define somente
  `DatabaseHealthChecker.check(): Promise<void>`.
- `backend/src/app.ts` constrói o Fastify e depende desse contrato. Não importa
  Prisma ou a infraestrutura. `/health` informa liveness sem chamar o verificador;
  `/ready` chama apenas `check()` e converte sucesso/falha em HTTP 200/503.
- `backend/src/database.ts` cria o Prisma Client e implementa o verificador com
  uma consulta `SELECT 1`. A dependência instalada é Prisma ORM 6.19.3, com o
  engine PostgreSQL padrão da versão 6, sem adaptador ou driver adicional.
- `backend/src/server.ts` valida o ambiente, cria o cliente e o verificador e
  injeta este último na aplicação. A conexão ao banco é aberta sob demanda;
  uma indisponibilidade do banco não impede o endpoint `/health` de funcionar.

Não há repositórios genéricos ou camadas adicionais sem consumidor.

## Limites de conexão e consulta

Na URL passada ao Prisma, a infraestrutura fixa `connect_timeout=5` e
`pool_timeout=5` (segundos), além de `socket_timeout=10`. Esses três parâmetros
substituem valores fornecidos na URL, inclusive `0`, para manter esperas finitas.
Os demais parâmetros, como TLS, schema, opções de sessão e `connection_limit`,
são preservados. O tamanho do pool usa o parâmetro existente ou o padrão do Prisma.
A URL modificada existe somente em memória e nunca é registrada em log.

A prontidão utiliza uma transação interativa com `maxWait=5000` e `timeout=10000`
(milissegundos). Dentro da mesma conexão/transação executa, em ordem:

```sql
SET LOCAL statement_timeout = '5s';
SELECT 1;
```

`statement_timeout` faz o próprio PostgreSQL abortar a consulta demorada.
`SET LOCAL` limita a configuração à transação; ao terminar com commit ou rollback,
o valor anterior é restaurado. Nenhuma configuração global, tabela ou dado de
negócio é alterado.

Os demais limites têm papéis distintos: `connect_timeout` limita abertura de
conexão, `pool_timeout` limita espera no pool, `socket_timeout` limita espera do
driver, `maxWait` limita aquisição da transação e `timeout` limita sua duração.
Não há `Promise.race` nem prazo HTTP de 5 segundos: obter conexão e iniciar a
transação pode aumentar o tempo total da resposta. Um timeout de espera HTTP,
isoladamente, não cancela a execução no PostgreSQL.

Referências oficiais consultadas para a versão instalada:

- [Conector PostgreSQL — Prisma ORM v6](https://www.prisma.io/docs/orm/v6/overview/databases/postgresql).
- [Transações interativas — Prisma ORM v6](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).
- [Prisma Engines 6.19.3: parâmetros da URL](https://github.com/prisma/prisma-engines/blob/6.19.3/quaint/src/connector/postgres/url.rs).
- [PostgreSQL: statement_timeout](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-STATEMENT-TIMEOUT).
- [PostgreSQL: SET LOCAL](https://www.postgresql.org/docs/current/sql-set.html).

## Ambiente e inicialização

`environment.ts` valida com Zod uma URL `postgres:` ou `postgresql:` com hostname
e banco, `HOST` como IP ou hostname, `PORT` entre 1 e 65535 e `NODE_ENV` como
development, test ou production. Os padrões são `127.0.0.1`, `3000` e development.
Erros informam somente os nomes das variáveis, nunca seus valores.

O arquivo `backend/.env` é resolvido a partir do módulo, com `../.env`, tanto em
`backend/src/environment.ts` quanto em `backend/dist/environment.js`. O loader
preenche uma cópia do ambiente, sem sobrescrever valores definidos no processo.
O exemplo ilustrativo está em `backend/.env.example`.

## Encerramento

`shutdown.ts` fornece uma função com Promise compartilhada: chamadas simultâneas
ou posteriores não repetem o cleanup. Tenta fechar Fastify e desconectar Prisma,
mesmo quando a primeira operação rejeita. Falhas são propagadas depois de ambas
as tentativas.

O bootstrap registra SIGINT e SIGTERM e trata rejeições do encerramento. Em falha
de inicialização, define `process.exitCode = 1` e aguarda o cleanup dos recursos
que chegaram a ser criados. Logs operacionais são genéricos; erros de validação
contêm apenas nomes de variáveis. Não usa `process.exit()` para antecipar a limpeza.

## Verificação

Os testes HTTP injetam verificadores falsos, sem Prisma; os testes de ambiente
usam dados isolados e arquivo temporário, sem ler o `.env` real. Testes de
infraestrutura verificam os limites e a configuração da transação; os de
encerramento verificam falhas e identidade da Promise. O bootstrap é testado com
dependências falsas e handlers capturados, sem enviar sinais ao processo real.

Na raiz do workspace: `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build`.
A validação manual com o banco local deve limitar-se a consultas de leitura e
encerrar somente os recursos criados para essa verificação.

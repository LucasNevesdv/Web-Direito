# Legal System

Fundação técnica do SaaS jurídico Legal System.

## Requisitos

- Node.js 20 ou superior
- pnpm 9 ou superior

## Instalação

Execute os comandos a partir de `Neodireito/src/`, que é a raiz do workspace pnpm:

```bash
pnpm install
pnpm --filter ./backend run prisma:generate
```

As credenciais locais ficam em `backend/.env`. Se esse arquivo ainda não existir,
crie-o usando `backend/.env.example` como referência e informe sua conexão
PostgreSQL. Preserve qualquer `.env` existente; não versione credenciais.

O backend valida `DATABASE_URL`, `HOST`, `PORT` e `NODE_ENV`. O padrão de escuta
é `HOST=127.0.0.1` e `PORT=3000`. Variáveis fornecidas pelo ambiente têm
precedência sobre `backend/.env`. Esse mesmo arquivo é carregado no código-fonte
e no build, independentemente do diretório de execução.

## Desenvolvimento

```bash
pnpm dev
```

A aplicação web fica disponível em `http://localhost:5173` e, por padrão, o
backend em `http://127.0.0.1:3000`.

## Verificações

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

A API expõe `GET /health`, que retorna `200 { "status": "ok" }` sem consultar
o banco, e `GET /ready`, que executa `SELECT 1` pelo Prisma. A prontidão retorna
`200 { "status": "ready" }` ou `503 { "status": "not_ready" }`, sem detalhes internos.

Para executar o backend compilado após o build:

```bash
node backend/dist/server.js
```

Os testes automatizados usam verificadores falsos e arquivos de ambiente
temporários; não precisam do banco nem leem `backend/.env`.

O cancelamento da consulta de prontidão é feito pelo PostgreSQL após 5 segundos,
com `SET LOCAL statement_timeout`, restrito à transação. O cliente também fixa
`connect_timeout=5`, `pool_timeout=5` e `socket_timeout=10`, substituindo esses
parâmetros da URL em memória, inclusive valores `0` que desativariam os limites.
Não modifica o arquivo `.env` nem a configuração global do PostgreSQL.
Detalhes da composição, encerramento e limites estão em
[`docs/architecture.md`](docs/architecture.md).

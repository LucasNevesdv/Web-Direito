# Legal System

SaaS jurídico Legal System, com cadastro inicial de escritório e primeiro
administrador disponível. Login e módulos de gestão permanecem nas próximas etapas.

## Requisitos

- Node.js 20 ou superior
- pnpm 9 ou superior
- PostgreSQL configurado para o backend

No Windows PowerShell, use `pnpm.cmd` caso a política local impeça executar
`pnpm.ps1`. Argon2id usa `argon2` 0.44.0, compatível com Node.js 24 e Windows
no ambiente desta entrega.

## Instalação

Execute os comandos a partir de `Neodireito/src/`, que é a raiz do workspace pnpm:

```bash
pnpm install
pnpm --filter ./backend run prisma:generate
```

As credenciais locais ficam em `backend/.env`. Se esse arquivo ainda não existir,
crie-o usando `backend/.env.example` como referência e informe sua conexão
PostgreSQL. Preserve qualquer `.env` existente; não versione credenciais.

Depois de configurar a conexão, aplique as migrations existentes sem recriar o
banco:

```bash
pnpm --filter ./backend exec prisma migrate deploy
pnpm --filter ./backend exec prisma migrate status
```

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

Acesse `http://localhost:5173/register` para cadastrar escritório e primeiro
administrador. O formulário chama `/api/v1/onboarding` na mesma origem. O proxy
do Vite encaminha `/api` ao backend local; se o backend usar outro endereço ou
porta, defina `BACKEND_PROXY_TARGET` no ambiente do processo do frontend. O padrão
é `http://127.0.0.1:3000`; essa variável configura o servidor Vite e não uma URL
fixa de produção no bundle.

O cadastro cria escritório, usuário e vínculo OWNER atomicamente. A confirmação
informa que o login será disponibilizado na próxima etapa; não há sessão ou
token automático. A API responde 201 no sucesso, 400 para dados inválidos, 409
para e-mail já cadastrado e 500 com erro genérico.

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

Os testes unitários, HTTP e de interface usam dependências e dados isolados;
não precisam do banco nem leem `backend/.env`. Os testes de ambiente usam
arquivos temporários.

As verificações reais são optativas e usam explicitamente a configuração local:

```bash
pnpm --filter ./backend run verify:office-repository
pnpm --filter ./backend run verify:onboarding
```

O primeiro comando verifica criação e recuperação de um escritório. O segundo
exercita o endpoint com PostgreSQL, proteção da senha, rollback após falha no
vínculo e conflito concorrente de e-mail. Ambos removem somente os registros
temporários criados por eles e verificam a limpeza; não integram `pnpm test`.

O cancelamento da consulta de prontidão é feito pelo PostgreSQL após 5 segundos,
com `SET LOCAL statement_timeout`, restrito à transação. O cliente também fixa
`connect_timeout=5`, `pool_timeout=5` e `socket_timeout=10`, substituindo esses
parâmetros da URL em memória, inclusive valores `0` que desativariam os limites.
Não modifica o arquivo `.env` nem a configuração global do PostgreSQL.
Detalhes da composição, encerramento e limites estão em
[`docs/architecture.md`](docs/architecture.md).

Para servir o frontend compilado em produção, configure fallback de rotas da
SPA para `/register` e um proxy reverso de `/api` para o backend na mesma origem.
O proxy de desenvolvimento do Vite não substitui essa configuração de produção.
Login, verificação de e-mail, recuperação de senha, convites, gerenciamento de
membros, autenticação em dois fatores e proteção avançada contra abuso do cadastro
público permanecem pendentes.

# Legal System

SaaS jurídico Legal System, com cadastro inicial de escritório e primeiro
administrador, login, renovação automática, logout e identidade autenticada disponíveis. Os módulos
de gestão permanecem nas próximas etapas.

## Requisitos

- Node.js 20.19 ou superior (verificado com Node.js 24 no Windows)
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

Configure uma vez o segredo local de autenticação, sem exibi-lo:

```bash
pnpm --filter ./backend run configure:auth
```

O comando acrescenta `AUTH_JWT_SECRET` apenas se ausente e preserva as demais
configurações. Em produção, forneça um segredo aleatório próprio de pelo menos
32 bytes em base64url; não há segredo padrão. `backend/.env.example` documenta
emissor, audiência e prazos: access token 900 segundos e refresh 604800 segundos.
Todas essas variáveis passam pela validação do ambiente.

`AUTH_FRONTEND_ORIGIN` informa a origem exata autorizada para os POSTs de
autenticação, sem barra final; padrão local `http://localhost:5173`. Se acessar
por IP, configure `http://127.0.0.1:5173`. Produção exige uma origem HTTPS explícita.
Mantenha o proxy de `/api` na mesma origem; CORS não está habilitado.

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

O contrato JSON usa português brasileiro; as alterações e exceções estão em
[Nomenclatura](docs/nomenclature.md). Frontend e backend devem ser atualizados juntos.

O cadastro cria escritório, usuário e vínculo PROPRIETARIO atomicamente. A confirmação
oferece link para `/login`; não há sessão ou token automático no cadastro.
A API responde 201 no sucesso, 400 para dados inválidos, 409
para e-mail já cadastrado e 500 com erro genérico.

Em `/login`, informe e-mail e senha. O frontend chama `POST /api/v1/auth/login`,
mantém access token só em memória e consulta `GET /api/v1/auth/me` para mostrar
usuário, escritório e papel. O refresh fica exclusivamente em cookie HttpOnly,
SameSite=Lax e Path=/api/v1/auth; Secure em produção e desligado no HTTP local.
O banco armazena somente SHA-256 do refresh, composto por UUID público da sessão
e segredo aleatório de 256 bits. RF-004, RF-005 e RF-006 estão concluídos: ao
recarregar, `POST /api/v1/auth/refresh` restaura a área `/app` e rotaciona o cookie.
A sessão expira absolutamente sete dias após o login, sem prorrogação pela rotação.
O cliente HTTP compartilha uma Promise de renovação entre requisições concorrentes
e repete cada requisição com 401 uma única vez. Não usa localStorage,
sessionStorage ou IndexedDB para tokens. A área protegida só aparece após validação.

Reutilizar um refresh antigo revoga a sessão inteira. O botão Sair chama
`POST /api/v1/auth/logout`, revoga a sessão, remove o cookie e limpa a memória.
Não há blacklist de JWT: um access token emitido pode ter validade residual de
até 15 minutos; `/me` já consulta a sessão e rejeita sua revogação imediatamente.
Sessões do formato anterior de refresh precisam de novo login, sem apagar dados.
Se o logout falhar por indisponibilidade, a interface informa que o encerramento
no servidor não foi confirmado; a memória local é limpa.

Mais de um escritório ativo gera conflito explícito até existir seleção de escritório.
POST obrigatório,
validação exata de Origin (ausente/null também recusados), cookie SameSite=Lax e
ausência de CORS compõem a proteção CSRF. Logs HTTP continuam desativados.

### Múltiplas abas e proteção compartilhada

Abas da mesma origem usam BroadcastChannel para compartilhar somente access token
e identidade em memória. Web Locks serializa login, refresh e logout; abas que
aguardam reutilizam o resultado já renovado. Login, logout, renovação e falha
definitiva se propagam; o vencimento do access token também aciona a renovação.
Mensagens antigas/de outra sessão são descartadas. Não há janela de tolerância
para reutilizar refresh: uma resposta perdida após a rotação pode exigir novo login.

O fluxo completo requer navegador atual com BroadcastChannel, Web Locks e
AbortSignal.any/timeout: Chrome, Edge, Firefox ou Safari, em HTTPS ou localhost.
A verificação automatizada real usa Chrome. Sem BroadcastChannel, Web Locks ainda
serializa as chamadas, mas cada aba pode renovar sequencialmente e detecta logout
na próxima consulta/expiração. Sem Web Locks, a renovação automática é desativada;
login manual continua disponível e o canal, quando presente, propaga o estado.
Não há locks ou tokens em armazenamento persistente, nem tentativas infinitas.

O PostgreSQL compartilha contadores atômicos entre todas as instâncias:

| Escopo | Limite padrão | Janela |
| --- | --- | --- |
| Cadastro por IP | 10 | 900 s |
| Login por IP | 30 em desenvolvimento/teste; 10 em produção | 900 s |
| Login por IP + e-mail normalizado | 5 | 900 s |
| Refresh por IP | 30 | 60 s |

Todas as tentativas contam. Excesso retorna 429 com `Retry-After` em segundos;
falha do armazenamento retorna 503 e `Retry-After: 5`, sem liberar a operação.
Janelas são fixas pelo relógio do banco. `backend/.env.example` lista os controles.
Mantenha limites/janelas e segredo iguais nas réplicas. HMAC-SHA-256 protege as
chaves; não há IP/e-mail legível, corpo, senha, cookie ou token na tabela.
O segredo opcional `RATE_LIMIT_HMAC_SECRET` permite separar a chave; se omitido,
ela é derivada de `AUTH_JWT_SECRET` com contexto próprio. Trocar a chave reinicia
os limites associados; não é um procedimento de desbloqueio de usuário.

A cada 60 s, cada processo remove até 500 buckets expirados com `SKIP LOCKED`.
O timer não mantém o Node ativo e é encerrado no shutdown. `TRUST_PROXY` vazio
mantém a confiança desativada; em produção, informe somente IPs/CIDRs dos proxies
controlados, restrinja acesso direto ao backend e faça o proxy substituir os
cabeçalhos de encaminhamento recebidos. Não use confiança irrestrita.

O favicon provisório WD está em `frontend/public/favicon.svg` e acompanha o build.
Redis não é utilizado; uma troca futura do adaptador exige decisão e validação próprias.

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
pnpm --filter ./backend run verify:auth-browser
pnpm --filter ./backend run verify:rate-limit
```

O primeiro comando verifica criação e recuperação de um escritório. O segundo
exercita o endpoint com PostgreSQL, proteção da senha, rollback após falha no
vínculo e conflito concorrente de e-mail. Ambos removem somente os registros
temporários criados por eles e verificam a limpeza; não integram `pnpm test`.
O terceiro comando exige build atualizado e Chrome instalado; usa o Chrome do
caminho padrão do Windows ou `CHROME_PATH` informado no ambiente. Preenche os
formulários reais, testa cookie, `/me`, restauração após recarga, expiração
controlada, rotação, reutilização e logout no PostgreSQL. Remove todos os
registros temporários e fecha seus processos. Configura o proxy e a origem
temporários usando HOST/PORT locais, sem sobrescrever `.env`.
Também abre duas abas no mesmo perfil, provoca dois 401 reais com JWT expirado,
confirma uma renovação, verifica propagação de login/logout/revogação e favicon 200.
O quarto comando inicia dois processos Node em portas livres e confere limites
compartilhados, concorrência, próxima janela e SQL de limpeza no PostgreSQL.
Ambos usam segredo HMAC temporário em memória e removem somente seus buckets,
sem consumir o orçamento de tentativas dos usuários locais.

O cancelamento da consulta de prontidão é feito pelo PostgreSQL após 5 segundos,
com `SET LOCAL statement_timeout`, restrito à transação. O cliente também fixa
`connect_timeout=5`, `pool_timeout=5` e `socket_timeout=10`, substituindo esses
parâmetros da URL em memória, inclusive valores `0` que desativariam os limites.
Não modifica o arquivo `.env` nem a configuração global do PostgreSQL.
Detalhes da composição, encerramento e limites estão em
[`docs/architecture.md`](docs/architecture.md).

Para servir o frontend compilado em produção, configure fallback de rotas da
SPA para `/register`, `/login` e `/app` e um proxy reverso de `/api` para o backend na mesma origem.
O proxy de desenvolvimento do Vite não substitui essa configuração de produção.
Verificação de e-mail, recuperação de senha, convites, gerenciamento de
membros, autenticação em dois fatores e proteção avançada contra abuso do cadastro
público permanecem pendentes.

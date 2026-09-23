# Arquitetura do backend

O repositório Git está em `Neodireito/`; o workspace pnpm permanece em
`Neodireito/src/`, com as aplicações `backend/` e `frontend/`.

## Aplicação e infraestrutura

- `backend/src/database-health-checker.ts` define somente
  `DatabaseHealthChecker.check(): Promise<void>`.
- `backend/src/app.ts` constrói o Fastify e recebe esse contrato e o caso de uso
  de cadastro e os serviços de autenticação. Não importa Prisma ou a infraestrutura. `/health` informa liveness sem chamar o verificador;
  `/ready` chama apenas `check()` e converte sucesso/falha em HTTP 200/503.
- `backend/src/database.ts` cria o Prisma Client e implementa o verificador com
  uma consulta `SELECT 1`. A dependência instalada é Prisma ORM 6.19.3, com o
  engine PostgreSQL padrão da versão 6, sem adaptador ou driver adicional.
- `backend/src/server.ts` valida o ambiente e compõe Prisma, verificador de
  prontidão, repositório de cadastro, Argon2id e casos de uso, injetando as
  dependências na aplicação. A conexão ao banco é aberta sob demanda;
  uma indisponibilidade do banco não impede o endpoint `/health` de funcionar.

Não há repositórios genéricos ou camadas adicionais sem consumidor.

## Domínio e persistência de escritórios — TASK-003

As novas camadas ficam em `backend/src/`, sem mover os arquivos estáveis da
TASK-002:

| Camada | Arquivos | Responsabilidade |
| --- | --- | --- |
| Domínio | `domain/offices/office.ts`, `domain/offices/invalid-office-error.ts` | Entidade `Office`, validação das invariantes e erro previsível de domínio; sem dependências de Prisma, Fastify, Zod ou das outras camadas. |
| Aplicação | `application/offices/create-office.ts`, `application/offices/offices-repository.ts` | Caso de uso `CreateOffice` e contrato específico `OfficesRepository`, com `create` e `findById`; depende do domínio e não conhece Prisma. |
| Infraestrutura | `infrastructure/prisma/prisma-offices-repository.ts`, `infrastructure/prisma/office-mapper.ts` | Persistência com Prisma e conversão entre o registro armazenado e a entidade; depende dos contratos da aplicação e do domínio. |

`CreateOffice` recebe somente `name`, cria uma entidade válida, persiste pelo
contrato e retorna o escritório. O repositório Prisma recebe o cliente como
dependência. O mapper reconstitui a entidade preservando UUID, estado e datas.
O repositório em memória fica em `backend/tests/support/` e atende ao mesmo
contrato nos testes de aplicação, sem exigir PostgreSQL.

`Office` é a raiz do tenant: os futuros clientes, processos, tarefas e documentos
terão vínculo com um escritório. `CreateOffice` permanece um caso de uso interno,
sem endpoint próprio. O cadastro público descrito abaixo cria o escritório junto
ao usuário administrador em outra operação, com uma única transação. Autorização
e isolamento das consultas dos demais módulos ainda não estão implementados.

### Persistência

O schema está em `backend/prisma/schema.prisma`; migrations versionadas ficam
em `backend/prisma/migrations/`. A primeira migration,
`20260922163757_create_offices`, cria a tabela de escritórios e o enum de estado.
A aplicação usa nomes em camelCase; os nomes
SQL adotam snake_case: `Office` mapeia para `offices`, `OfficeStatus` para
`office_status`, `createdAt` para `created_at` e `updatedAt` para `updated_at`.
Este é o padrão inicial da persistência de negócio.

O ID usa UUID nativo. O nome usa `varchar(120)`; o estado permite `ACTIVE` e
`INACTIVE`, com padrão `ACTIVE`. Datas usam `timestamptz(3)` e são fornecidas
pelo domínio, sem atualização automática de `updatedAt` no Prisma. Não há
operação de atualização nesta tarefa. Além da chave primária, não são criados
índices extras nem restrição de unicidade do nome sem uso ou regra confirmados.

Alterações de schema devem passar por migration com SQL revisado antes da
aplicação, preservando os dados existentes; não usar `db push`, reset ou seed
como substitutos desse fluxo.

## Cadastro público de escritório e primeiro administrador — RF-001 e RF-002

O fluxo disponível em `/register` envia `officeName`, `adminName`, `email` e
`password` para `POST /api/v1/onboarding`. A confirmação de senha existe somente
no formulário. Nenhum ID, papel, estado ou data é aceito do cliente.

| Camada | Componentes | Responsabilidade |
| --- | --- | --- |
| Domínio | `User`, `Membership` e seus erros específicos | Validar nome, e-mail, UUIDs, datas, estado `ACTIVE` do usuário e papel `OWNER` do vínculo; armazenar somente `passwordHash`, sem dependência de frameworks. |
| Aplicação | `RegisterOfficeWithOwner`, `OfficeRegistrationRepository`, `PasswordHasher` | Normalizar e validar entrada, verificar e-mail existente, proteger a senha, criar as três entidades, solicitar persistência atômica e retornar dados públicos. |
| Infraestrutura | `PrismaOfficeRegistrationRepository`, `Argon2PasswordHasher` | Executar a transação de cadastro, traduzir conflito de e-mail e implementar Argon2id. |
| Apresentação | `presentation/onboarding-route.ts` | Validar o corpo com Zod estrito, rejeitar campos extras e serializar somente dados públicos e erros sanitizados. |
| Frontend | Página `/register` | Validar campos e confirmação, impedir envio duplicado, apresentar erro por campo, conflito e confirmação de cadastro; não persistir senha no navegador. |

Os nomes são normalizados com trim e têm entre 2 e 120 pontos de código Unicode.
O e-mail recebe trim e lowercase, tem formato validado e é único globalmente.
A senha tem entre 12 e 128 caracteres e não sofre trim. O primeiro vínculo é
sempre `OWNER`, único papel implementado e responsável pela autoridade
administrativa máxima prevista. A aplicação dessa autoridade às operações
protegidas depende da futura autenticação e autorização.

O hash é calculado antes da transação, evitando manter conexão do banco durante
o trabalho do Argon2. A transação grava `Office`, `User` e `Membership`, nessa
ordem, com `maxWait=5000` e `timeout=10000` milissegundos; qualquer falha desfaz
as três gravações. A consulta prévia de e-mail melhora a resposta ao usuário,
mas a restrição única do PostgreSQL garante a unicidade em concorrência. O
repositório converte esse conflito em `EmailAlreadyRegisteredError`.

A migration `20260923160423_create_users_and_memberships`, revisada e aplicada,
acrescenta `users`, `memberships`, `user_status` e `membership_role`. Há unicidade
de `users.email` e de `(office_id, user_id)`, além de chaves estrangeiras para
escritório e usuário com `RESTRICT` na exclusão e na atualização. O estado do
usuário admite `ACTIVE` e `INACTIVE` desde RF-003; o único papel é `OWNER`. As migrations anteriores
e os dados existentes são preservados.

O endpoint retorna HTTP 201 com os cinco campos públicos de escritório, somente
`id`, `name` e `email` do usuário e `role: OWNER`. HTTP 400 indica entrada
inválida, 409 indica e-mail existente e 500 contém mensagem genérica. Projeção
explícita e schemas de resposta impedem serializar campos adicionais. Erros de
JSON, tipo de conteúdo e corpo acima de 16 KiB também são sanitizados. O logger
HTTP permanece desativado; senhas, hashes e erros brutos de infraestrutura não
integram respostas ou logs. Não há token, cookie de sessão ou login automático.

### Proteção de senha

`argon2` 0.44.0 implementa Argon2id, com `memoryCost=19456` KiB (19 MiB),
`timeCost=2`, `parallelism=1` e saída de 32 bytes. A biblioteca gera um salt
criptográfico aleatório de 16 bytes por operação. Esses parâmetros seguem o
mínimo recomendado pela OWASP; o custo deve ser reavaliado com medição no ambiente
de produção. A biblioteca é compatível com o ambiente Node.js 24 e Windows usado
nesta entrega. Nenhum algoritmo próprio é empregado.

- [node-argon2 0.44.0](https://github.com/ranisalt/node-argon2/tree/v0.44.0).
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

RF-002 foi atendido como condição técnica da atomicidade de RF-001: cadastro
inicial do usuário e de seu vínculo. O login foi entregue em RF-003. Permanecem pendentes verificação de
e-mail, recuperação de senha, convites, gerenciamento de membros, autenticação
em dois fatores e proteção avançada contra abuso do endpoint público. Não foram
implementados auditoria de negócio, permissões customizáveis ou isolamento de
consultas dos demais módulos entre escritórios nesta entrega.

## Autenticação e sessão — RF-003

`application/authentication/` contém `AuthenticateUser`, `GetAuthenticatedIdentity`
e contratos específicos para consultas de autenticação, sessões e tokens. Não
importa Prisma, JWT, Fastify ou cookies. A entidade `Session` valida UUIDs,
datas e o digest do refresh, mantendo estado privado. `User` admite INACTIVE para
negar acesso; não há operação administrativa de inativação nesta entrega.

O login normaliza o e-mail e verifica Argon2id antes de avaliar estado e vínculos.
Quando o e-mail não existe, verifica um hash de referência gerado uma vez no
bootstrap, com os mesmos parâmetros do cadastro. Erros internos distinguem
credenciais inválidas, usuário inativo e ausência de escritório ativo; todos
resultam no mesmo HTTP 401 externo. Mais de um escritório ativo retorna 409,
pois seleção de escritório ainda não existe.

`PrismaAuthenticationRepository` consulta o usuário e seus vínculos, persiste
Session e recupera sessão por ID para `/me`. A migration
`20260923171012_create_sessions` acrescenta `sessions`, INACTIVE ao enum de usuário
e índice de `memberships.user_id`, usado na busca dos vínculos no login.
Session referencia usuário, escritório e o par do Membership com RESTRICT.
A chave primária atende a busca por sessão; não há índices especulativos de
expiração, usuário ou escritório em Session. As datas e o formato SHA-256 possuem
restrições no domínio e no banco; `revokedAt` e `lastUsedAt` começam nulos.
Não há atualização de `lastUsedAt` ou endpoint de revogação nesta entrega.

`JoseAccessTokens` usa a biblioteca `jose` e HS256 fixo. O token contém `sub`,
`sessionId`, `activeOfficeId`, `role`, `iat`, `exp`, `iss` e `aud`, sem dados
pessoais. A verificação exige assinatura, algoritmo, tipo JWT, emissor, audiência,
claims obrigatórias e prazo máximo de 900 segundos; rejeita emissão futura.
O segredo base64url de pelo menos 32 bytes é obrigatório em todos os ambientes,
sem valor padrão. `authentication.ts` compõe adaptadores e casos de uso no bootstrap.

`CryptoRefreshTokens` usa 32 bytes aleatórios criptográficos e persiste somente
SHA-256 do token. Esse hash rápido é adequado ao segredo aleatório de 256 bits;
as senhas humanas continuam usando Argon2id. Session dura, por padrão, 604800
segundos. O token original só sai por cookie `refresh_token`, HttpOnly,
SameSite=Lax, Path=/api/v1/auth, sem Domain, com Max-Age/Expires e Secure em
produção. O desenvolvimento HTTP local usa Secure=false. Produção exige HTTPS.

`POST /api/v1/auth/login` aceita apenas e-mail e senha, retorna access token,
`expiresIn` e identidade pública; não retorna refresh nem hashes no JSON.
`GET /api/v1/auth/me` exige Bearer, valida o JWT e reconfirma sessão não revogada
ou expirada, usuário/escritório ACTIVE e vínculo/papel atuais no banco.
Respostas de autenticação usam Cache-Control: no-store. Cookies não autenticam
`/me` e não existe renovação ou logout.

`@fastify/rate-limit` limita o login antes do trabalho de Argon2: 10 tentativas
por IP em 15 minutos na produção e 30 no desenvolvimento/teste, incluindo
tentativas bem-sucedidas. Retorna 429 e Retry-After. O armazenamento é local ao
processo, reinicia com o serviço e não coordena réplicas. `trustProxy` permanece
desativado: X-Forwarded-For enviado pelo cliente não permite escapar do limite.
Implantações com proxy precisam definir confiança e limite distribuído antes de
escalar. Não há nova dependência de Redis ou proteção avançada do cadastro.

`/login` guarda access token somente em um ref em memória, chama `/me` e exibe
nome, escritório e papel em uma área provisória. Requisições usam credenciais
para aceitar o cookie. Ao recarregar, a memória é perdida e o usuário precisa
entrar novamente, mesmo com cookie presente. RF-005 consumirá esse cookie;
RF-006 implementará logout. Nenhum token é gravado em localStorage/sessionStorage
ou exibido na interface. O logger HTTP permanece desligado.

Referências: [jose](https://github.com/panva/jose),
[@fastify/cookie](https://github.com/fastify/fastify-cookie),
[@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit),
[OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
e [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

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

O ambiente também exige `AUTH_JWT_SECRET` e valida `AUTH_JWT_ISSUER`,
`AUTH_JWT_AUDIENCE`, `AUTH_ACCESS_TTL_SECONDS` (60–900; padrão 900) e
`AUTH_REFRESH_TTL_SECONDS` (3600–604800; padrão 604800). O comando local
`configure:auth` acrescenta segredo aleatório somente quando ausente; não exibe
o valor e preserva as demais configurações. Não é executado automaticamente em
produção, que deve fornecer seu próprio segredo seguro.

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
A validação de prontidão com o banco local usa somente consultas de leitura.
Os testes de domínio e de `CreateOffice` não exigem banco nem leem o `.env` real.
A verificação real do repositório Prisma é separada da suíte comum: usa um único
escritório identificável como teste, recupera e compara seus dados, remove somente
esse registro e confirma sua ausência ao terminar. Em qualquer verificação,
encerrar somente os recursos criados para ela.

Para executar essa verificação explicitamente, a partir do workspace `src/`,
usar `pnpm --filter ./backend run verify:office-repository`. Ela utiliza a
configuração local existente e fica fora da suíte comum de testes.

O cadastro possui testes de domínio, aplicação, hash, repositório, API e
formulário sem PostgreSQL. A verificação optativa
`pnpm --filter ./backend run verify:onboarding` usa o banco local para exercitar
o endpoint, o armazenamento protegido, a concorrência de e-mail e o rollback
real. Uma extensão Prisma exclusiva da verificação provoca falha ao criar o
vínculo depois das gravações de escritório e usuário; o teste confirma que os
três registros não permaneceram. Uma barreira sincroniza duas verificações de
e-mail antes da gravação, exercitando a restrição única do PostgreSQL. A limpeza
usa os identificadores e marcadores exatos dos registros criados e confirma
ausência de resíduos. Esse comando lê a configuração local explicitamente;
não integra a suíte unitária padrão.

Após o build, `pnpm --filter ./backend run verify:auth-browser` inicia os serviços
locais e Chrome headless com perfil temporário, cria a conta por `/register`,
entra por `/login`, inspeciona cookie/requisições e confirma Session no PostgreSQL.
Também testa senha errada e perda do token após reload. Nenhum segredo é impresso;
o cleanup remove Session, Membership, User e Office próprios nessa ordem e fecha
somente os recursos criados. A suíte unitária não depende desse comando ou do banco.

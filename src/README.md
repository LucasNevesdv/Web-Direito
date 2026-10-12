# Legal System

SaaS jurídico Legal System. RF-001 a RF-014 entregam cadastro de escritório e
proprietário, autenticação, recuperação e alteração de senha, equipe, sessões,
seleção de escritório e isolamento dos módulos existentes. Clientes, casos e os
demais módulos jurídicos permanecem nas próximas etapas.

## Recuperação e alteração de senha

RF-007 e RF-008 disponibilizam `/recuperar-senha`, `/redefinir-senha` e
`/seguranca`. As rotas POST correspondentes são
`/api/v1/auth/recuperar-senha` (202 genérico),
`/api/v1/auth/redefinir-senha` (200) e
`/api/v1/auth/alterar-senha` (200, Bearer e sessão ativa).
Todas exigem `Origin` autorizado. Erros de validação/token/senha retornam 400;
sessão inválida, 401; limite, 429 com Retry-After; falhas internas, 503 sanitizado.

Configure e-mail pelas variáveis de `backend/.env.example`, preservando o `.env`
existente. Desenvolvimento usa `PROVEDOR_EMAIL=smtp`, `SMTP_HOST`, `SMTP_PORT`
e `SMTP_SEGURO`; autenticação é opcional e exige `SMTP_USUARIO`/`SMTP_SENHA`
juntos. `URL_FRONTEND` é a origem pública sem barra final, usada no link, e
`EMAIL_REMETENTE` informa o remetente. Produção usa `PROVEDOR_EMAIL=resend`,
`RESEND_API_KEY`, frontend HTTPS e remetente de domínio verificado no provedor.
Configuração incompleta falha antes de escutar; indisponibilidade do provedor
não altera `/ready`. Nunca defina essas credenciais com prefixo `VITE_`.

O token expira em 30 minutos, funciona uma vez e só tem hash persistido.
Troca bem-sucedida revoga todas as sessões e exige novo login. A confirmação
de recuperação não revela se existe conta. O 202 confirma a persistência do
trabalho elegível no PostgreSQL; reinícios não perdem trabalhos pendentes.
Aplique migrations com `pnpm --filter ./backend exec prisma migrate deploy`
antes de iniciar a versão atual.

`EMAIL_FILA_INTERVALO_MS` define o polling (1.000 ms); lease padrão de 60 s,
até cinco tentativas e atraso exponencial de 30 s até 3.600 s. Os trabalhos
finais permanecem sete dias e a limpeza usa lotes de 500. Todos os parâmetros
`EMAIL_FILA_*` estão no exemplo do backend; use políticas iguais nas réplicas.
O encerramento aguarda até 30 s. Depois de aceite do provedor com confirmação
perdida no banco, outro e-mail pode ser enviado com novo token; só o mais
recente vale. Consulte [architecture.md](docs/architecture.md).

Após `pnpm build`, execute a verificação real explicitamente:

```bash
pnpm --filter ./backend run verify:password-security
```

Ela inicia SMTP de captura, Chrome headless real e duas instâncias do backend;
confirma reinício após 202, lease abandonado, retentativa SMTP, rollback e limpeza;
usa o PostgreSQL configurado, dados únicos e limpa somente seus registros,
mensagens e processos. Exige Chrome instalado (`CHROME_PATH` opcional).
Não envia e-mails externos. Integração Resend implementada e contrato HTTP
testado; entrega externa não executada por ausência de credenciais/domínio
verificado e destinatário de teste autorizado confirmados.

## Requisitos

- Node.js 20.19 ou superior (verificado com Node.js 24 no Windows)
- pnpm 9 ou superior
- PostgreSQL configurado para o backend

No Windows PowerShell, use `pnpm.cmd` caso a política local impeça executar
`pnpm.ps1`. Argon2id usa `argon2` 0.44.0, compatível com Node.js 24 e Windows
no ambiente desta entrega.

## Organização

`backend/src/domain/` contém entidades e regras sem frameworks;
`backend/src/application/` contém casos de uso e contratos específicos;
`backend/src/infrastructure/` implementa Prisma, segurança e e-mail;
`backend/src/presentation/` valida HTTP e serializa respostas. `server.ts`
compõe as implementações. O schema e as migrations ficam em `backend/prisma/`.
No frontend, `frontend/src/` reúne páginas, cliente de autenticação e os
coordenadores do navegador. Consulte [arquitetura](docs/architecture.md) e
[nomenclatura](docs/nomenclature.md) antes de ampliar um módulo.

Para incluir um recurso de escritório, obtenha o contexto da sessão validada
no backend, revalide vínculo e permissão atuais e filtre consultas, alterações
e histórico pelo escritório e pelo identificador do recurso. Recursos alheios
retornam 404. Somente os endpoints específicos de seleção e troca recebem o
identificador do escritório de destino, sempre com validação do vínculo. O
módulo de equipe mostra esse padrão; cada novo módulo precisa de testes de
isolamento próprios.

## Instalação

Execute os comandos a partir de `Neodireito/src/`, que é a raiz do workspace pnpm:

```bash
pnpm install
pnpm --filter ./backend run prisma:generate
```

As credenciais locais ficam em `backend/.env`. Se esse arquivo ainda não existir,
crie-o usando `backend/.env.example` como referência e informe sua conexão
PostgreSQL. Preserve qualquer `.env` existente; não versione credenciais.
`frontend/.env.example` mostra o intervalo de verificação de sessão e o destino
do proxy local. Os padrões funcionam sem arquivo adicional; para personalizá-los,
copie o exemplo para `frontend/.env.local` e ajuste os valores. Não coloque
segredos em variáveis com prefixo `VITE_`, pois elas integram o bundle do navegador.

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

Com vários vínculos ativos, o login exige seleção explícita de escritório antes
de emitir uma sessão completa ou o cookie de renovação. Métodos POST protegidos,
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

A API expõe `GET /health`, que retorna `200 { "situacao": "ok" }` sem consultar
o banco, e `GET /ready`, que executa `SELECT 1` pelo Prisma. A prontidão retorna
`200 { "situacao": "ready" }` ou `503 { "situacao": "not_ready" }`, sem detalhes internos.

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
pnpm --filter ./backend run verify:password-security
pnpm --filter ./backend run verify:team
pnpm --filter ./backend run verify:sessions
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
Os três últimos verificam recuperação/alteração de senha com SMTP local,
primeiro acesso e equipe, e seleção/troca de escritório e sessões com três
abas, respectivamente. Exigem build atualizado, Chrome e PostgreSQL locais;
cada verificador identifica e remove seus registros temporários e encerra os
processos que iniciou. A validação realizada é local, sem afirmar prontidão
operacional em produção.

O cancelamento da consulta de prontidão é feito pelo PostgreSQL após 5 segundos,
com `SET LOCAL statement_timeout`, restrito à transação. O cliente também fixa
`connect_timeout=5`, `pool_timeout=5` e `socket_timeout=10`, substituindo esses
parâmetros da URL em memória, inclusive valores `0` que desativariam os limites.
Não modifica o arquivo `.env` nem a configuração global do PostgreSQL.
Detalhes da composição, encerramento e limites estão em
[`docs/architecture.md`](docs/architecture.md).

Para servir o frontend compilado em produção, configure fallback de rotas da
SPA para `/register`, `/login`, `/app`, `/equipe`, `/primeiro-acesso`,
`/recuperar-senha`, `/redefinir-senha`, `/seguranca`, `/seguranca/sessoes` e
`/selecionar-escritorio` e um proxy reverso de `/api` para o backend na mesma origem.
O proxy de desenvolvimento do Vite não substitui essa configuração de produção.
Verificação de e-mail, autenticação em dois fatores
e proteção avançada contra abuso do cadastro público permanecem pendentes.

## Equipe e primeiro acesso — RF-009, RF-010 e RF-011

O proprietário entra em `/equipe` para cadastrar diretamente os integrantes,
com e-mail como login, papel, permissões e senha temporária. Administrador gerencia
somente advogado, estagiário e secretário. Somente o onboarding cria proprietário.
A tela possui pesquisa, paginação, edição, ativação/inativação e histórico.

A senha temporária não é enviada por e-mail: o responsável fornece por canal
separado. O formulário apaga as senhas imediatamente após enviar. No primeiro
login, `/primeiro-acesso` exige a senha temporária e uma nova senha confirmada.
A troca encerra todas as sessões, inclusive em outras abas, e exige novo login.
Recuperação por e-mail também remove a obrigação de primeiro acesso.

Conta já existente exige confirmação explícita para criar apenas o vínculo;
a senha e as sessões de outros escritórios permanecem intactas. Não há convites
ou transferência de propriedade. E-mail e senha não são editáveis pela equipe.

A migration `20261001100000_administrative_team_provisioning` deve ser aplicada
com `pnpm exec prisma migrate deploy` dentro de `backend/`. Ela preserva as sete
anteriores e atribui as permissões aos proprietários existentes. Depois de
`pnpm build` no workspace, execute `pnpm --filter ./backend verify:team` para a
verificação optativa com PostgreSQL e Chrome reais; o script cria registros
exclusivos e limpa seus dados/processos em `finally`.

Sessão temporária
não pode renovar: com todas as abas fechadas ou token expirado, entre novamente.
A revogação vale imediatamente na API; uma aba coordenadora verifica identidade
a cada 30 segundos e ao recuperar foco, conforme a entrega abaixo.
Detalhes de autorização e contratos estão em [architecture.md](docs/architecture.md).

## Sessões e múltiplos escritórios — RF-012, RF-013 e RF-014

`/seguranca/sessoes` mostra as próprias sessões, inclusive de outros escritórios,
com navegador/dispositivo identificáveis, IP mascarado, datas e estado. Permite
encerrar uma, a atual ou todas as outras, com confirmação. A listagem apresenta
as últimas 100 e sempre inclui a atual; sessões expiradas não aparecem ativas.

Login com vários vínculos ativos retorna uma autorização opaca de seleção,
válida por até cinco minutos, sem sessão completa nem refresh cookie. A tela
`/selecionar-escritorio` conclui o login ou troca o contexto de uma sessão regular.
Trocar revoga a sessão anterior atomicamente, emite novos tokens e limpa os dados
antigos em todas as abas. Primeiro acesso continua restrito.

Uma aba visível mantém o Web Lock de polling; resultados passam pelo canal
dedicado à verificação de sessão. `VITE_SESSION_CHECK_INTERVAL_MS` no ambiente do frontend
define o intervalo (padrão 30000; faixa 10000–300000 ms), com exemplo em
`frontend/.env.example`. Sem BroadcastChannel, Web Locks ainda mantém uma única
aba fazendo polling. Sem Web Locks, o canal coalesce solicitações de foco; sem
ambos, a revalidação fica limitada ao foco de cada aba, sem polling recorrente.
Abas suspensas revalidam ao retomar. A API sempre consulta o estado atual no PostgreSQL.

Aplicar `20261001140000_session_management_office_selection` com `prisma migrate
deploy` em `backend/`; as oito migrations anteriores são preservadas. Sessões
legadas mantêm sua FK composta segura e recebem metadados desconhecidos e última
atividade a partir de seu uso/criação. Nenhum escritório é atribuído arbitrariamente.

Após o build, executar `pnpm --filter ./backend verify:sessions`: Chrome,
frontend, backend e PostgreSQL reais, três abas, isolamento por IDs conhecidos,
resposta atrasada, seleção concorrente, revogação e limpeza dos próprios dados.
O isolamento comprovado cobre os módulos existentes; novos módulos jurídicos
devem cumprir as mesmas fronteiras e testes antes de serem liberados.

## Tarefas, prazos judiciais e documentos — RF-018, RF-019 e RF-020

Páginas: `/painel` (prazos críticos, minhas tarefas e lembretes), `/tarefas`, `/prazos` e `/documentos`.
Regras em [business-rules.md](docs/business-rules.md) (RN-061 a RN-073); detalhamento RF-049 a RF-077 em
[requirements.md](docs/requirements.md).

Aplique a migration `20261011120000_tasks_deadlines_documents` com `prisma migrate deploy`. Ela cria tabelas,
restrições de vínculo único e triggers que tornam históricos, eventos e versões de documentos somente inclusão.

Lembretes usam o mesmo provedor de e-mail da recuperação de senha (`PROVEDOR_EMAIL`) e rodam em todas as
instâncias sem duplicar avisos. Configure `FUSO_HORARIO`, `PRAZO_CRITICO_DIAS` e `LEMBRETES_INTERVALO_MS`.

Documentos exigem armazenamento S3 compatível; sem `S3_BUCKET`, os envios respondem 503. MinIO local:

```bash
docker run -d --name webdireito-minio -p 9000:9000 -p 9001:9001 -e MINIO_ROOT_USER=minio_local -e MINIO_ROOT_PASSWORD=defina_um_segredo_local minio/minio server /data --console-address :9001
```

Crie o bucket no console (`http://127.0.0.1:9001`) e configure `S3_ENDPOINT=http://127.0.0.1:9000`,
`S3_BUCKET`, `S3_ID_ACESSO` e `S3_SEGREDO_ACESSO` no `.env` do backend, nunca no frontend.

Vínculos com cliente, caso ou processo já existem na API, no banco e na interface, mas só são aceitos quando
esses módulos registrarem seus resolvedores em `backend/src/infrastructure/prisma/prisma-business-links.ts`
(consulta por ID e escritório) e adicionarem as chaves estrangeiras de `client_id`, `case_id` e `process_id`.

Verificação real em banco **descartável** (os históricos não podem ser apagados):

```bash
VERIFICACAO_BANCO_DESCARTAVEL=true pnpm --filter ./backend run verify:tasks-documents
```

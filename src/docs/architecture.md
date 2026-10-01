# Arquitetura do backend

O repositório Git está em `Neodireito/`; o workspace pnpm permanece em
`Neodireito/src/`, com as aplicações `backend/` e `frontend/`.

## Aplicação e infraestrutura

- `backend/src/database-health-checker.ts` define somente
  `VerificadorSaudeBanco.verificar(): Promise<void>`.
- `backend/src/app.ts` constrói o Fastify e recebe esse contrato e o caso de uso
  de cadastro e os serviços de autenticação. Não importa Prisma ou a infraestrutura. `/health` informa liveness sem chamar o verificador;
  `/ready` chama apenas `verificar()` e converte sucesso/falha em HTTP 200/503.
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
| Domínio | `domain/offices/office.ts`, `domain/offices/invalid-office-error.ts` | Entidade `Escritorio`, validação das invariantes e erro previsível de domínio; sem dependências de Prisma, Fastify, Zod ou das outras camadas. |
| Aplicação | `application/offices/create-office.ts`, `application/offices/offices-repository.ts` | Caso de uso `CadastroDeEscritorio` e contrato específico `RepositorioEscritorios`, com `salvarEscritorio` e `buscarEscritorioPorId`; depende do domínio e não conhece Prisma. |
| Infraestrutura | `infrastructure/prisma/prisma-offices-repository.ts`, `infrastructure/prisma/office-mapper.ts` | Persistência com Prisma e conversão entre o registro armazenado e a entidade; depende dos contratos da aplicação e do domínio. |

`CadastroDeEscritorio` recebe somente `nome`, cria uma entidade válida, persiste pelo
contrato e retorna o escritório. O repositório Prisma recebe o cliente como
dependência. O mapper reconstitui a entidade preservando UUID, estado e datas.
O repositório em memória fica em `backend/tests/support/` e atende ao mesmo
contrato nos testes de aplicação, sem exigir PostgreSQL.

`Escritorio` é a raiz do tenant: os futuros clientes, processos, tarefas e documentos
terão vínculo com um escritório. `CadastroDeEscritorio` permanece um caso de uso interno,
sem endpoint próprio. O cadastro público descrito abaixo cria o escritório junto
ao usuário administrador em outra operação, com uma única transação. Autorização
e isolamento das consultas dos demais módulos ainda não estão implementados.

### Persistência

O schema está em `backend/prisma/schema.prisma`; migrations versionadas ficam
em `backend/prisma/migrations/`. A primeira migration,
`20260922163757_create_offices`, cria a tabela de escritórios e o enum de estado.
O domínio usa nomes em português; o mapper converte para os nomes gerados pelo
Prisma, preservados em inglês. Os nomes SQL adotam snake_case: `Office` mapeia para `offices`, `OfficeStatus` para
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

O fluxo disponível em `/register` envia `nomeEscritorio`, `nomeAdministrador`, `email` e
`senha` para `POST /api/v1/onboarding`. A confirmação de senha existe somente
no formulário. Nenhum ID, papel, estado ou data é aceito do cliente.

| Camada | Componentes | Responsabilidade |
| --- | --- | --- |
| Domínio | `Usuario`, `VinculoEscritorio` e seus erros específicos | Validar nome, e-mail, UUIDs, datas, estado `ATIVO` do usuário e papel `PROPRIETARIO` do vínculo; armazenar somente `hashSenha`, sem dependência de frameworks. |
| Aplicação | `CadastroDeEscritorioComProprietario`, `RepositorioCadastroEscritorio`, `ProtecaoDeSenhas` | Normalizar e validar entrada, verificar e-mail existente, proteger a senha, criar as três entidades, solicitar persistência atômica e retornar dados públicos. |
| Infraestrutura | `RepositorioCadastroEscritorioPrisma`, `GeradorHashSenhaArgon2` | Executar a transação de cadastro, traduzir conflito de e-mail e implementar Argon2id. |
| Apresentação | `presentation/onboarding-route.ts` | Validar o corpo com Zod estrito, rejeitar campos extras e serializar somente dados públicos e erros sanitizados. |
| Frontend | Página `/register` | Validar campos e confirmação, impedir envio duplicado, apresentar erro por campo, conflito e confirmação de cadastro; não persistir senha no navegador. |

Os nomes são normalizados com trim e têm entre 2 e 120 pontos de código Unicode.
O e-mail recebe trim e lowercase, tem formato validado e é único globalmente.
A senha tem entre 12 e 128 caracteres e não sofre trim. O primeiro vínculo é
sempre `PROPRIETARIO`, autoridade administrativa máxima. Os papéis inferiores
e a política específica de equipe são implementados em RF-009/RF-010/RF-011.

O hash é calculado antes da transação, evitando manter conexão do banco durante
o trabalho do Argon2. A transação grava `Office`, `User` e `Membership`, nessa
ordem, com `maxWait=5000` e `timeout=10000` milissegundos; qualquer falha desfaz
as três gravações. A consulta prévia de e-mail melhora a resposta ao usuário,
mas a restrição única do PostgreSQL garante a unicidade em concorrência. O
repositório converte esse conflito em `ErroEmailJaCadastrado`.

A migration `20260923160423_create_users_and_memberships`, revisada e aplicada,
acrescenta `users`, `memberships`, `user_status` e `membership_role`. Há unicidade
de `users.email` e de `(office_id, user_id)`, além de chaves estrangeiras para
escritório e usuário com `RESTRICT` na exclusão e na atualização. O estado do
usuário admite `ACTIVE` e `INACTIVE` desde RF-003. RF-010 acrescenta quatro
papéis inferiores ao `OWNER`, sem alterar os valores físicos existentes. As migrations anteriores
e os dados existentes são preservados.

O endpoint retorna HTTP 201 com os cinco campos públicos de escritório, somente
`id`, `nome` e `email` do usuário e `papel: PROPRIETARIO`. HTTP 400 indica entrada
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
e-mail, autenticação em dois fatores e proteção avançada contra abuso do
endpoint público. RF-009/RF-010/RF-011 implementam permissões e histórico da
equipe; auditoria e isolamento dos demais módulos continuam pendentes.

## Autenticação e sessão — RF-003 a RF-006

### Recuperação e alteração de senha — RF-007/RF-008

`RecuperacaoDeSenha` define validade e estado sem Prisma. A aplicação contém
`RepositorioSenhas`, `RepositorioTrabalhosRecuperacao`, `EnvioEmail` e
`TokensRecuperacao`, além dos casos `SolicitacaoRecuperacaoDeSenha`,
`EnvioRecuperacaoDeSenha`, `RedefinicaoDeSenha` e
`AlteracaoDeSenhaAutenticada`. `infrastructure/password-services.ts` compõe
Prisma, geração criptográfica, processamento e adaptadores SMTP/Resend.

A migration `20260930120000_create_password_recoveries` adiciona
`password_recoveries`, com hash único, índices por usuário/expiração e índice
único parcial para uma recuperação pendente por usuário. Migrations anteriores
e nomes físicos existentes permanecem preservados.

As operações bloqueiam a linha do usuário (`FOR UPDATE`) em transação curta,
com statement timeout de 5 segundos, espera de pool de 5 segundos e transação
de até 10 segundos. A comparação Argon2id e a geração de hash acontecem antes
da transação; o hash anterior é reconfirmado sob bloqueio. Emissão invalida
tokens anteriores; consumo condicional, troca de hash, invalidação e revogação
de sessões são atômicos. Login reconfirma o hash sob o mesmo bloqueio. Nenhum
e-mail é enviado dentro da transação. Refresh mantém sua detecção de reutilização.

O HTTP 202 aguarda o commit do trabalho elegível no PostgreSQL, sem aguardar
o provedor. Usuário ausente/inativo mantém a mesma confirmação e não gera
trabalho. Erro de persistência retorna 503 sanitizado. Corpo, status e rate
limits continuam genéricos; a consulta e as escritas no banco não têm tempos
idênticos, portanto não se promete tempo constante.

A migration adicional `20260930160000_create_recovery_email_jobs` cria
`recovery_email_jobs` e `recovery_email_status`. Estados semânticos PENDENTE,
EM_PROCESSAMENTO, ENVIADO e FALHA_DEFINITIVA correspondem a PENDING, PROCESSING,
SENT e FAILED. O registro contém usuário/recuperação, tentativas, próxima
execução, identificador/início/fim da reserva, envio, criação/atualização e
código de erro permitido. Não contém token puro, link ou payload de e-mail.
Índices atendem trabalhos disponíveis, leases vencidos e retenção.

A reserva usa CTE com `FOR UPDATE SKIP LOCKED` e UPDATE atômico; o relógio do
PostgreSQL define o lease. Cada instância processa um trabalho por vez. Após
60 segundos (padrão), uma reserva abandonada pode ser retomada com novo UUID.
Preparação e falha bloqueiam usuário e trabalho, nessa ordem; resultados são
condicionados à reserva ainda válida. Nenhum envio externo mantém transação
aberta. O envio recebe cancelamento antes do vencimento, com margem de cinco
segundos; SMTP destrói o socket e Resend cancela o HTTP. O processador para de
reservar ao encerrar e aguarda até 30 segundos antes de cancelar; reservas
interrompidas continuam recuperáveis. Chamadas de parada compartilham Promise.

Cada tentativa gera 32 bytes aleatórios, persiste somente SHA-256 e validade
de 30 minutos e monta conteúdo em memória. Retentativa substitui o hash; falha
invalida a recuperação. Recuperações consumidas não são reativadas e troca de
senha cancela trabalhos pendentes/em processamento na mesma transação.
Se o provedor aceitar e o processo cair antes da confirmação no banco, pode
haver outro e-mail: só o token mais recente permanece válido. Não há promessa
de entrega exatamente uma vez nem reutilização de chave de idempotência para
conteúdos diferentes.

O padrão permite cinco tentativas, backoff de 30 segundos multiplicado por
dois a cada falha, limitado a 3.600 segundos. Reservas abandonadas também contam
para limitar reinícios sucessivos. SMTP 4xx/rede e HTTP 5xx/408/409/429 são
transitórios; SMTP 5xx e demais HTTP 4xx são definitivos. Esgotamento termina o
trabalho e invalida o token. Política e polling estão em `EMAIL_FILA_*`, com
validação de limites e valores ilustrativos no `backend/.env.example`.

A limpeza remove até 500 trabalhos ENVIADO/FALHA_DEFINITIVA com mais de sete
dias; preserva pendentes e reservas ativas. Recuperações expiradas vinculadas
a trabalho ativo são preservadas até sua resolução. Ambas as rotinas usam
`FOR UPDATE SKIP LOCKED` e `RATE_LIMIT_CLEANUP_INTERVAL_MS`. Logs estruturados
contêm somente componente/evento (início, envio, retentativa, falha, limpeza e
encerramento), sem destinatário, segredo ou conteúdo.

`/health` permanece independente e `/ready` exige PostgreSQL. Indisponibilidade
temporária de SMTP/Resend mantém trabalhos para nova tentativa e não derruba a
API; logs do processador indicam as falhas. Configuração inválida de e-mail
impede a inicialização. Nodemailer mantém limites DNS/conexão/greeting de
cinco segundos e limite total de envio de dez segundos; socket cancelável
impede que apenas a espera HTTP termine. Resend usa SDK oficial com transporte
especializado, cancelamento em dez segundos e erros sanitizados, sem logs
brutos do SDK. Entrega externa não foi confirmada.

Referências oficiais: [reserva PostgreSQL](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE),
[transporte SMTP](https://nodemailer.com/smtp) e
[erros Resend](https://resend.com/docs/api-reference/errors).

O frontend retira o fragmento antes da montagem, mantém o token em memória e
não persiste segredos. Trocas de senha usam o mesmo Web Lock da renovação,
impedindo refresh simultâneo de reinstalar o cookie após a limpeza. Sucesso
propaga logout e retorna ao login com mensagem; outras sessões são negadas
pelo banco no próximo acesso protegido.

`application/authentication/` contém `AutenticacaoDeUsuario`, `ConsultaDeIdentidadeAutenticada`, `RenovacaoDeSessao` e `EncerramentoDeSessao`
e contratos específicos para consultas de autenticação, sessões e tokens. Não
importa Prisma, JWT, Fastify ou cookies. A entidade `Sessao` valida UUIDs,
datas e o digest do refresh, mantendo estado privado. `Usuario` admite INATIVO para
negar acesso; não há operação administrativa de inativação nesta entrega.

O login normaliza o e-mail e verifica Argon2id antes de avaliar estado e vínculos.
Quando o e-mail não existe, verifica um hash de referência gerado uma vez no
bootstrap, com os mesmos parâmetros do cadastro. Erros internos distinguem
credenciais inválidas, usuário inativo e ausência de escritório ativo; todos
resultam no mesmo HTTP 401 externo. Mais de um escritório ativo retorna 409,
pois seleção de escritório ainda não existe.

`RepositorioAutenticacaoPrisma` consulta o usuário e seus vínculos, persiste
Sessao e recupera sessão por ID para `/me`. A migration
`20260923171012_create_sessions` acrescenta `sessions`, INACTIVE ao enum de usuário
e índice de `memberships.user_id`, usado na busca dos vínculos no login.
A tabela de sessões referencia usuário, escritório e o par do vínculo com RESTRICT.
A chave primária atende a busca por sessão. A migration
`20260924074000_index_session_expiration` acrescenta índice em `expires_at` para
localizar lotes expirados no futuro cleanup; nenhum job foi criado nesta etapa.
As datas e o formato SHA-256 possuem
restrições no domínio e no banco; `revokedAt` e `lastUsedAt` começam nulos.
A renovação atualiza `lastUsedAt` e `updatedAt`; a revogação define `revokedAt`.

`TokensAcessoJose` usa a biblioteca `jose` e HS256 fixo. O token contém `sub`,
`sessionId`, `activeOfficeId`, `role`, `iat`, `exp`, `iss` e `aud`, sem dados
pessoais. A verificação exige assinatura, algoritmo, tipo JWT, emissor, audiência,
claims obrigatórias e prazo máximo de 900 segundos; rejeita emissão futura.
O segredo base64url de pelo menos 32 bytes é obrigatório em todos os ambientes,
sem valor padrão. `authentication.ts` compõe adaptadores e casos de uso no bootstrap.

`TokensRenovacaoCriptograficos` usa o formato `UUID-da-sessão.segredo-base64url`, com 32 bytes
aleatórios criptográficos e SHA-256 do token completo. O parser exige UUID e
base64url canônico, com 80 caracteres ao todo; `timingSafeEqual` compara hashes.
O token não contém identidade, escritório ou papel. Esse hash rápido é adequado ao segredo aleatório de 256 bits;
as senhas humanas continuam usando Argon2id. Sessao dura, por padrão, 604800
segundos. O token original só sai por cookie `refresh_token`, HttpOnly,
SameSite=Lax, Path=/api/v1/auth, sem Domain, com Max-Age/Expires e Secure em
produção. O desenvolvimento HTTP local usa Secure=false. Produção exige HTTPS.

`POST /api/v1/auth/login` aceita apenas e-mail e senha, retorna `tokenAcesso`,
`expiraEmSegundos` e identidade pública; não retorna refresh nem hashes no JSON.
`GET /api/v1/auth/me` exige Bearer, valida o JWT e reconfirma sessão não revogada
ou expirada, usuário/escritório ACTIVE e vínculo/papel atuais no banco.
Respostas de autenticação usam Cache-Control: no-store. Cookies não autenticam
`/me`. `POST /api/v1/auth/refresh` recebe somente cookie e retorna o mesmo DTO
público do login com um novo access token; nunca retorna refresh no JSON.

`RenovacaoDeSessao` reconfirma validade, estado e vínculo. O repositório faz
`updateMany` condicionado por ID, hash atual, `revokedAt=null`, expiração futura,
usuário/escritório ACTIVE, vínculo ativo e ausência de primeiro acesso pendente.
Sessões restritas não renovam. O hash funciona como versão de
concorrência: somente uma atualização pode consumir o token atual. Uma divergência
de hash ou disputa perdida revoga toda a sessão e retorna 401 genérico. Em duas
renovações concorrentes, uma pode responder 200, mas a detecção da outra revoga
a sessão, incluindo o refresh substituto. A expiração original nunca é alterada;
Expires e Max-Age do cookie refletem o prazo restante.

`EncerramentoDeSessao` identifica e revoga a sessão quando possível. O endpoint limpa
o cookie com os mesmos atributos e responde 204 também para token ausente,
inválido, expirado ou sessão já revogada. Falhas de infraestrutura retornam erro
genérico; não se afirma revogação quando o banco falha. JWT não tem blacklist e
pode conservar validade criptográfica por até 15 minutos após logout/reutilização.
O `/me` mantém a verificação no banco e rejeita sessão revogada imediatamente.
Refresh legado sem UUID deixa de renovar; exige novo login, sem apagar histórico.

POSTs de login, refresh e logout exigem Origin exatamente igual a
`AUTH_FRONTEND_ORIGIN`, sem confiar em Host ou cabeçalhos de proxy; ausência,
`null` e outras origens recebem 403 sem mutação. O padrão local é
`http://localhost:5173`; produção exige origem HTTPS. Frontend e API usam mesma
origem via Vite/proxy reverso, portanto CORS fica desabilitado. SameSite=Lax é
defesa adicional, não substitui essa validação CSRF. Cabeçalho Cookie acima de
4096 caracteres é recusado, além do limite estrito do token. Não há tokens em URLs
nem logs de Authorization, Cookie ou Set-Cookie; logger HTTP segue desativado.

Referências: [Prisma 6 — concorrência otimista](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions#optimistic-concurrency-control)
e [OWASP — verificação de origem e CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#using-standard-headers-to-verify-origin).

`application/security/rate-limiter.ts` define contratos sem Prisma e o
`LimitadorRequisicoesCompartilhado`. A composição `rate-limiting.ts` injeta o adaptador
`ArmazenamentoLimiteRequisicoesPrisma`, HMAC das chaves e políticas do ambiente. Hooks protegem
cadastro, login por IP, login por IP/e-mail normalizado e refresh antes do trabalho
caro de senha. O plugin com armazenamento local foi removido.

A migration `20260924100000_create_distributed_rate_limits` cria somente
`rate_limit_buckets`: escopo, digest HMAC de 64 caracteres, início da janela,
contador e expiração. A chave primária composta serializa incrementos por bucket;
o índice de expiração atende à limpeza. `INSERT ... ON CONFLICT DO UPDATE` é
atômico e usa o relógio do PostgreSQL, sem ler e incrementar no processo. O
contador satura em limite + 1. Janelas são fixas: pode haver consumo de dois
orçamentos próximos à fronteira entre janelas, sem prometer uma janela móvel.

Padrões: cadastro 10/900 s; login por IP 30/900 s (10 em produção) e por
IP/e-mail 5/900 s; refresh 30/60 s. Limites, janelas e intervalo de limpeza são
validados no ambiente e descritos no README/.env.example. Todas as réplicas
devem usar as mesmas políticas e chave. O HMAC usa segredo próprio opcional ou
derivação contextual do segredo JWT; normaliza e-mail e representações IP,
inclusive IPv4 mapeado em IPv6. Não persiste dados pessoais legíveis.

429 inclui segundos restantes em `Retry-After`; armazenamento indisponível ou
composição ausente resulta em 503 com `Retry-After: 5`. `/health` e `/ready`
continuam independentes do limitador. `request.ip` é a fonte do endereço;
`TRUST_PROXY` padrão é falso e aceita apenas IPs/CIDRs explícitos dos proxies
controlados. O deploy deve impedir acesso direto e substituir cabeçalhos externos.

O worker de limpeza remove no máximo 500 expirados a cada 60000 ms, com
`FOR UPDATE SKIP LOCKED` e DELETE na mesma instrução. Réplicas podem limpar
concorrentemente sem selecionar linhas já bloqueadas. Não há execuções
sobrepostas dentro do mesmo worker. Timer com `unref()`, parada e espera da
execução pendente antes de fechar app/Prisma; falhas são sanitizadas. Essa limpeza
é de buckets, não das sessões de autenticação. Redis não foi adicionado; o contrato
permite avaliar outro armazenamento no futuro, sem decisão de migração assumida.

Referências oficiais: [PostgreSQL — ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html),
[PostgreSQL — SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html)
e [Fastify — trustProxy](https://fastify.dev/docs/latest/Reference/Server/#trustproxy).

`ClienteAutenticacao` centraliza token em memória, identidade e estados `carregando`,
`autenticado` e `naoAutenticado`. `ProvedorAutenticacao` inicia uma única restauração,
inclusive sob StrictMode. `/app` só mostra conteúdo após identidade validada;
`/login` consulta `/me` ao entrar e redireciona à área autenticada. Recarregar
renova pelo cookie, sem token em localStorage, sessionStorage ou IndexedDB.
O cliente HTTP inclui Bearer somente na API local e, diante de 401, compartilha
uma Promise de refresh e repete a requisição uma vez. Um 401 tardio do token
anterior usa o token já renovado; login/onboarding/refresh/logout não renovam.
Falha limpa identidade e redireciona ao login, sem loop. Logout limpa a memória
imediatamente e aguarda eventual rotação em andamento antes de revogar seu cookie;
respostas tardias não restauram identidade. O guard também protege Voltar e a
restauração via cache de navegação limpa memória/DOM antes do snapshot e força
revalidação ao retornar. Falha de logout no servidor
é informada sem afirmar revogação.

`ClienteAutenticacao` depende de `CoordenadorSessao`; não acessa BroadcastChannel ou
Web Locks diretamente. `infrastructure/browser-session-coordinator.ts` implementa
o protocolo, e `authentication.ts` compõe cliente, transporte e navegação. Um
lock exclusivo por origem serializa mutações de autenticação. Antes de renovar,
a aba consulta pares por até 250 ms e usa a versão recebida, inclusive quando
dois JWTs emitidos no mesmo segundo têm texto idêntico. Requisições têm prazo de
10 s; aquisição/operação coordenada, 20 s. Fechamento cancela a operação e
comunicação pendentes; o navegador libera os locks da página terminada.

Envelope v1 contém UUID da aba e mensagem, tipo, timestamp, correlação e ID público
de sessão. Respostas só valem para consultas pendentes. Mensagens repetidas,
malformadas, antigas ou de outra sessão são ignoradas; mudança de sessão exige
evento explícito de login. O payload projeta somente identidade pública e access
token. Metadados JWT auxiliam coordenação, sem substituir sua verificação na API.
Refresh token, senha, hash e cookie nunca passam pelo canal. Nada é persistido.
Invalidação é terminal para a sessão: prevalece sobre uma renovação em trânsito,
mesmo se as mensagens chegarem fora de ordem. Respostas HTTP iniciadas sob uma
identidade anterior são descartadas quando o usuário muda.

Expiração agenda renovação coordenada; login/renovação atualizam pares e
logout/falha definitiva limpam identidade. Gerações impedem respostas antigas de
restaurar usuário após logout ou troca de identidade. Logout limpa abas antes de
aguardar o lock e revoga o cookie mais recente. A proteção estrita de reutilização
é mantida, sem tolerância: fechar a aba ou perder a resposta depois da rotação
pode exigir novo login, mas não armazena refresh em texto nem aceita replay.

Fluxo completo: Chrome, Edge, Firefox e Safari atuais, com BroadcastChannel,
Web Locks e AbortSignal.any/timeout, em contexto seguro (HTTPS ou localhost).
Chrome foi verificado de fato. Sem canal, locks ainda serializam renovações,
mas não há propagação imediata; cada aba revalida na próxima consulta/expiração.
Sem locks, não há refresh automático; login manual e propagação pelo canal
disponível permanecem. Timeout/falha encerra a tentativa, sem loops ou locks em
localStorage. Abas suspensas só processam eventos quando o navegador as retoma.

Referências: [Web Locks](https://w3c.github.io/web-locks/),
[BroadcastChannel](https://html.spec.whatwg.org/multipage/web-messaging.html#broadcasting-to-other-browsing-contexts),
[compatibilidade Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
e [AbortSignal.any](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static).

`frontend/public/favicon.svg` contém as iniciais WD, sem dependência externa;
`index.html` referencia o SVG, copiado também para o build.

Referências: [jose](https://github.com/panva/jose),
[@fastify/cookie](https://github.com/fastify/fastify-cookie),
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
Os testes de domínio e de `CadastroDeEscritorio` não exigem banco nem leem o `.env` real.
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
entra por `/login`, inspeciona cookie/requisições e confirma Sessao no PostgreSQL.
Também testa restauração após reload, expiração controlada de JWT, renovação e
repetição, reutilização e logout. Nenhum segredo é impresso;
o cleanup remove sessões, vínculos, usuários e escritórios próprios nessa ordem e fecha
somente os recursos criados. A suíte unitária não depende desse comando ou do banco.
Inclui duas abas reais no mesmo perfil: identidade compartilhada, dois 401 com
uma chamada de refresh, rotação/estado no PostgreSQL, login/logout/revogação
propagados, armazenamento web vazio e favicon 200. `verify:rate-limit` inicia
dois backends reais e testa orçamento conjunto, concorrência por dois clientes,
nova janela e ausência de dados legíveis. O SQL de limpeza é exercitado em tabela
temporária da conexão para não remover buckets existentes. Verificadores usam
segredo HMAC efêmero próprio e removem somente suas chaves ao terminar.

## Nomenclatura e compatibilidade

O domínio, a aplicação e os contratos públicos usam português brasileiro.
A infraestrutura converte `ATIVO`/`INATIVO` e `PROPRIETARIO` para
`ACTIVE`/`INACTIVE` e `OWNER`, sem alterar schema, migrations ou registros.
`authentication-mapper.ts` concentra as conversões de usuário e sessão;
`office-mapper.ts` converte escritórios. Nomes físicos citados acima são
intencionais e não representam os identificadores do domínio.

A mudança de JSON exige publicar frontend e backend juntos e recarregar abas
antigas. O formato assinado dos JWTs, o cookie e as chaves dos contadores
permanecem compatíveis. Consulte [nomenclatura](nomenclature.md) para contratos
e exceções da tradução.

## Provisionamento administrativo de equipe — RF-009/RF-010/RF-011

`GestaoEquipe` usa o contrato específico `RepositorioEquipe` e
`PoliticaEquipe`, sem conhecer Fastify ou Prisma. As rotas validam o contrato;
a política central verifica hierarquia e permissões. A infraestrutura traduz
os cinco papéis e implementa transações, autorização atual e histórico.

| Papel | Padrão | Personalização e autoridade |
| --- | --- | --- |
| PROPRIETARIO | Todas as cinco permissões | Imutável; gerencia os quatro inferiores; criado somente no onboarding. |
| ADMINISTRADOR | Todas as cinco permissões | Proprietário pode reduzir; gerencia somente os três inferiores, dentro das permissões que possui. |
| ADVOGADO / ESTAGIARIO / SECRETARIO | Nenhuma | Podem receber EQUIPE_VISUALIZAR; nunca as quatro permissões de gestão. |

As permissões reais são `EQUIPE_VISUALIZAR`, `EQUIPE_CADASTRAR_USUARIO`,
`EQUIPE_ALTERAR_USUARIO`, `EQUIPE_DEFINIR_PERMISSOES` e
`EQUIPE_ATIVAR_INATIVAR_USUARIO`. Criar usuário exige cadastro e definição de
permissões. Não há autogestão, edição de proprietário nem edição de administrador
por outro administrador. Não se modelam permissões de módulos inexistentes.

### Persistência e concorrência

Migration `20261001100000_administrative_team_provisioning`: acrescenta
ADMIN/LAWYER/INTERN/SECRETARY ao enum físico, `users.must_change_password`,
`sessions.restricted`, estado/permissões/versão/data de alteração do vínculo e
`membership_history`. Proprietários anteriores recebem as cinco permissões.
As sete migrations anteriores e nomes físicos existentes são preservados.

A transação bloqueia a linha do escritório antes de revalidar sessão/vínculo
no banco, serializando decisões administrativas naquele contexto. Criação usa
advisory lock transacional derivado do e-mail normalizado, inclusive entre
escritórios; constraints únicas continuam como garantia final. Argon2 é executado
fora da transação, após autorização preliminar, e a autorização é revalidada
antes de gravar. Conta existente não recebe novo hash nem alteração global.

Edição aplica compare-and-swap pela versão, bloqueia usuário com o mesmo protocolo
de login/troca de senha e revoga sessões somente do escritório afetado. Histórico
e alterações pertencem à mesma transação: falha no histórico desfaz tudo.
Limites: statement_timeout local de cinco segundos, maxWait cinco e transação dez.
Histórico registra autor, data, ação e antes/depois de papel/permissões/estado/versão,
sem senha/hash. Consulta devolve os últimos 100 eventos; não há módulo genérico.

### API e frontend

Todas as rotas de equipe exigem Bearer e revalidam autorização no PostgreSQL.
Identificador `:id` representa o vínculo, sempre filtrado pelo escritório da
sessão. Recurso externo retorna 404. Corpos estritos recusam mass assignment;
mutação exige Origin autorizado, erros sanitizados e Cache-Control no-store.

| Método | Caminho | Resultado |
| --- | --- | --- |
| GET | /api/v1/equipe/usuarios/configuracao | 200; permissões atuais, papéis possíveis e seus padrões. |
| GET | /api/v1/equipe/usuarios | 200; usuarios/total/pagina/tamanhoPagina; pesquisa por nome/e-mail, máximo 50. |
| GET | /api/v1/equipe/usuarios/:id | 200; membro público. |
| GET | /api/v1/equipe/usuarios/:id/historico | 200; eventos autorizados. |
| POST | /api/v1/equipe/usuarios | 201; nome/email/papel/permissoes/senhaTemporaria/confirmacaoSenhaTemporaria. |
| POST | /api/v1/equipe/usuarios/confirmar-vinculo | 201; email/papel/permissoes/confirmacaoVinculo=true, sem senha. |
| PATCH | /api/v1/equipe/usuarios/:id | 200; papel/permissoes/versao. |
| POST | /api/v1/equipe/usuarios/:id/ativar ou /inativar | 200; versao. |
| POST | /api/v1/auth/primeiro-acesso | 200; senhaTemporaria/novaSenha/confirmacaoNovaSenha; limpa cookie. |

Membro público: id, idUsuario, nome, email, papel, permissoes, estaAtivo,
deveAlterarSenha, criadoEm e versao. Erros: 400 entrada inválida, 401 sessão,
403 autoridade insuficiente/restrita, 404 vínculo externo/inexistente, 409
conta/vínculo/versão/estado conflitante, 429 com Retry-After e 503 indisponibilidade.
Cadastro usa escopo próprio no limitador compartilhado, com configuração do
onboarding (padrão 10/IP/15 minutos); primeiro acesso usa o limite de troca de
senha (5/IP e 5/usuário/15 minutos). Não há novas variáveis de ambiente.

`/equipe` usa permissões atuais para ações, padrões por papel, confirmações e
controle de envio. Senhas são removidas dos campos ao enviar, não persistidas.
`/primeiro-acesso` bloqueia outras telas enquanto houver obrigação. Login e
identidade acrescentam `deveAlterarSenha: true` apenas quando necessário;
sessões regulares preservam o formato anterior. Só identidade, logout e troca
obrigatória são permitidos na sessão restrita, inclusive bloqueando refresh.
Outra aba ativa pode compartilhar credenciais; sem ela, recarga exige novo login.

Troca obrigatória e recuperação removem a flag e revogam todas as sessões na
mesma transação. A resposta limpa cookie; o cliente limpa memória e propaga logout
pelo coordenador existente. Abas visíveis consultam /me a cada dois segundos e ao
recuperar foco. Revogação é imediata na API; a atualização visual depende dessa
consulta/retomada. Permissões não dependem de esperar o JWT expirar.

Limitações deliberadas: não há escolha/troca de escritório (RF-013); login com
múltiplos vínculos ativos retorna 409, preservando sessões anteriores. RF-012
não foi implementado e RF-014 não é considerado concluído: isolamento foi
comprovado somente nas operações existentes, incluindo equipe.

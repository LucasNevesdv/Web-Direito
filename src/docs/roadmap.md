# Roadmap inicial do produto

Plano de evolução do SaaS jurídico descrito na [visão](vision.md). A ordem abaixo
é a sequência inicial do MVP, sem datas ou estimativas aprovadas. Requisitos
estão em [requirements.md](requirements.md) e políticas pendentes em
[business-rules.md](business-rules.md).

## Base concluída

| Etapa | Estado | Critérios cumpridos |
| --- | --- | --- |
| Fundação técnica | Concluída | Workspace pnpm em `src/`, backend e frontend organizados e comandos de lint, typecheck, testes e build disponíveis e validados. |
| TASK-002 — PostgreSQL e Prisma | Concluída | Cliente Prisma e ambiente configurados; aplicação desacoplada da infraestrutura; `/health` independente do banco e `/ready` com consulta real; limites efetivos de consulta, cleanup e testes validados, incluindo conexão local. |
| TASK-002.1 — Documentação inicial | Concluída | Visão, requisitos, regras e roadmap preenchidos; escopo do MVP separado do pós-MVP; hipóteses e pendências explícitas, sem decisões jurídicas ou comerciais inventadas. |

A base técnica concluída não significa que autenticação, isolamento dos dados de
negócio ou os módulos do produto já estejam implementados. A descrição técnica
atual permanece em [architecture.md](architecture.md); os próximos módulos devem
seguir Clean Architecture, com PostgreSQL e Prisma como infraestrutura.

## Progresso da TASK-003

**Domínio e persistência de escritórios: concluída no escopo da TASK-003.** Entidade `Escritorio` com
UUID, nome normalizado, estado e datas; caso de uso `CadastroDeEscritorio`; contrato
específico, repositórios em memória e Prisma e mapper organizados em camadas.
O schema e a primeira migration introduzem a tabela de escritórios.

Schema formatado e validado, Prisma Client gerado e migration
`20260922163757_create_offices` gerada pelo Prisma, revisada e aplicada.
Confirmadas a tabela `offices` e a conclusão da migration em `_prisma_migrations`.
Na validação da TASK-003, lint, typecheck, build e os 85 testes então existentes
passaram (84 no backend e 1 no frontend). A verificação real do repositório confirmou criação e recuperação
dos cinco campos, remoção do único registro temporário, ausência de resíduos e
desconexão do Prisma.

Essa entrega preparou o domínio e a persistência utilizados no cadastro público
descrito abaixo. Autenticação, autorização e manutenção do escritório continuam
fora do escopo concluído da TASK-003.

## Cadastro público — RF-001 e RF-002 concluídos

**RF-001: concluído no escopo de criar escritório e primeiro administrador no
mesmo cadastro. RF-002: concluído como condição técnica da atomicidade de RF-001,
com usuário e vínculo iniciais.**

A página `/register` envia o cadastro para `POST /api/v1/onboarding`; o backend
valida os dados, protege a senha com Argon2id e persiste escritório, usuário e
vínculo PROPRIETARIO na mesma transação. O e-mail normalizado possui restrição única
global, com conflito previsível em concorrência. A interface trata erros de
campo, conflito, carregamento e sucesso, sem persistir senha no navegador ou
iniciar sessão.

A migration `20260923160423_create_users_and_memberships` foi revisada e aplicada,
preservando a migration de escritórios. Os critérios de verificação desta entrega
incluem resposta pública sem dados secretos, rollback dos três registros após
falha no vínculo, conflito concorrente e remoção dos dados temporários. O comando
optativo `verify:onboarding` exercita esses critérios no PostgreSQL local;
testes unitários e de interface continuam independentes do banco.

Na verificação desta entrega, lint, typecheck, build e os 228 testes passaram
(208 no backend e 20 no frontend). O endpoint real
retornou 201, 400 e 409 conforme o cenário; `/health` e `/ready` retornaram 200.
A falha simulada no vínculo ocorreu após gravar escritório e usuário na transação,
e a consulta posterior confirmou rollback integral. Dois cadastros concorrentes
com o mesmo e-mail produziram um sucesso e um conflito, com apenas um conjunto
completo persistido. A limpeza confirmou ausência de registros temporários.
Também foram verificados `/register` e o envio pelo proxy Vite usando o backend
compilado.

Verificação de e-mail, autenticação em dois fatores e proteção avançada contra abuso do endpoint
público permanecem pendentes. Manutenção e inativação de escritórios também não
foram implementadas. A conclusão de RF-001 e RF-002 não conclui toda a área de
escritórios e usuários nem implementa auditoria ou autorização entre escritórios.

## Login — RF-003

RF-003 concluído: login por e-mail/senha, Sessao persistida, access token de
15 minutos, refresh protegido de 7 dias, `/me` autenticado e área provisória
no frontend. O gerenciamento dos tokens, a renovação e o logout foram concluídos
na entrega RF-004/RF-005/RF-006 abaixo. Autorização dos demais módulos permanece pendente.

A migration `20260923171012_create_sessions` foi revisada e aplicada sem remover
dados ou migrations anteriores. Usuário INATIVO é reconhecido para negar acesso.
Na versão inicial de RF-003, recarregar exigia novo login; esse limite foi
resolvido por RF-005. A numeração dos requisitos posteriores foi
ajustada em [requirements.md](requirements.md), preservando os módulos planejados.

Critérios desta entrega: login pelo navegador real após cadastro, cookie protegido,
consulta de identidade, senha incorreta com 401 genérico, sessão com hash no banco,
ausência de tokens no armazenamento web/logs e limpeza dos registros de teste.

Verificação histórica de RF-003: 309 testes aprovados (277 backend e 32 frontend), lint, typecheck
e build. No Chrome headless, cadastro retornou 201, login e `/me` retornaram 200,
e senha errada retornou 401 genérico. Cookie HttpOnly/SameSite=Lax confirmado;
nenhum token em localStorage/sessionStorage e somente hash do refresh na Sessao.
Recarregar exigiu novo login. Sessao, VinculoEscritorio, Usuario e Escritorio temporários
foram removidos e os recursos de teste encerrados. O 404 preexistente de
`/favicon.ico` foi registrado como pendência visual e resolvido na melhoria técnica abaixo.

## Gerenciamento de sessão — RF-004, RF-005 e RF-006

Concluídos: refresh identificável, rotação condicional no PostgreSQL, detecção de
reutilização e revogação da sessão inteira, renovação automática e logout 204
idempotente. JWT permanece com validade máxima de 15 minutos; sessão tem prazo
absoluto de sete dias. Não há blacklist; `/me` consulta revogação no banco.

Frontend restaura após reload, mantém token só em memória, compartilha uma
Promise de renovação e repete requisições com 401 uma única vez. Loading/guard
protegem a área `/app`; Sair limpa identidade e retorna ao login. POST com Origin
exato e SameSite=Lax protege os fluxos por cookie. O limitador inicialmente local
foi substituído na melhoria técnica abaixo.

A migration `20260924074000_index_session_expiration` acrescenta somente índice
para futura busca de sessões expiradas; job de limpeza não foi implementado.
Critérios de aceite: suíte isolada, lint/typecheck/build, cadastro e login reais
no Chrome/PostgreSQL, recarga com rotação, JWT expirado com renovação e repetição,
reutilização com 401/revogação, logout com remoção do cookie e limpeza dos dados
temporários. Sessões com formato legado precisam de novo login. Recuperação de
senha e dois fatores permanecem evoluções; coordenação entre abas e limites
distribuídos foram entregues na melhoria técnica abaixo.

Verificação histórica desta entrega: 373 testes aprovados (322 backend, 51 frontend), lint,
typecheck e build; Prisma format/validate/generate e migration status aprovados.
No Chrome/PostgreSQL: cadastro 201, login e `/me` 200, reload com refresh 200 e
hash rotacionado, JWT expirado com sequência 401/refresh 200/repetição 200,
reutilização 401 com revogação persistida e logout 204 com cookie removido.
Reload e retorno pelo histórico após logout exibiram login. Duas atualizações
concorrentes reais consumiram o hash uma única vez. Nenhum token no armazenamento
web ou logs. Limpeza confirmou zero resíduos após remover três sessões, um
VinculoEscritorio, um Usuario e um Escritorio; somente os processos do teste foram encerrados.
O 404 de favicon preexistente foi resolvido na melhoria técnica seguinte.

## Melhoria técnica dos RF-004 a RF-006 e RNF-002/RNF-003

Implementada: coordenação por BroadcastChannel/Web Locks, protocolo de mensagens
com sessão/correlação/versão, renovação única entre abas concorrentes, propagação
de login/logout/expiração/revogação e fallback seguro sem armazenamento persistente.
Detecção de reutilização permanece estrita, sem janela de tolerância.

Rate limit compartilhado PostgreSQL protege cadastro, login e refresh, com
HMAC nas chaves, operação atômica, configuração validada, 429/Retry-After,
503 em indisponibilidade e limpeza concorrente encerrada no shutdown.
Migration `20260924100000_create_distributed_rate_limits` aplicada sem reset.
Favicon WD em SVG incluído no HTML e build; nenhum novo RF ou Redis.
Verificação final: 411 testes aprovados (345 backend e 66 frontend), lint,
typecheck e build; Prisma format/validate/generate e status das migrations aprovados.

Critérios verificados no Chrome/PostgreSQL: cadastro 201; login, `/me` e refresh
200; duas abas autenticadas; dois 401 simultâneos gerando um refresh e uma
rotação de hash, sessão ativa; login, logout e revogação propagados. Logout 204,
duas abas no login, nenhum token no armazenamento web. Duas instâncias Node
compartilham orçamento; 40 consumos concorrentes no banco respeitam limite 7;
próxima janela libera novamente. Favicon 200 sem 404. Dados de verificação e
buckets próprios removidos, somente processos próprios encerrados.

Limites: teste real de navegador somente em Chrome; fallback dos demais cenários
coberto por testes isolados. Abas suspensas recebem eventos ao retomar. Sem canal,
logout é percebido na próxima revalidação; sem locks, exige login manual. Perder
a resposta de uma rotação pode exigir novo login. Metas de carga/alta disponibilidade,
proteção avançada e limpeza histórica de sessões continuam fora desta melhoria.

## Etapas restantes do MVP

### Senhas — RF-007 e RF-008 concluídos

Recuperação por e-mail e alteração autenticada implementadas com contratos da
aplicação, domínio, mapper e repositório Prisma, telas e limites compartilhados.
Migration nova `20260930120000_create_password_recoveries` aplicada localmente;
seis migrations sincronizadas, sem modificar as cinco anteriores.

Verificação de 30/09/2026: Prisma format/validate/generate aprovados, lint,
typecheck, build e **458 testes** (383 backend e 75 frontend) aprovados.
Foram adicionados 43 testes aos 415 anteriores. A verificação explícita
`verify:password-security` passou com Chrome real, SMTP de captura e PostgreSQL:
cadastro, solicitação 202, redefinição 200, senha antiga recusada, nova aceita,
link utilizado/expirado recusado, alteração autenticada e logout em duas abas.
Não houve persistência de segredos no armazenamento do navegador; token ficou
fora das URLs HTTP, logs e registros do banco (somente seu hash foi persistido).

Duas instâncias confirmaram limites por IP, e-mail, hash de token e usuário.
Transações reais confirmaram rollback após escrita de senha e consumo de token,
uma única redefinição concorrente e bloqueio de login com hash antigo. A rotina
de limpeza foi executada sobre tabela temporária da própria conexão: lotes
500/1/0, preservando o registro ainda válido. A regressão real RF-003 a RF-006
também passou, incluindo uma única renovação para duas abas e revogação por
reutilização. Registros/mensagens temporários removidos, dados anteriores
preservados e somente processos iniciados pela verificação encerrados.

O teste real identificou e levou à correção da atualização da mensagem de
sucesso no login quando apenas a query mudava. Troca de senha agora compartilha
o lock de refresh para preservar a limpeza do cookie.

### Processamento durável de recuperação — concluído

A limitação da fila em memória foi resolvida com `recovery_email_jobs`.
Migration `20260930160000_create_recovery_email_jobs` aplicada; sete migrations
sincronizadas, preservando as seis anteriores. Reserva atômica com lease,
tentativas limitadas/backoff, cancelamento efetivo do envio, resultados
condicionados à reserva e limpeza em lotes implementados.

Verificação complementar: **476 testes** (401 backend e 75 frontend), mantendo
os 458 anteriores e adicionando 18. Prisma format/validate/generate, migration
status, lint, typecheck, build e auditoria de diff aprovados. Chrome, frontend,
duas instâncias do backend, PostgreSQL e SMTP reais confirmaram persistência
antes do 202, reinício abrupto, recuperação pela nova instância, falha 451 com
retentativa e novo hash, reserva exclusiva, retomada de lease e rejeição do
resultado antigo. Rollback e limpeza 500/1/0 foram comprovados no banco.
Redefinição e alteração autenticada preservam logout em duas abas.
Dados anteriores preservados; registros, mensagens e processos de teste limpos.

**Limitações:** aceite externo seguido de falha antes da confirmação local pode
produzir e-mail adicional; somente o token mais recente vale. SMTP real local
verificado; Resend integrado pelo SDK oficial e contrato HTTP testado, mas
entrega externa não executada, sem credenciais/domínio verificado e destinatário
autorizado confirmados. Isso não equivale a uma verificação de entregabilidade
em produção. Navegador real validado somente no Chrome. O estado da equipe está na seção RF-009/RF-010/RF-011 abaixo.

A etapa 1 mantém as operações posteriores ao cadastro em andamento; RF-001 e
RF-002 estão concluídos no recorte acima. A etapa 2 tem RF-003 a RF-008 concluídos;
permissões dos demais módulos e controles adicionais continuam planejados.
Segurança, isolamento e registro das operações relevantes devem acompanhar cada
módulo desde o início; a etapa 9 consolida e verifica esses controles, sem adiar
sua aplicação.

| Ordem | Etapa e requisitos | Critérios para concluir |
| --- | --- | --- |
| 1 | Escritórios e usuários — **Cadastro e equipe concluídos; manutenção de escritórios pendente** | Concluir decisões restantes de P-001 e implementar manutenção de escritórios e seleção de contexto. Gestão administrativa de membros está entregue em RF-009/RF-010/RF-011. Preservar unicidade, histórico aplicável e consistência dos vínculos; o cadastro inicial atômico já está entregue. |
| 2 | Autenticação e autorização — Autenticação, senhas e permissões da equipe concluídas; demais módulos pendentes | Preservar login, `/me`, rotação, coordenação entre abas e logout; definir P-002/P-003 e implementar verificação de e-mail, dois fatores e permissões dos demais módulos. RF-007/RF-008 entregam recuperação e alteração de senha. Testar operações autorizadas e isolamento antes de liberar os demais módulos. Evoluir proteção contra abuso além dos limites compartilhados atuais. |
| 3 | Clientes — RF-015 | Definir P-004 e a política aplicável de P-008; validar cadastro, consulta, edição e inativação sem perda de histórico ou vínculos, respeitando permissões. |
| 4 | Casos e processos — RF-016, RF-017 | Definir P-005; validar cadastro e atualização manual, estados e vínculos aprovados com clientes; comprovar consistência e isolamento. Captura automática permanece fora desta etapa. |
| 5 | Tarefas e prazos — RF-018, RF-019 | Resolver as definições aplicáveis de P-006 e P-008; validar responsáveis, acompanhamento e alterações de datas ou estados, mantendo autoria e histórico. Não presumir regras jurídicas de cálculo. |
| 6 | Documentos e anotações — RF-020, RF-021 | Definir P-007 e as permissões e retenção aplicáveis; validar inclusão, consulta e alterações autorizadas; impedir acesso direto não autorizado a arquivos e anotações. |
| 7 | Agenda — RF-022 | Resolver as definições de agenda em P-006; validar compromissos e apresentação coerente de tarefas e prazos, com datas e permissões corretas. |
| 8 | Dashboard — RF-023 | Definir P-009; conferir resumos e contagens contra os dados de origem e testar que filtros e agregações não revelam dados sem autorização. |
| 9 | Auditoria, segurança e aceitação do MVP — RF-024 e RNF-001 a RNF-010 | Concluir P-008 e a revisão dos controles transversais; validar rastreabilidade após alterações e exclusões, acesso à auditoria, sanitização e isolamento; definir e verificar metas operacionais e restauração de dados e documentos antes da liberação. |

## Critérios comuns de entrega

- Resolver e registrar as decisões pendentes que afetem a etapa, sem convertê-las
  silenciosamente em regras aprovadas.
- Validar o fluxo de ponta a ponta correspondente, incluindo erros, autorização,
  isolamento entre escritórios e preservação de histórico quando aplicável.
- Manter lint, typecheck, testes e build aprovados e documentação coerente com o
  comportamento entregue.
- Considerar o MVP concluído somente após aceitação das nove áreas, dos critérios
  não funcionais e dos fluxos integrados; itens pós-MVP não bloqueiam essa entrega.

## Evolução após o MVP

Todos os itens estão planejados para depois do MVP. A lista segue a ordem
informada, mas depende de priorização posterior e definição de escopo. Não há
fornecedores, integrações adicionais, preços ou datas aprovados. Os critérios
abaixo são referências iniciais de aceitação, a detalhar antes de cada etapa.

| Ordem | Funcionalidade | Critérios para concluir |
| --- | --- | --- |
| 1 | Captura automática em tribunais — RF-025 | Definir tribunais, fontes e dados abrangidos; validar captura, associação ao processo correto e tratamento de falhas e duplicidades. |
| 2 | WhatsApp — RF-026 | Aprovar fluxos, contas, permissões e fornecedor; validar comunicação e seu vínculo com o contexto autorizado do escritório. |
| 3 | Assinatura eletrônica — RF-027 | Definir o fluxo e fornecedor; validar envio, acompanhamento e associação do resultado ao documento correto. |
| 4 | Pix e boleto — RF-028 | Definir provedor e regras de cobrança; validar emissão e acompanhamento, evitando duplicação de efeitos em retornos repetidos. |
| 5 | Portal do cliente — RF-029 | Aprovar informações e ações disponíveis; validar autenticação e acesso restrito aos dados autorizados de cada cliente. |
| 6 | Inteligência artificial — RF-030 | Aprovar casos de uso, critérios de qualidade, revisão e tratamento de dados; avaliar resultados com exemplos representativos antes da liberação. |
| 7 | Aplicativo mobile — RF-031 | Definir plataformas e escopo; validar os fluxos selecionados, autenticação e isolamento no aplicativo. |
| 8 | Financeiro avançado — RF-032 | Aprovar operações, relatórios e regras; validar cálculos e rastreabilidade dos registros conforme o escopo definido. |

## Arquivos da entrega RF-007/RF-008

Caminhos relativos à raiz Git. Foram criados 23 arquivos e alterados 29 nesta entrega; nenhum removido. Nove outros arquivos já modificados pela revisão anterior foram preservados sem novas edições. `nomenclature.md` tinha alterações anteriores e recebeu também os termos desta entrega.

| Situação | Caminho |
| --- | --- |
| Criado | `src/backend/prisma/migrations/20260930120000_create_password_recoveries/migration.sql` |
| Criado | `src/backend/src/application/passwords/change-password.ts` |
| Criado | `src/backend/src/application/passwords/password-contracts.ts` |
| Criado | `src/backend/src/application/passwords/password-errors.ts` |
| Criado | `src/backend/src/application/passwords/request-password-recovery.ts` |
| Criado | `src/backend/src/application/security/password-policy.ts` |
| Criado | `src/backend/src/domain/password-recovery/password-recovery.ts` |
| Criado | `src/backend/src/infrastructure/email/resend-email.ts` |
| Criado | `src/backend/src/infrastructure/email/smtp-email.ts` |
| Criado | `src/backend/src/infrastructure/password-services.ts` |
| Criado | `src/backend/src/infrastructure/prisma/password-recovery-mapper.ts` |
| Criado | `src/backend/src/infrastructure/prisma/prisma-password-repository.ts` |
| Criado | `src/backend/src/infrastructure/security/crypto-password-recovery.ts` |
| Criado | `src/backend/src/infrastructure/security/password-recovery-worker.ts` |
| Criado | `src/backend/src/presentation/password-routes.ts` |
| Criado | `src/backend/tests/infrastructure/password-email.test.ts` |
| Criado | `src/backend/tests/integration/password-security.check.mjs` |
| Criado | `src/backend/tests/password-routes.test.ts` |
| Criado | `src/backend/tests/passwords.test.ts` |
| Criado | `src/backend/tests/support/password-fixture.ts` |
| Criado | `src/frontend/src/password-pages.test.tsx` |
| Criado | `src/frontend/src/password-pages.tsx` |
| Criado | `src/frontend/src/password-session.test.ts` |
| Alterado | `src/README.md` |
| Alterado | `src/backend/.env.example` |
| Alterado | `src/backend/package.json` |
| Alterado | `src/backend/prisma/schema.prisma` |
| Alterado | `src/backend/src/app.ts` |
| Alterado | `src/backend/src/application/authentication/authenticate-user.ts` |
| Alterado | `src/backend/src/application/authentication/authentication-contracts.ts` |
| Alterado | `src/backend/src/application/onboarding/register-office-with-owner.ts` |
| Alterado | `src/backend/src/application/security/rate-limiter.ts` |
| Alterado | `src/backend/src/environment.ts` |
| Alterado | `src/backend/src/infrastructure/prisma/prisma-authentication-repository.ts` |
| Alterado | `src/backend/src/infrastructure/security/hmac-rate-limit-keys.ts` |
| Alterado | `src/backend/src/rate-limiting.ts` |
| Alterado | `src/backend/src/server.ts` |
| Alterado | `src/backend/tests/environment.test.ts` |
| Alterado | `src/backend/tests/integration/authentication-browser.check.mjs` |
| Alterado | `src/backend/tests/rate-limiting.test.ts` |
| Alterado | `src/backend/tests/server.test.ts` |
| Alterado | `src/backend/tests/support/rate-limiter-fixture.ts` |
| Alterado | `src/docs/architecture.md` |
| Alterado | `src/docs/business-rules.md` |
| Alterado | `src/docs/nomenclature.md` |
| Alterado | `src/docs/requirements.md` |
| Alterado | `src/docs/roadmap.md` |
| Alterado | `src/frontend/src/app.tsx` |
| Alterado | `src/frontend/src/auth-client.ts` |
| Alterado | `src/frontend/src/login-page.test.tsx` |
| Alterado | `src/frontend/src/login-page.tsx` |
| Alterado | `src/pnpm-lock.yaml` |

## Equipe — RF-009, RF-010 e RF-011

**Implementados no escopo de provisionamento administrativo, autorização e
ativação/inativação do vínculo.** Não há modelo de convite. A área `/equipe`
permite cadastro, confirmação separada de conta existente, pesquisa paginada,
edição, estado e histórico. `/primeiro-acesso` exige a substituição transacional
da senha temporária e novo login, com logout entre abas.

Critérios atendidos: política central dos cinco papéis/cinco permissões,
proprietário e próprio vínculo protegidos, e-mail global único, conta/vínculo
atômicos, concorrência por e-mail e versão, autorização atual consultada no banco,
revogação restrita ao escritório afetado e histórico específico sem segredos.

A migration `20261001100000_administrative_team_provisioning` foi aplicada como
oitava, preservando as sete anteriores. Proprietários existentes recebem todas
as permissões. Estados físicos anteriores não foram traduzidos ou removidos.

Verificação reproduzível: `pnpm --filter ./backend verify:team`, após build,
com Chrome/HTTP/PostgreSQL reais. Cobre cadastro pelo formulário, primeiro acesso,
senha temporária recusada depois da troca, hierarquia de administrador, perda
imediata de autorização, inativação com duas abas, reativação, conta em outro
escritório preservada, conflitos concorrentes, rollback e histórico persistente.
Verificação final: **552 testes aprovados** — 463 backend e 89 frontend —,
preservando os 476 anteriores e acrescentando 76. Prisma format/validate/generate,
deploy/status (oito migrations), lint, typecheck, build e diff-check aprovados.
Também passaram as regressões reais de autenticação entre abas, recuperação com
SMTP local e limites compartilhados entre duas instâncias. Corrigida a repetição
de notificações de revogação que podia interromper novo login explícito.

Revalidação em 01/10/2026: oito migrations sincronizadas, 552 testes e build
aprovados novamente. O fluxo completo de equipe passou no Chrome e PostgreSQL
reais. A primeira tentativa excedeu o prazo de navegação do Chrome antes do
cadastro; a repetição passou sem alteração no código ou nas asserções. Ambas
concluíram a limpeza e preservaram o estado anterior do banco.

Limitações: login com múltiplos vínculos ativos ainda responde 409; seleção e
troca de escritório (RF-013) não foram implementadas. RF-012 permanece reservado
para detalhamento próprio e RF-014 não está concluído. Permissões dos módulos
futuros, transferência de propriedade e auditoria geral permanecem fora do escopo.
A autorização do servidor é imediata; logout visual depende de consulta a cada
dois segundos enquanto a aba está visível ou de retomada do foco. Sessões
restritas não fazem refresh e exigem novo login se nenhuma aba ativa puder
compartilhar credenciais válidas. Verificação visual executada no Chrome.

## Arquivos da entrega RF-009/RF-010/RF-011

Caminhos relativos à raiz Git; nenhum arquivo removido.

| Estado | Caminho |
| --- | --- |
| Alterado | `src/README.md` |
| Alterado | `src/backend/package.json` |
| Alterado | `src/backend/prisma/schema.prisma` |
| Alterado | `src/backend/src/app.ts` |
| Alterado | `src/backend/src/application/authentication/authenticate-user.ts` |
| Alterado | `src/backend/src/application/authentication/authentication-contracts.ts` |
| Alterado | `src/backend/src/application/authentication/authentication-errors.ts` |
| Alterado | `src/backend/src/application/authentication/get-authenticated-identity.ts` |
| Alterado | `src/backend/src/application/authentication/refresh-session.ts` |
| Alterado | `src/backend/src/application/onboarding/register-office-with-owner.ts` |
| Alterado | `src/backend/src/application/passwords/change-password.ts` |
| Alterado | `src/backend/src/application/passwords/password-contracts.ts` |
| Alterado | `src/backend/src/application/security/rate-limiter.ts` |
| Alterado | `src/backend/src/domain/memberships/membership.ts` |
| Alterado | `src/backend/src/domain/sessions/session.ts` |
| Alterado | `src/backend/src/domain/users/invalid-user-error.ts` |
| Alterado | `src/backend/src/domain/users/user.ts` |
| Alterado | `src/backend/src/infrastructure/prisma/authentication-mapper.ts` |
| Alterado | `src/backend/src/infrastructure/prisma/prisma-authentication-repository.ts` |
| Alterado | `src/backend/src/infrastructure/prisma/prisma-office-registration-repository.ts` |
| Alterado | `src/backend/src/infrastructure/prisma/prisma-password-repository.ts` |
| Alterado | `src/backend/src/infrastructure/security/jose-access-tokens.ts` |
| Alterado | `src/backend/src/presentation/authentication-routes.ts` |
| Alterado | `src/backend/src/presentation/password-routes.ts` |
| Alterado | `src/backend/src/rate-limiting.ts` |
| Alterado | `src/backend/src/server.ts` |
| Alterado | `src/backend/tests/domain/user.test.ts` |
| Alterado | `src/backend/tests/infrastructure/authentication-mapper.test.ts` |
| Alterado | `src/backend/tests/infrastructure/authentication-tokens.test.ts` |
| Alterado | `src/backend/tests/infrastructure/prisma-office-registration-repository.test.ts` |
| Alterado | `src/backend/tests/password-routes.test.ts` |
| Alterado | `src/backend/tests/server.test.ts` |
| Alterado | `src/backend/tests/support/rate-limiter-fixture.ts` |
| Alterado | `src/docs/architecture.md` |
| Alterado | `src/docs/business-rules.md` |
| Alterado | `src/docs/nomenclature.md` |
| Alterado | `src/docs/requirements.md` |
| Alterado | `src/docs/roadmap.md` |
| Alterado | `src/frontend/src/app.tsx` |
| Alterado | `src/frontend/src/auth-client.ts` |
| Alterado | `src/frontend/src/infrastructure/browser-session-coordinator.ts` |
| Alterado | `src/frontend/src/login-page.tsx` |
| Alterado | `src/frontend/src/password-pages.tsx` |
| Alterado | `src/frontend/src/session-coordinator.test.ts` |
| Criado | `src/backend/prisma/migrations/20261001100000_administrative_team_provisioning/migration.sql` |
| Criado | `src/backend/src/application/team/manage-team.ts` |
| Criado | `src/backend/src/application/team/team-contracts.ts` |
| Criado | `src/backend/src/application/team/team-policy.ts` |
| Criado | `src/backend/src/infrastructure/prisma/prisma-team-repository.ts` |
| Criado | `src/backend/src/infrastructure/prisma/team-mapper.ts` |
| Criado | `src/backend/src/presentation/team-routes.ts` |
| Criado | `src/backend/tests/integration/team-management.check.mjs` |
| Criado | `src/backend/tests/team.test.ts` |
| Criado | `src/frontend/src/team-page.test.tsx` |
| Criado | `src/frontend/src/team-page.tsx` |

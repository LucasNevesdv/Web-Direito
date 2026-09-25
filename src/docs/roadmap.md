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

Verificação de e-mail, recuperação de senha, convites, gerenciamento de
membros, autenticação em dois fatores e proteção avançada contra abuso do endpoint
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

A etapa 1 mantém as operações posteriores ao cadastro em andamento; RF-001 e
RF-002 estão concluídos no recorte acima. A etapa 2 tem RF-003 a RF-006 concluídos;
permissões dos demais módulos e controles adicionais continuam planejados.
Segurança, isolamento e registro das operações relevantes devem acompanhar cada
módulo desde o início; a etapa 9 consolida e verifica esses controles, sem adiar
sua aplicação.

| Ordem | Etapa e requisitos | Critérios para concluir |
| --- | --- | --- |
| 1 | Escritórios e usuários — **Cadastro RF-001 e RF-002 concluído; evolução pendente** | Concluir decisões de P-001 e implementar manutenção de escritórios, convites e gerenciamento de membros sob autorização. Preservar unicidade, histórico aplicável e consistência dos vínculos; o cadastro inicial atômico já está entregue. |
| 2 | Autenticação e autorização — RF-003 a RF-006 concluídos; evolução de permissões pendente | Preservar login, `/me`, rotação, coordenação entre abas e logout; definir P-002/P-003 e implementar verificação de e-mail, recuperação de senha, dois fatores e permissões. Testar operações autorizadas e isolamento antes de liberar os demais módulos. Evoluir proteção contra abuso além dos limites compartilhados atuais. |
| 3 | Clientes — RF-007 | Definir P-004 e a política aplicável de P-008; validar cadastro, consulta, edição e inativação sem perda de histórico ou vínculos, respeitando permissões. |
| 4 | Casos e processos — RF-008, RF-009 | Definir P-005; validar cadastro e atualização manual, estados e vínculos aprovados com clientes; comprovar consistência e isolamento. Captura automática permanece fora desta etapa. |
| 5 | Tarefas e prazos — RF-010, RF-011 | Resolver as definições aplicáveis de P-006 e P-008; validar responsáveis, acompanhamento e alterações de datas ou estados, mantendo autoria e histórico. Não presumir regras jurídicas de cálculo. |
| 6 | Documentos e anotações — RF-012, RF-013 | Definir P-007 e as permissões e retenção aplicáveis; validar inclusão, consulta e alterações autorizadas; impedir acesso direto não autorizado a arquivos e anotações. |
| 7 | Agenda — RF-014 | Resolver as definições de agenda em P-006; validar compromissos e apresentação coerente de tarefas e prazos, com datas e permissões corretas. |
| 8 | Dashboard — RF-015 | Definir P-009; conferir resumos e contagens contra os dados de origem e testar que filtros e agregações não revelam dados sem autorização. |
| 9 | Auditoria, segurança e aceitação do MVP — RF-016 e RNF-001 a RNF-010 | Concluir P-008 e a revisão dos controles transversais; validar rastreabilidade após alterações e exclusões, acesso à auditoria, sanitização e isolamento; definir e verificar metas operacionais e restauração de dados e documentos antes da liberação. |

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
| 1 | Captura automática em tribunais — RF-017 | Definir tribunais, fontes e dados abrangidos; validar captura, associação ao processo correto e tratamento de falhas e duplicidades. |
| 2 | WhatsApp — RF-018 | Aprovar fluxos, contas, permissões e fornecedor; validar comunicação e seu vínculo com o contexto autorizado do escritório. |
| 3 | Assinatura eletrônica — RF-019 | Definir o fluxo e fornecedor; validar envio, acompanhamento e associação do resultado ao documento correto. |
| 4 | Pix e boleto — RF-020 | Definir provedor e regras de cobrança; validar emissão e acompanhamento, evitando duplicação de efeitos em retornos repetidos. |
| 5 | Portal do cliente — RF-021 | Aprovar informações e ações disponíveis; validar autenticação e acesso restrito aos dados autorizados de cada cliente. |
| 6 | Inteligência artificial — RF-022 | Aprovar casos de uso, critérios de qualidade, revisão e tratamento de dados; avaliar resultados com exemplos representativos antes da liberação. |
| 7 | Aplicativo mobile — RF-023 | Definir plataformas e escopo; validar os fluxos selecionados, autenticação e isolamento no aplicativo. |
| 8 | Financeiro avançado — RF-024 | Aprovar operações, relatórios e regras; validar cálculos e rastreabilidade dos registros conforme o escopo definido. |

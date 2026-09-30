# Nomenclatura em português brasileiro

A refatoração original alterou nomes próprios sem adicionar funcionalidades.
RF-007/RF-008 foram implementados em entrega posterior. Tipos, classes e interfaces usam PascalCase; funções, métodos, variáveis
e propriedades usam camelCase; constantes globais usam UPPER_SNAKE_CASE.
Identificadores não têm acentos. Textos para pessoas mantêm os acentos.

Na entrega de senhas, `RecuperacaoDeSenha`, `RepositorioSenhas`, `EnvioEmail`,
`SolicitacaoRecuperacaoDeSenha`, `RedefinicaoDeSenha` e
`AlteracaoDeSenhaAutenticada` nomeiam responsabilidades de domínio/aplicação.
`PasswordRecovery`, `tokenHash` e campos físicos em inglês pertencem à fronteira
Prisma/PostgreSQL; `from`, `to`, `subject`, `html`, `text`, `fetchRequest` e
opções SMTP pertencem aos SDKs. Os novos contratos JSON usam `senhaAtual`,
`novaSenha` e `confirmacaoNovaSenha`; `email` e `token` são termos técnicos.

Os nomes descrevem a responsabilidade, não uma tradução literal. Classes e tipos
são substantivos. Ações começam com verbo no infinitivo e indicam o objeto;
predicados e booleanos expressam estado ou condição (`estaCoordenacaoEncerrada`,
`podeProsseguir`, `foiHashSubstituido`). Coleções usam plural. Handlers indicam o
evento; callbacks indicam quando são chamados, como `aoExigirNovoLogin` e
`aoExpirarSessao`. Métodos como `Escritorio.criar` e `Sessao.restaurar` mantêm a
forma curta porque a classe já identifica o objeto. Componentes React usam
substantivos em PascalCase, e hooks preservam o prefixo obrigatório `use`.

## Domínio e aplicação

| Nome anterior | Nome adotado |
| --- | --- |
| Office / User / Session / Membership | Escritorio / Usuario / Sessao / VinculoEscritorio |
| CreateOffice / CriarEscritorio | CadastroDeEscritorio |
| RegisterOfficeWithOwner / CadastrarEscritorioComProprietario | CadastroDeEscritorioComProprietario |
| AuthenticateUser / AutenticarUsuario | AutenticacaoDeUsuario |
| GetAuthenticatedIdentity / ObterIdentidadeAutenticada | ConsultaDeIdentidadeAutenticada |
| RefreshSession / RenovarSessao | RenovacaoDeSessao |
| LogoutSession / EncerrarSessao | EncerramentoDeSessao |
| PasswordHasher / GeradorHashSenha | ProtecaoDeSenhas |
| RateLimiter / RateLimitStore | LimitadorRequisicoes / ArmazenamentoLimiteRequisicoes |
| AuthClient / SessionCoordinator | ClienteAutenticacao / CoordenadorSessao |
| executar (casos de uso) | cadastrarEscritorio, cadastrarEscritorioComProprietario, autenticarUsuario, consultarIdentidadeAutenticada, renovarSessao, encerrarSessao |
| buscarPorId / buscarPorEmail | buscarEscritorioPorId / buscarUsuarioComVinculosPorEmail |

## Revisão semântica

| Nome anterior | Nome adotado | Responsabilidade real |
| --- | --- | --- |
| paraConta | converterRegistroPrismaEmUsuarioComVinculos | Converte um registro Prisma de usuário com memberships e escritórios em usuário do domínio com vínculos; não recebe uma resposta HTTP. |
| ContaAutenticacao | UsuarioComVinculos | Representa o usuário carregado do banco e seus vínculos, antes da autenticação. |
| paraDominio / paraPersistencia no mapper de escritório | converterRegistroPrismaEmEscritorio / converterEscritorioEmRegistroPrisma | Explicita origem e destino. |
| Sessao.paraPersistencia | Sessao.obterEstadoAtualDaSessao | Devolve uma cópia defensiva do estado atual da instância de sessão, sem consultar o banco nem expor referências mutáveis internas. |
| hash / verificar na proteção de senhas | gerarHashDaSenha / compararSenhaComHash | Distingue geração e comparação. |
| assinar / verificar no serviço de tokens | criarTokenDeAcesso / validarTokenDeAcesso | Identifica o token e a operação. |
| rotacionarSessao | substituirHashDeRenovacao | Substitui atomicamente o hash da mesma sessão; não cria outra sessão. |
| verificar / consumir nos limites | registrarTentativaDeRequisicao / incrementarContadorDaJanela | A consulta consome uma tentativa, portanto não é uma verificação sem efeitos. |
| renovar (variável do login) | tokenDeRenovacao | Guarda o token gerado, não uma função. |
| pendente / recebidas no coordenador | sincronizacoesPendentes / identificadoresDasMensagensRecebidas | Identifica as coleções e seus conteúdos, sem abreviar identificadores. |
| geracao / versaoToken no cliente | versaoDaIdentidade / versaoDoTokenDeAcesso | Distingue troca de identidade e renovação de token. |
| publicar / invalidar no coordenador | compartilharCredenciaisDaSessao / propagarInvalidacaoDaSessao | Explicita os efeitos entre abas. |

Repositórios usam operações específicas: `salvarEscritorio`,
`salvarCadastroCompleto`, `salvarSessao`, `buscarSessaoComUsuarioPorId` e
`revogarSessao`. Não foi acrescentado repositório genérico. Mocks, fixtures e
scripts de verificação acompanham os mesmos contratos. Nomes locais como
`resposta`, `campo` e `resultado` são mantidos quando a operação imediatamente
anterior e o escopo curto tornam seu significado inequívoco.

`estaCoordenacaoEncerrada` indica que o coordenador de abas encerrou seus
recursos; não indica revogação ou expiração da sessão. `estaLimpezaEncerrada`
indica o encerramento da limpeza periódica de limites. A requisição de
sincronização usa a variável local `identificadorDaRequisicao`; os campos
serializados do protocolo entre abas permanecem inalterados.

O domínio usa `ATIVO`, `INATIVO` e `PROPRIETARIO`. Não foram acrescentados papéis,
estados ou regras. Mappers e repositórios convertem esses valores para os enums
físicos, mantendo os registros existentes acessíveis.

## Contrato público preservado nesta revisão

O JSON foi traduzido na refatoração anterior. Esta revisão semântica preserva
integralmente esse contrato, as URLs e os códigos HTTP. Na publicação da tradução
original, frontend e backend devem ser atualizados juntos, pois clientes que
enviam o antigo JSON em inglês não são compatíveis.

| Operação | Entrada e saída |
| --- | --- |
| POST /api/v1/onboarding | Recebe `nomeEscritorio`, `nomeAdministrador`, `email`, `senha`. Retorna `escritorio`, `usuario`, `papel`. |
| Escritório público | `id`, `nome`, `situacao`, `criadoEm`, `atualizadoEm`. |
| Usuário público | `id`, `nome`, `email`. |
| POST /api/v1/auth/login | Recebe `email`, `senha`. Retorna `tokenAcesso`, `expiraEmSegundos`, `usuario`, `escritorio`. |
| GET /api/v1/auth/me | Retorna `usuario` e `escritorio`; escritório inclui `id`, `nome`, `papel`. |
| POST /api/v1/auth/refresh | Usa somente o cookie existente; retorna o mesmo contrato público do login. |
| POST /api/v1/auth/logout | Mantém HTTP 204 sem corpo. |
| Erros de cadastro e autenticação | `erro`, `mensagem` e, quando aplicável, `campos`; códigos próprios em português. |
| GET /health e GET /ready | Usam `situacao`; valores de monitoramento `ok`, `ready`, `not_ready` preservados. |

`senha`, `hashSenha` e token de renovação nunca são devolvidos nos JSONs públicos.
O access token continua exclusivo dos fluxos de login e renovação. A confirmação
de senha permanece somente no formulário. Datas continuam no mesmo formato.

O protocolo interno entre abas usa propriedades em português e não foi alterado
nesta revisão. Abas anteriores à tradução original precisam ser recarregadas;
não há suporte a versões mistas desse protocolo. A coordenação continua em memória, com BroadcastChannel e
Web Locks, sem Redis ou armazenamento persistente de tokens.

## Inglês preservado após a revisão

| Categoria | Exemplos e motivo |
| --- | --- |
| APIs externas | React `children`, `value`, hooks `use...`; Fastify `listen`, `close`, `reply`, `statusCode`, `trustProxy`; Fetch `method`, `headers`, `body`, `credentials`, `signal`; propriedades JSON Schema e APIs de Node, Vitest, Zod, DOM, Vite e Chrome DevTools. São contratos das bibliotecas e protocolos. |
| Prisma e PostgreSQL | Modelos `Office`, `User`, `Membership`, `Session`, delegates `office`, `user`, `membership`, `session`, `data`, `where`, campos gerados e enums `ACTIVE`, `INACTIVE`, `OWNER`. Nomes SQL, schema e migrations permanecem inalterados. |
| JWT e compatibilidade | `sub`, `sessionId`, `activeOfficeId`, `role`, `OWNER`, `iat`, `exp`, `iss`, `aud`. O envelope assinado é preservado para validar tokens emitidos anteriormente; as claims são convertidas na infraestrutura. |
| Cookies e HTTP | `refresh_token`, `HttpOnly`, `SameSite`, `Secure`, `Path`, `Max-Age`, `Origin`, `Authorization`, `Bearer`, `Retry-After` e nomes atuais das rotas. |
| Contadores e coordenação | Escopos `onboarding-ip`, `login-ip`, `login-identity`, `refresh-ip`, contexto HMAC e nomes de canal/lock permanecem estáveis para preservar chaves e exclusão mútua. Métodos nativos `request`, `postMessage`, `addEventListener`, evento `message`. |
| Termos técnicos | HTTP, JWT, UUID, URL, IP, CIDR, cookie, hash, token, Argon2id, HMAC, salt, socket, backend, frontend, email, id; nomes de algoritmos, pacotes e arquivos. |
| Configuração e diagnóstico | Variáveis de ambiente, comandos pnpm e nomes externos de opções; valores de protocolo e casos de teste que exercitam formatos inválidos. Não são novos identificadores do domínio. |

As alterações de nomenclatura não exigem migration. Migrations aplicadas, hashes,
regras de rotação e revogação, prazos, parâmetros de Argon2 e política de limites
permanecem preservados. As verificações reais usam dados temporários próprios e
confirmam sua remoção, além de encerrar somente os processos que iniciaram.

O diretório temporário `src/backend/node_modules/.cache/nomenclature` foi
removido após confirmar que não continha arquivos versionados. Auditorias
temporárias não integram o código-fonte nem o conjunto final de alterações.

## Verificação da revisão semântica

Prisma format, validate e generate, lint, typecheck, 415 testes (349 de backend
e 66 de frontend) e build aprovados. As cinco migrations existentes estão
aplicadas; schema, migrations e dependências não mudaram.

Chrome e PostgreSQL reais confirmaram cadastro pelo formulário (201), login e
`/me` (200), refresh (200), logout (204), Argon2id e ausência de segredos nas
respostas indevidas e nos logs. Duas abas com 401 simultâneo fizeram um único
refresh; login, revogação e logout foram propagados. Duas instâncias do backend
compartilharam limites; entre 40 tentativas concorrentes, sete foram aceitas e
33 bloqueadas para um limite de sete. O favicon respondeu 200.

Os registros temporários foram removidos e apenas os processos da verificação
foram encerrados. Não havia registros de negócio anteriores no banco local;
a compatibilidade foi exercitada pelos mappers e pelos registros temporários,
sem afirmar validação sobre uma base histórica populada. Nenhum teste foi
removido, nenhum commit ou push foi realizado, e esta revisão não mudou o JSON
público nem acrescentou funcionalidades.

## Arquivos afetados nesta refatoração

A lista abaixo corresponde ao diff e aos arquivos novos; nenhum arquivo foi removido.

- `src/README.md`
- `src/backend/scripts/configure-auth.mjs`
- `src/backend/src/app.ts`
- `src/backend/src/application/authentication/authenticate-user.ts`
- `src/backend/src/application/authentication/authentication-contracts.ts`
- `src/backend/src/application/authentication/authentication-errors.ts`
- `src/backend/src/application/authentication/get-authenticated-identity.ts`
- `src/backend/src/application/authentication/logout-session.ts`
- `src/backend/src/application/authentication/refresh-session.ts`
- `src/backend/src/application/offices/create-office.ts`
- `src/backend/src/application/offices/offices-repository.ts`
- `src/backend/src/application/onboarding/email-already-registered-error.ts`
- `src/backend/src/application/onboarding/invalid-registration-error.ts`
- `src/backend/src/application/onboarding/office-registration-repository.ts`
- `src/backend/src/application/onboarding/register-office-with-owner.ts`
- `src/backend/src/application/security/password-hasher.ts`
- `src/backend/src/application/security/rate-limiter.ts`
- `src/backend/src/authentication.ts`
- `src/backend/src/database-health-checker.ts`
- `src/backend/src/database.ts`
- `src/backend/src/domain/memberships/invalid-membership-error.ts`
- `src/backend/src/domain/memberships/membership.ts`
- `src/backend/src/domain/offices/invalid-office-error.ts`
- `src/backend/src/domain/offices/office.ts`
- `src/backend/src/domain/sessions/session.ts`
- `src/backend/src/domain/users/invalid-user-error.ts`
- `src/backend/src/domain/users/user.ts`
- `src/backend/src/environment.ts`
- `src/backend/src/infrastructure/prisma/authentication-mapper.ts`
- `src/backend/src/infrastructure/prisma/office-mapper.ts`
- `src/backend/src/infrastructure/prisma/prisma-authentication-repository.ts`
- `src/backend/src/infrastructure/prisma/prisma-office-registration-repository.ts`
- `src/backend/src/infrastructure/prisma/prisma-offices-repository.ts`
- `src/backend/src/infrastructure/prisma/prisma-rate-limit-store.ts`
- `src/backend/src/infrastructure/security/argon2-password-hasher.ts`
- `src/backend/src/infrastructure/security/crypto-refresh-tokens.ts`
- `src/backend/src/infrastructure/security/hmac-rate-limit-keys.ts`
- `src/backend/src/infrastructure/security/jose-access-tokens.ts`
- `src/backend/src/infrastructure/security/rate-limit-cleanup.ts`
- `src/backend/src/presentation/authentication-routes.ts`
- `src/backend/src/presentation/onboarding-route.ts`
- `src/backend/src/presentation/rate-limit-hook.ts`
- `src/backend/src/rate-limiting.ts`
- `src/backend/src/server.ts`
- `src/backend/src/shutdown.ts`
- `src/backend/tests/application/authenticate-user.test.ts`
- `src/backend/tests/application/create-office.test.ts`
- `src/backend/tests/application/register-office-with-owner.test.ts`
- `src/backend/tests/authentication-routes.test.ts`
- `src/backend/tests/database.test.ts`
- `src/backend/tests/domain/membership.test.ts`
- `src/backend/tests/domain/office.test.ts`
- `src/backend/tests/domain/session.test.ts`
- `src/backend/tests/domain/user.test.ts`
- `src/backend/tests/environment.test.ts`
- `src/backend/tests/health.test.ts`
- `src/backend/tests/infrastructure/argon2-password-hasher.test.ts`
- `src/backend/tests/infrastructure/authentication-mapper.test.ts`
- `src/backend/tests/infrastructure/authentication-tokens.test.ts`
- `src/backend/tests/infrastructure/office-mapper.test.ts`
- `src/backend/tests/infrastructure/prisma-office-registration-repository.test.ts`
- `src/backend/tests/integration/authentication-browser.check.mjs`
- `src/backend/tests/integration/distributed-rate-limit.check.mjs`
- `src/backend/tests/integration/onboarding.check.ts`
- `src/backend/tests/integration/prisma-offices-repository.check.ts`
- `src/backend/tests/onboarding-route.test.ts`
- `src/backend/tests/rate-limiting.test.ts`
- `src/backend/tests/server.test.ts`
- `src/backend/tests/session-lifecycle.test.ts`
- `src/backend/tests/shutdown.test.ts`
- `src/backend/tests/support/authentication-fixture.ts`
- `src/backend/tests/support/in-memory-office-registration-repository.ts`
- `src/backend/tests/support/in-memory-offices-repository.ts`
- `src/backend/tests/support/rate-limiter-fixture.ts`
- `src/docs/architecture.md`
- `src/docs/business-rules.md`
- `src/docs/nomenclature.md`
- `src/docs/requirements.md`
- `src/docs/roadmap.md`
- `src/frontend/src/app.tsx`
- `src/frontend/src/auth-client.test.tsx`
- `src/frontend/src/auth-client.ts`
- `src/frontend/src/auth-context.tsx`
- `src/frontend/src/authentication.ts`
- `src/frontend/src/infrastructure/browser-session-coordinator.ts`
- `src/frontend/src/login-page.test.tsx`
- `src/frontend/src/login-page.tsx`
- `src/frontend/src/main.tsx`
- `src/frontend/src/register-page.test.tsx`
- `src/frontend/src/register-page.tsx`
- `src/frontend/src/routing.ts`
- `src/frontend/src/session-coordinator.test.ts`
- `src/frontend/src/session-coordinator.ts`

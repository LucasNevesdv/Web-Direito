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

**Domínio e persistência de escritórios: concluída no escopo da TASK-003.** Entidade `Office` com
UUID, nome normalizado, estado e datas; caso de uso `CreateOffice`; contrato
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
vínculo OWNER na mesma transação. O e-mail normalizado possui restrição única
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

Login, verificação de e-mail, recuperação de senha, convites, gerenciamento de
membros, autenticação em dois fatores e proteção avançada contra abuso do endpoint
público permanecem pendentes. Manutenção e inativação de escritórios também não
foram implementadas. A conclusão de RF-001 e RF-002 não conclui toda a área de
escritórios e usuários nem implementa auditoria ou autorização entre escritórios.

## Etapas restantes do MVP

A etapa 1 mantém as operações posteriores ao cadastro em andamento; RF-001 e
RF-002 estão concluídos no recorte acima. As demais etapas permanecem planejadas.
Segurança, isolamento e registro das operações relevantes devem acompanhar cada
módulo desde o início; a etapa 9 consolida e verifica esses controles, sem adiar
sua aplicação.

| Ordem | Etapa e requisitos | Critérios para concluir |
| --- | --- | --- |
| 1 | Escritórios e usuários — **Cadastro RF-001 e RF-002 concluído; evolução pendente** | Concluir decisões de P-001 e implementar manutenção de escritórios, convites e gerenciamento de membros sob autorização. Preservar unicidade, histórico aplicável e consistência dos vínculos; o cadastro inicial atômico já está entregue. |
| 2 | Autenticação e autorização — RF-003, RF-004 | Definir P-002 e P-003; implementar login, verificação de e-mail, recuperação de senha, sessões, autenticação em dois fatores e permissões; testar acessos permitidos, negados e tentativas de acesso a outro escritório. Definir e implementar proteção avançada contra abuso em P-010. Não disponibilizar consultas ou alterações de dados de negócio a usuários finais antes dos controles de acesso. |
| 3 | Clientes — RF-005 | Definir P-004 e a política aplicável de P-008; validar cadastro, consulta, edição e inativação sem perda de histórico ou vínculos, respeitando permissões. |
| 4 | Casos e processos — RF-006, RF-007 | Definir P-005; validar cadastro e atualização manual, estados e vínculos aprovados com clientes; comprovar consistência e isolamento. Captura automática permanece fora desta etapa. |
| 5 | Tarefas e prazos — RF-008, RF-009 | Resolver as definições aplicáveis de P-006 e P-008; validar responsáveis, acompanhamento e alterações de datas ou estados, mantendo autoria e histórico. Não presumir regras jurídicas de cálculo. |
| 6 | Documentos e anotações — RF-010, RF-011 | Definir P-007 e as permissões e retenção aplicáveis; validar inclusão, consulta e alterações autorizadas; impedir acesso direto não autorizado a arquivos e anotações. |
| 7 | Agenda — RF-012 | Resolver as definições de agenda em P-006; validar compromissos e apresentação coerente de tarefas e prazos, com datas e permissões corretas. |
| 8 | Dashboard — RF-013 | Definir P-009; conferir resumos e contagens contra os dados de origem e testar que filtros e agregações não revelam dados sem autorização. |
| 9 | Auditoria, segurança e aceitação do MVP — RF-014 e RNF-001 a RNF-010 | Concluir P-008 e a revisão dos controles transversais; validar rastreabilidade após alterações e exclusões, acesso à auditoria, sanitização e isolamento; definir e verificar metas operacionais e restauração de dados e documentos antes da liberação. |

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
| 1 | Captura automática em tribunais — RF-015 | Definir tribunais, fontes e dados abrangidos; validar captura, associação ao processo correto e tratamento de falhas e duplicidades. |
| 2 | WhatsApp — RF-016 | Aprovar fluxos, contas, permissões e fornecedor; validar comunicação e seu vínculo com o contexto autorizado do escritório. |
| 3 | Assinatura eletrônica — RF-017 | Definir o fluxo e fornecedor; validar envio, acompanhamento e associação do resultado ao documento correto. |
| 4 | Pix e boleto — RF-018 | Definir provedor e regras de cobrança; validar emissão e acompanhamento, evitando duplicação de efeitos em retornos repetidos. |
| 5 | Portal do cliente — RF-019 | Aprovar informações e ações disponíveis; validar autenticação e acesso restrito aos dados autorizados de cada cliente. |
| 6 | Inteligência artificial — RF-020 | Aprovar casos de uso, critérios de qualidade, revisão e tratamento de dados; avaliar resultados com exemplos representativos antes da liberação. |
| 7 | Aplicativo mobile — RF-021 | Definir plataformas e escopo; validar os fluxos selecionados, autenticação e isolamento no aplicativo. |
| 8 | Financeiro avançado — RF-022 | Aprovar operações, relatórios e regras; validar cálculos e rastreabilidade dos registros conforme o escopo definido. |

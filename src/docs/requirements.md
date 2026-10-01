# Requisitos iniciais do produto

Esta especificação detalha o escopo da [visão](vision.md) para planejamento do
MVP. Um requisito listado não significa funcionalidade já implementada; o estado
das entregas está no [roadmap](roadmap.md). As regras e decisões pendentes estão
em [business-rules.md](business-rules.md).

## Requisitos funcionais do MVP

As nove áreas do MVP estão confirmadas. Os requisitos abaixo traduzem essas
áreas em comportamentos verificáveis; campos, perfis e políticas ainda não
aprovados permanecem explicitamente pendentes.

| ID | Requisito e resultado esperado |
| --- | --- |
| RF-001 | **Concluído — criar escritório e primeiro usuário administrador no mesmo cadastro.** A página `/register` e `POST /api/v1/onboarding` recebem nome do escritório, nome do responsável, e-mail e senha, validam e normalizam os dados e criam escritório, usuário e vínculo PROPRIETARIO atomicamente. Escritório e usuário começam ATIVO. A resposta contém somente dados públicos; falhas não deixam registros parciais. Manutenção e inativação do escritório permanecem pendentes, fora deste escopo concluído. |
| RF-002 | **Concluído como condição técnica de RF-001 — persistir usuário e vínculo inicial com o escritório.** O e-mail é único globalmente, inclusive sob concorrência, a senha é protegida com Argon2id e o vínculo inicial tem papel PROPRIETARIO. RF-002 cobre esse cadastro inicial atômico. A gestão administrativa de equipe é entregue em RF-009/RF-010/RF-011; seleção de escritório e autorização dos demais módulos permanecem pendentes. |
| RF-003 | **Concluído — login com e-mail e senha.** `/login` verifica Argon2id, usuário ATIVO e único escritório ATIVO com vínculo válido, cria Sessao, emite access token e envia refresh token em cookie HttpOnly. `/me` confirma identidade e contexto da sessão. |
| RF-004 | **Concluído — emissão e gerenciamento de tokens.** JWT de até 15 minutos, refresh identificável com segredo de 256 bits, somente SHA-256 no banco, rotação atômica e revogação por reutilização. A matriz da equipe é entregue em RF-010; autorização dos demais módulos permanece pendente. |
| RF-005 | **Concluído — renovação de sessão.** POST `/api/v1/auth/refresh` usa apenas cookie HttpOnly, reconfirma sessão/identidade/vínculo, rotaciona o refresh e preserva a expiração absoluta de sete dias. Frontend restaura após recarga, coordena renovação entre abas por Web Locks/BroadcastChannel e repete cada requisição com 401 uma única vez. Expiração e falha definitiva se propagam; fallback seguro está documentado na arquitetura. |
| RF-006 | **Concluído — logout.** POST `/api/v1/auth/logout` revoga a sessão, limpa o cookie e retorna 204 de forma idempotente. Botão Sair limpa memória e identidade nas abas conectadas e volta ao login; guard impede exibir conteúdo protegido pelo botão Voltar. |
| RF-007 | **Implementado — recuperação de senha por e-mail.** Solicitação pública com HTTP 202 genérico após commit do trabalho elegível no PostgreSQL, envio assíncrono SMTP/Resend com lease entre instâncias, retomada após reinício e tentativas limitadas, token aleatório de 256 bits com SHA-256 no banco, uso único e validade de 30 minutos. Redefinição transacional revoga todas as sessões. Fluxo real validado no Chrome com SMTP local, reinício abrupto, duas instâncias e retentativa após falha; entrega externa Resend não verificada. |
| RF-008 | **Implementado — alteração de senha autenticada.** Exige sessão ativa e senha atual, mesma política do cadastro, confirmação e senha diferente. Atualização, invalidação de recuperações e revogação de todas as sessões são atômicas; remove cookie, limpa memória e desconecta abas. |
| RF-009 | **Implementado — cadastro administrativo.** Proprietário/administrador cadastram nome, e-mail, papel, permissões e senha temporária no escritório da sessão. Conta nova e vínculo são atômicos; conta existente exige confirmação explícita para criar somente vínculo, preservando senha e outros escritórios. E-mail não é editável. Concorrência e rollback são obrigatórios. |
| RF-010 | **Implementado — papéis, permissões e primeiro acesso.** Cinco papéis e cinco permissões reais da equipe, com hierarquia central, validação no backend e histórico. Login temporário leva a sessão restrita e `/primeiro-acesso`; troca transacional revoga sessões e exige novo login. Redefinição por recuperação também remove a obrigação. |
| RF-011 | **Implementado — ativar/inativar vínculo.** Preserva conta, papel, permissões e histórico. Inativação revoga somente sessões daquele escritório; reativação exige novo login. Proprietário, próprio vínculo e administrador par são protegidos. |
| RF-012 | **Pendente e fora desta entrega.** Identificador reservado; detalhamento depende de pedido específico aprovado. |
| RF-013 | **Pendente — seleção/troca de escritório.** A sessão já possui contexto mínimo para autorização e revogação, mas não existe seletor de escritório. Login com múltiplos vínculos ativos continua respondendo 409. |
| RF-014 | **Pendente — isolamento abrangente do produto.** A equipe filtra todas as operações pelo escritório da sessão; os demais módulos ainda precisam implementar e demonstrar seu próprio isolamento. |
| RF-015 | Cadastrar, consultar, atualizar e inativar clientes do escritório, preservando seus vínculos e histórico. Campos e tratamento de duplicidades: pendentes. |
| RF-016 | Cadastrar, consultar e atualizar casos e seus vínculos com clientes do mesmo escritório. Estados e cardinalidade dos relacionamentos: pendentes. |
| RF-017 | Registrar e acompanhar processos com informações inseridas manualmente, associados ao contexto do escritório. Identificadores, estados e relação entre caso e processo: pendentes; captura automática não pertence ao MVP. |
| RF-018 | Criar, atribuir e acompanhar tarefas, registrando alterações de responsável, estado e prazo quando houver. Estados e regras de conclusão: pendentes. |
| RF-019 | Registrar e consultar prazos, com data, responsável e contexto de negócio; manter histórico de alterações. Horários, fusos e regras de tratamento de datas: pendentes, sem assumir cálculo jurídico automático. |
| RF-020 | Incluir, consultar e obter documentos vinculados ao contexto de negócio autorizado. Restringir acesso ao conteúdo; armazenamento, formatos, limites e versionamento: pendentes. |
| RF-021 | Registrar e consultar anotações no contexto de casos ou processos, aplicando controle de acesso também às alterações. Granularidade da visibilidade: pendente. |
| RF-022 | Registrar e consultar compromissos na agenda e apresentar tarefas e prazos autorizados com suas datas. Regras de exibição, recorrência e eventuais lembretes: pendentes. |
| RF-023 | Exibir dashboard com resumo de casos, processos, tarefas e prazos acessíveis ao usuário. Indicadores, filtros e períodos: pendentes; valores devem corresponder aos registros de origem. |
| RF-024 | Registrar e permitir consulta autorizada da auditoria de operações relevantes, incluindo alterações, inativações e exclusões. Preservar autoria, escritório, recurso, ação e momento; eventos adicionais, retenção e acesso à auditoria: pendentes. |

## Requisitos não funcionais

RF-003 a RF-011 abrangem autenticação, senhas e equipe. RF-012 a RF-014
ficam reservados às próximas entregas, sem implementação nesta tarefa.
Para evitar IDs duplicados, os antigos RF-009 a RF-026 dos módulos de negócio
e pós-MVP passam a RF-015 a RF-032, preservando o escopo.

Isolamento, segurança, auditoria e preservação de histórico são requisitos do
produto. Os critérios abaixo orientam sua aceitação; metas operacionais e
escolhas de solução não informadas estão marcadas como pendentes.

| ID | Critério de aceitação |
| --- | --- |
| RNF-001 | **Isolamento:** leituras, buscas, agregações, gravações e acesso a arquivos devem verificar escritório e autorização no backend. Testes com dois escritórios devem provar ausência de leitura ou alteração cruzada, inclusive por IDs fornecidos diretamente pelo cliente. |
| RNF-002 | **Segurança de acesso:** Argon2id, sessão absoluta de até 7 dias, JWT de até 15 minutos, rotação e logout. Cadastro/login/refresh têm limites atômicos compartilhados no PostgreSQL, incluindo IP + e-mail normalizado no login; chaves HMAC, políticas configuráveis, 429/Retry-After, falha fechada com 503 e limpeza concorrente de expirados. Proxy confiável somente por lista explícita. Falhas de credenciais/renovação são genéricas. POST com Origin autorizado, SameSite=Lax, produção HTTPS e Secure. Recuperação e alteração de senha estão implementadas em RF-007/RF-008; verificação de e-mail e dois fatores permanecem pendentes. |
| RNF-003 | **Segredos e erros:** credenciais fora do versionamento; senha, hashes e refresh token nunca aparecem no JSON. Access token é retornado somente no login/refresh e mantido apenas em memória. Refresh token é entregue somente em cookie HttpOnly. Nenhum token em localStorage/sessionStorage/IndexedDB. Logs e auditoria não incluem senha, hashes, tokens completos, cookies ou URLs com credenciais. |
| RNF-004 | **Desempenho:** limitar o volume retornado nas listagens e medir tempo de resposta e erros dos fluxos principais com carga representativa. Metas de percentil 95, volume de dados e concorrência são pendentes e devem ser definidas antes da aceitação de desempenho do MVP. |
| RNF-005 | **Disponibilidade:** distinguir serviço ativo de banco disponível por `/health` e `/ready`, com limites finitos de conexão e consulta. Meta de disponibilidade, janela de medição e procedimento de recuperação: pendentes; a infraestrutura atual não representa, por si só, garantia de alta disponibilidade. |
| RNF-006 | **Auditoria:** permitir rastrear operações relevantes por escritório, autor, ação, recurso e instante. Preservar evidências após exclusões e restringir consulta ou manutenção dos registros; não copiar indiscriminadamente dados sensíveis para logs. Retenção e política de manutenção: pendentes. |
| RNF-007 | **Integridade e histórico:** impedir vínculos entre registros de escritórios diferentes e alterações que deixem dados inconsistentes. Inativação de cliente e atualização de tarefa ou prazo devem preservar o histórico exigido pelas regras de negócio. |
| RNF-008 | **Recuperação:** antes da liberação do MVP, definir e validar restauração de dados e documentos a partir de cópias protegidas. Frequência, retenção, perda de dados tolerável (RPO) e tempo de recuperação (RTO): pendentes; não há política já implantada declarada nesta documentação. |
| RNF-009 | **Arquitetura:** manter Clean Architecture no backend, com regras e contratos da aplicação independentes de Prisma e demais detalhes de infraestrutura. PostgreSQL e Prisma permanecem como escolhas confirmadas; criar abstrações somente quando utilizadas. |
| RNF-010 | **Verificabilidade:** validar cada entrega com testes de sucesso, falha, autorização e isolamento pertinentes, além de lint, typecheck, testes e build do workspace. A suíte unitária usa configuração isolada, sem PostgreSQL ou leitura do `.env` real. Verificações reais são optativas, executadas separadamente com a configuração local e limpeza comprovada dos próprios registros temporários. |

## Alcance das entregas de escritórios e cadastro

A TASK-003 concluiu domínio e persistência de `Escritorio`: `CadastroDeEscritorio`, contrato,
mapper e repositórios específicos. Essa criação interna continua disponível,
sem endpoint próprio de atualização ou exclusão.

RF-001 entrega o cadastro público completo sobre essa base. RF-002 foi atendido
como condição técnica da atomicidade de RF-001, limitado ao usuário e vínculo
iniciais. Esse recorte explicita a conclusão do cadastro sem declarar concluídos
manutenção do escritório ou os demais módulos. A equipe possui entrega própria abaixo.

Critérios do fluxo implementado:

- Nomes de 2 a 120 caracteres após trim; e-mail validado, normalizado e único;
  senha de 12 a 128 caracteres e confirmação igual somente no frontend.
- IDs, papel, estado e datas definidos no servidor; somente PROPRIETARIO no primeiro
  vínculo; rejeição de campos extras na API.
- HTTP 201 com escritório, ID/nome/e-mail do usuário e papel; HTTP 400 para
  entrada inválida, 409 para e-mail existente e 500 genérico. Sem hash, senha,
  token ou início automático de sessão.
- Transação única com rollback integral e restrição única de e-mail efetiva
  também sob concorrência; testes reais executados separadamente da suíte comum.
- Formulário com mensagens por campo, prevenção de envio duplicado e confirmação
  de sucesso com link para `/login`.

RNF-009 é aplicado às camadas entregues; isso não conclui a arquitetura de todos
os módulos. RF-003 a RF-006 estão concluídos no recorte de autenticação: `/me` exige
token e sessão válidos e confirma usuário, escritório e vínculo no banco.
Auditoria e isolamento dos demais módulos exigidos por RNF-001 permanecem
pendentes; emitir tokens não conclui a autorização do produto.

O login responde 200 no sucesso, 400 para corpo inválido, 401 genérico para
credenciais ou contas indisponíveis, 409 quando há mais de um escritório ativo,
429 para excesso de tentativas e 500 sanitizado para falhas inesperadas.
Sessões regulares restauram por refresh; sessões restritas podem compartilhar
credenciais com outra aba ativa, mas não renovam. Após expiração ou fechamento
de todas as abas, é necessário novo login temporário. Reutilização revoga a
sessão. `/me`, equipe e alterações de senha revalidam o banco e rejeitam
revogação imediatamente, mesmo antes de o JWT expirar. Sessões do formato antigo de refresh exigem novo login.

## Funcionalidades e integrações futuras — fora do MVP

Os itens abaixo estão confirmados como intenção pós-MVP, sem fornecedor,
protocolo de integração, prazo de entrega ou desenho detalhado definidos.
Não são critérios de conclusão do MVP.

| ID | Escopo futuro | Definições necessárias antes da implementação |
| --- | --- | --- |
| RF-025 | Captura automática de informações em tribunais. | Tribunais abrangidos, fontes autorizadas, informações capturadas e atualização. |
| RF-026 | Integração com WhatsApp. | Fluxos de comunicação, contas, permissões e fornecedor. |
| RF-027 | Assinatura eletrônica de documentos. | Fluxos, fornecedor, acompanhamento e armazenamento dos resultados. |
| RF-028 | Cobranças por Pix e boleto. | Provedor, criação e acompanhamento de cobranças e tratamento dos retornos. |
| RF-029 | Portal do cliente. | Identificação do cliente, informações visíveis e ações permitidas. |
| RF-030 | Recursos de inteligência artificial. | Casos de uso, tratamento dos dados, revisão dos resultados e critérios de qualidade. |
| RF-031 | Aplicativo mobile. | Plataformas, funcionalidades e requisitos de segurança. |
| RF-032 | Financeiro avançado. | Operações, relatórios e regras financeiras desejadas. |

## Pendências para detalhamento

As políticas de produto P-001 a P-010 estão centralizadas em
[business-rules.md](business-rules.md). Cada etapa deve resolver as pendências
que afetam seus critérios de aceitação antes de ser considerada concluída.
Também faltam metas mensuráveis de desempenho, disponibilidade, recuperação e
sucesso do produto. Não foram definidos preços ou regras jurídicas; o provedor Resend foi escolhido somente para os e-mails de recuperação.

## Critérios específicos de equipe

- `/equipe`: paginação (10 por página na tela, máximo 50 na API), pesquisa por
  nome/e-mail, primeiro acesso pendente, ações autorizadas e confirmações.
- Criação exige cadastro e definição de permissões. Administradores recebem as
  cinco permissões por padrão; papéis inferiores recebem nenhuma, podendo obter
  apenas visualização. Permissões administrativas não ultrapassam a hierarquia.
- Edição usa `versao` para conflito concorrente. Toda mudança de papel, permissão
  ou estado revoga sessões do vínculo e grava histórico na mesma transação.
- Cadastro limita 10/IP/15 minutos por padrão; primeiro acesso compartilha os
  limites de alteração de senha (5/IP e 5/usuário/15 minutos). HTTP 429 inclui
  `Retry-After`; erros não revelam segredos.
- A autorização é revogada imediatamente no servidor. Abas visíveis verificam
  `/me` a cada dois segundos e ao recuperar foco; a descoberta de revogação
  propaga logout. Abas suspensas verificam ao voltar a ficar visíveis.
- Não há envio da senha temporária por e-mail nem transferência de propriedade.

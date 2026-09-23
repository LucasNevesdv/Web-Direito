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
| RF-001 | **Concluído — criar escritório e primeiro usuário administrador no mesmo cadastro.** A página `/register` e `POST /api/v1/onboarding` recebem nome do escritório, nome do responsável, e-mail e senha, validam e normalizam os dados e criam escritório, usuário e vínculo OWNER atomicamente. Escritório e usuário começam ACTIVE. A resposta contém somente dados públicos; falhas não deixam registros parciais. Manutenção e inativação do escritório permanecem pendentes, fora deste escopo concluído. |
| RF-002 | **Concluído como condição técnica de RF-001 — persistir usuário e vínculo inicial com o escritório.** O e-mail é único globalmente, inclusive sob concorrência, a senha é protegida com Argon2id e o vínculo inicial tem papel OWNER. RF-002 cobre esse cadastro inicial atômico; convites, gerenciamento de membros, uso de múltiplos escritórios e verificação de autorização continuam pendentes. |
| RF-003 | **Concluído — login com e-mail e senha.** `/login` verifica Argon2id, usuário ACTIVE e único escritório ACTIVE com vínculo válido, cria Session, emite access token e envia refresh token em cookie HttpOnly. `/me` confirma identidade e contexto da sessão. |
| RF-004 | **Parcialmente concluído — tokens e autorização.** JWT assinado, validação de algoritmo/emissor/audiência/expiração e proteção de `/me` entregues. A autorização das operações dos demais módulos e a matriz de permissões permanecem pendentes. |
| RF-005 | **Pendente — renovação de sessão.** Usar futuramente o refresh token protegido para renovar o acesso, com política de rotação e revogação a detalhar. Nenhum endpoint de renovação foi implementado. |
| RF-006 | **Pendente — logout.** Encerrar a sessão e limpar o cookie por um fluxo autorizado. Nenhum endpoint ou botão de logout foi implementado. |
| RF-007 | Cadastrar, consultar, atualizar e inativar clientes do escritório, preservando seus vínculos e histórico. Campos e tratamento de duplicidades: pendentes. |
| RF-008 | Cadastrar, consultar e atualizar casos e seus vínculos com clientes do mesmo escritório. Estados e cardinalidade dos relacionamentos: pendentes. |
| RF-009 | Registrar e acompanhar processos com informações inseridas manualmente, associados ao contexto do escritório. Identificadores, estados e relação entre caso e processo: pendentes; captura automática não pertence ao MVP. |
| RF-010 | Criar, atribuir e acompanhar tarefas, registrando alterações de responsável, estado e prazo quando houver. Estados e regras de conclusão: pendentes. |
| RF-011 | Registrar e consultar prazos, com data, responsável e contexto de negócio; manter histórico de alterações. Horários, fusos e regras de tratamento de datas: pendentes, sem assumir cálculo jurídico automático. |
| RF-012 | Incluir, consultar e obter documentos vinculados ao contexto de negócio autorizado. Restringir acesso ao conteúdo; armazenamento, formatos, limites e versionamento: pendentes. |
| RF-013 | Registrar e consultar anotações no contexto de casos ou processos, aplicando controle de acesso também às alterações. Granularidade da visibilidade: pendente. |
| RF-014 | Registrar e consultar compromissos na agenda e apresentar tarefas e prazos autorizados com suas datas. Regras de exibição, recorrência e eventuais lembretes: pendentes. |
| RF-015 | Exibir dashboard com resumo de casos, processos, tarefas e prazos acessíveis ao usuário. Indicadores, filtros e períodos: pendentes; valores devem corresponder aos registros de origem. |
| RF-016 | Registrar e permitir consulta autorizada da auditoria de operações relevantes, incluindo alterações, inativações e exclusões. Preservar autoria, escritório, recurso, ação e momento; eventos adicionais, retenção e acesso à auditoria: pendentes. |

## Requisitos não funcionais

A numeração foi ajustada na entrega de RF-003: RF-005 e RF-006 identificam
renovação e logout conforme o escopo atual. Os antigos RF-005 a RF-022 passaram
a RF-007 a RF-024, preservando seu conteúdo e as referências nos demais documentos.

Isolamento, segurança, auditoria e preservação de histórico são requisitos do
produto. Os critérios abaixo orientam sua aceitação; metas operacionais e
escolhas de solução não informadas estão marcadas como pendentes.

| ID | Critério de aceitação |
| --- | --- |
| RNF-001 | **Isolamento:** leituras, buscas, agregações, gravações e acesso a arquivos devem verificar escritório e autorização no backend. Testes com dois escritórios devem provar ausência de leitura ou alteração cruzada, inclusive por IDs fornecidos diretamente pelo cliente. |
| RNF-002 | **Segurança de acesso:** Argon2id, sessão persistida, JWT de até 15 minutos e refresh token de até 7 dias. Login possui limite básico por IP e resposta idêntica para credenciais inválidas ou contas inativas. Produção exige HTTPS e cookie Secure. Renovação, logout, verificação de e-mail, recuperação de senha, dois fatores e proteção distribuída contra abuso permanecem pendentes. |
| RNF-003 | **Segredos e erros:** credenciais fora do versionamento; senha, hashes e refresh token nunca aparecem no JSON. Access token é retornado somente no login e mantido apenas em memória. Refresh token é entregue somente em cookie HttpOnly. Logs e auditoria não incluem senha, hashes, tokens completos, cookies ou URLs com credenciais. |
| RNF-004 | **Desempenho:** limitar o volume retornado nas listagens e medir tempo de resposta e erros dos fluxos principais com carga representativa. Metas de percentil 95, volume de dados e concorrência são pendentes e devem ser definidas antes da aceitação de desempenho do MVP. |
| RNF-005 | **Disponibilidade:** distinguir serviço ativo de banco disponível por `/health` e `/ready`, com limites finitos de conexão e consulta. Meta de disponibilidade, janela de medição e procedimento de recuperação: pendentes; a infraestrutura atual não representa, por si só, garantia de alta disponibilidade. |
| RNF-006 | **Auditoria:** permitir rastrear operações relevantes por escritório, autor, ação, recurso e instante. Preservar evidências após exclusões e restringir consulta ou manutenção dos registros; não copiar indiscriminadamente dados sensíveis para logs. Retenção e política de manutenção: pendentes. |
| RNF-007 | **Integridade e histórico:** impedir vínculos entre registros de escritórios diferentes e alterações que deixem dados inconsistentes. Inativação de cliente e atualização de tarefa ou prazo devem preservar o histórico exigido pelas regras de negócio. |
| RNF-008 | **Recuperação:** antes da liberação do MVP, definir e validar restauração de dados e documentos a partir de cópias protegidas. Frequência, retenção, perda de dados tolerável (RPO) e tempo de recuperação (RTO): pendentes; não há política já implantada declarada nesta documentação. |
| RNF-009 | **Arquitetura:** manter Clean Architecture no backend, com regras e contratos da aplicação independentes de Prisma e demais detalhes de infraestrutura. PostgreSQL e Prisma permanecem como escolhas confirmadas; criar abstrações somente quando utilizadas. |
| RNF-010 | **Verificabilidade:** validar cada entrega com testes de sucesso, falha, autorização e isolamento pertinentes, além de lint, typecheck, testes e build do workspace. A suíte unitária usa configuração isolada, sem PostgreSQL ou leitura do `.env` real. Verificações reais são optativas, executadas separadamente com a configuração local e limpeza comprovada dos próprios registros temporários. |

## Alcance das entregas de escritórios e cadastro

A TASK-003 concluiu domínio e persistência de `Office`: `CreateOffice`, contrato,
mapper e repositórios específicos. Essa criação interna continua disponível,
sem endpoint próprio de atualização ou exclusão.

RF-001 entrega o cadastro público completo sobre essa base. RF-002 foi atendido
como condição técnica da atomicidade de RF-001, limitado ao usuário e vínculo
iniciais. Esse recorte explicita a conclusão do cadastro sem declarar concluídos
manutenção do escritório, convites ou gerenciamento de membros.

Critérios do fluxo implementado:

- Nomes de 2 a 120 caracteres após trim; e-mail validado, normalizado e único;
  senha de 12 a 128 caracteres e confirmação igual somente no frontend.
- IDs, papel, estado e datas definidos no servidor; somente OWNER no primeiro
  vínculo; rejeição de campos extras na API.
- HTTP 201 com escritório, ID/nome/e-mail do usuário e papel; HTTP 400 para
  entrada inválida, 409 para e-mail existente e 500 genérico. Sem hash, senha,
  token ou início automático de sessão.
- Transação única com rollback integral e restrição única de e-mail efetiva
  também sob concorrência; testes reais executados separadamente da suíte comum.
- Formulário com mensagens por campo, prevenção de envio duplicado e confirmação
  de sucesso com link para `/login`.

RNF-009 é aplicado às camadas entregues; isso não conclui a arquitetura de todos
os módulos. RF-003 está concluído e RF-004 parcialmente concluído: `/me` exige
token e sessão válidos e confirma usuário, escritório e vínculo no banco.
Auditoria e isolamento dos demais módulos exigidos por RNF-001 permanecem
pendentes; emitir tokens não conclui a autorização do produto.

O login responde 200 no sucesso, 400 para corpo inválido, 401 genérico para
credenciais ou contas indisponíveis, 409 quando há mais de um escritório ativo,
429 para excesso de tentativas e 500 sanitizado para falhas inesperadas.
Recarregar a página perde o access token em memória e exige novo login; o cookie
permanece até expirar, mas não é consumido enquanto RF-005 estiver pendente.

## Funcionalidades e integrações futuras — fora do MVP

Os itens abaixo estão confirmados como intenção pós-MVP, sem fornecedor,
protocolo de integração, prazo de entrega ou desenho detalhado definidos.
Não são critérios de conclusão do MVP.

| ID | Escopo futuro | Definições necessárias antes da implementação |
| --- | --- | --- |
| RF-017 | Captura automática de informações em tribunais. | Tribunais abrangidos, fontes autorizadas, informações capturadas e atualização. |
| RF-018 | Integração com WhatsApp. | Fluxos de comunicação, contas, permissões e fornecedor. |
| RF-019 | Assinatura eletrônica de documentos. | Fluxos, fornecedor, acompanhamento e armazenamento dos resultados. |
| RF-020 | Cobranças por Pix e boleto. | Provedor, criação e acompanhamento de cobranças e tratamento dos retornos. |
| RF-021 | Portal do cliente. | Identificação do cliente, informações visíveis e ações permitidas. |
| RF-022 | Recursos de inteligência artificial. | Casos de uso, tratamento dos dados, revisão dos resultados e critérios de qualidade. |
| RF-023 | Aplicativo mobile. | Plataformas, funcionalidades e requisitos de segurança. |
| RF-024 | Financeiro avançado. | Operações, relatórios e regras financeiras desejadas. |

## Pendências para detalhamento

As políticas de produto P-001 a P-010 estão centralizadas em
[business-rules.md](business-rules.md). Cada etapa deve resolver as pendências
que afetam seus critérios de aceitação antes de ser considerada concluída.
Também faltam metas mensuráveis de desempenho, disponibilidade, recuperação e
sucesso do produto. Não foram definidos preços, fornecedores ou regras jurídicas.

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
| TASK-002.1 — Documentação inicial | Concluída nesta entrega | Visão, requisitos, regras e roadmap preenchidos; escopo do MVP separado do pós-MVP; hipóteses e pendências explícitas, sem decisões jurídicas ou comerciais inventadas. |

A base técnica concluída não significa que autenticação, isolamento dos dados de
negócio ou os módulos do produto já estejam implementados. A descrição técnica
atual permanece em [architecture.md](architecture.md); os próximos módulos devem
seguir Clean Architecture, com PostgreSQL e Prisma como infraestrutura.

## Etapas restantes do MVP

Todas as etapas abaixo estão planejadas. Segurança, isolamento e registro das
operações relevantes devem acompanhar cada módulo desde o início; a etapa 9
consolida e verifica esses controles, sem adiar sua aplicação.

| Ordem | Etapa e requisitos | Critérios para concluir |
| --- | --- | --- |
| 1 | Escritórios e usuários — RF-001, RF-002 | Definir P-001; implementar cadastro e vínculos com identificação do escritório proprietário; validar consistência e impedir relações entre dados de escritórios distintos. |
| 2 | Autenticação e autorização — RF-003, RF-004 | Definir P-002 e P-003; autenticar, encerrar sessões e aplicar permissões no backend; testar acessos permitidos, negados e tentativas de acesso a outro escritório. Não disponibilizar dados de negócio a usuários finais antes desses controles. |
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

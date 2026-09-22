# Regras iniciais de negócio

Estas regras orientam os [requisitos](requirements.md) do MVP. As regras
confirmadas expressam as restrições informadas e suas consequências para acesso
e histórico. Políticas ainda não escolhidas estão na seção de pendências e não
devem ser tratadas como decisões de implementação.

## Regras confirmadas

| ID | Regra |
| --- | --- |
| RN-001 | Todo dado de negócio pertence a um escritório identificável. Clientes, casos, processos, tarefas, prazos, documentos, anotações e compromissos devem manter esse vínculo. |
| RN-002 | Um usuário acessa somente dados de escritórios aos quais pertence e apenas nas operações e recursos para os quais tem autorização. Pertencer ao escritório não implica acesso irrestrito a todos os seus dados. |
| RN-003 | Relacionamentos entre dados de negócio devem respeitar o escritório proprietário. Não é permitido vincular cliente, caso, processo, tarefa, prazo ou documento a registro de outro escritório. |
| RN-004 | A autorização deve ser verificada no backend a cada operação. Informar um ID ou escritório na requisição, ou ocultar uma ação na interface, não substitui essa verificação. |
| RN-005 | Clientes podem ser inativados sem apagar seu histórico nem os registros associados. A inativação não deve provocar exclusão em cascata de casos, processos, tarefas, prazos ou documentos. |
| RN-006 | Tarefas devem preservar histórico de alterações, incluindo responsável, estado e prazo quando aplicável, com autor e momento da mudança. Alterar o estado atual não pode apagar esse histórico. |
| RN-007 | Prazos devem preservar histórico das datas e demais alterações relevantes, com autor e momento. Corrigir ou reagendar um prazo não pode substituir silenciosamente os registros anteriores. |
| RN-008 | Exclusões relevantes devem preservar auditoria suficiente para identificar escritório, autor, ação, recurso e momento, mesmo quando o recurso deixa de estar disponível. A política de exclusão e retenção permanece pendente. |
| RN-009 | Documentos e anotações possuem controle de acesso. Consulta, obtenção do arquivo e alteração devem respeitar o escritório e as permissões sobre o recurso, inclusive quando acessados por endereço ou identificador direto. |
| RN-010 | Agenda e dashboard devem apresentar somente dados autorizados. Contagens e resumos também devem respeitar o isolamento e não revelar informações de outro escritório ou de recursos restritos. |
| RN-011 | A consulta da auditoria deve respeitar o escritório e as permissões definidas. Preservar auditoria não autoriza divulgação irrestrita de documentos, anotações ou credenciais. |

## Decisões pendentes

Os IDs abaixo registram perguntas em aberto, não regras aprovadas. Devem ser
resolvidos com o responsável pelo produto antes da conclusão da etapa afetada.

| ID | Decisão pendente | Requisitos afetados |
| --- | --- | --- |
| P-001 | Quem cria e administra escritórios e vínculos? Como ocorrem inclusão e saída de membros? Um usuário poderá pertencer a vários escritórios e compartilhar a mesma identidade entre eles? Como funciona a inativação de um escritório? | RF-001, RF-002 |
| P-002 | Quais perfis e permissões existirão? Quem pode ver ou alterar cada tipo de recurso, documento, anotação e auditoria? Haverá restrições adicionais por recurso dentro do mesmo escritório? | RF-004, RF-010, RF-011, RF-014 |
| P-003 | Qual será o método de autenticação, recuperação de acesso e encerramento ou expiração de sessão? Como mudanças de vínculo ou permissão serão refletidas nas sessões? | RF-003, RF-004 |
| P-004 | Quais campos de cliente são obrigatórios e como detectar duplicidades? Clientes inativos poderão receber novos vínculos ou ser reativados? | RF-005 |
| P-005 | Quais campos e estados definem casos e processos? Quais são as relações permitidas entre clientes, casos e processos e seus critérios de encerramento? | RF-006, RF-007 |
| P-006 | Quais estados, responsáveis e regras de conclusão se aplicam a tarefas? Como registrar data, horário e fuso de prazos e agenda? Serão necessários recorrência, lembretes ou justificativa de alteração? | RF-008, RF-009, RF-012 |
| P-007 | Onde serão armazenados documentos? Quais tipos, tamanhos, versões e regras de substituição serão aceitos? Como editar e organizar anotações? | RF-010, RF-011 |
| P-008 | Quais operações exigem auditoria e justificativa? Quando usar inativação, arquivamento ou exclusão? Quais regras de restauração, retenção e manutenção se aplicam a históricos, arquivos e registros de auditoria? | RF-005, RF-008 a RF-011, RF-014 |
| P-009 | Quais indicadores, filtros e períodos compõem o dashboard e como cada valor é calculado a partir dos registros? | RF-013 |

Não foram definidas regras de contagem jurídica de prazos, feriados, suspensão,
prescrição ou obrigações de retenção. O cadastro de um prazo não deve ser
interpretado como validação jurídica de sua data. Qualquer automação desse tipo
exige definição específica; não há requisito confirmado de cálculo jurídico
automático nesta versão.

Metas operacionais de desempenho, disponibilidade e recuperação estão pendentes
nos [requisitos não funcionais](requirements.md). Hipóteses sobre necessidades e
benefícios do público-alvo estão na [visão](vision.md), e não constituem regras
confirmadas de negócio.

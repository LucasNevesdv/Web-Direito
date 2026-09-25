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
| RN-012 | `Escritorio` representa o escritório e a raiz do tenant. Seu modelo inicial contém somente `id`, `nome`, `situacao`, `criadoEm` e `atualizadoEm`; vínculos com outros dados de negócio serão implementados nas etapas correspondentes. |
| RN-013 | O nome do escritório é obrigatório. Remover espaços no início e no fim antes de validar; rejeitar nome vazio ou com menos de 2 ou mais de 120 caracteres. A contagem usa pontos de código Unicode. Não há regra confirmada de unicidade do nome. |
| RN-014 | O identificador do escritório deve ser UUID válido, gerado pela aplicação quando ausente. A criação define `createdAt` e `updatedAt`; a recuperação da persistência preserva o identificador e as datas armazenadas. |
| RN-015 | Todo novo escritório começa como `ATIVO`. O estado `INATIVO` é reconhecido pelo domínio e pela persistência; a transição de estado e seus efeitos permanecem pendentes, sem caso de uso de inativação nesta tarefa. |
| RN-016 | O cadastro público cria escritório, primeiro usuário e vínculo em uma única operação atômica. Se qualquer gravação falhar, nenhum dos três registros deve permanecer. A criação interna da TASK-003 é preservada, mas não possui endpoint público separado. |
| RN-017 | O nome do responsável é obrigatório, recebe trim e contém entre 2 e 120 pontos de código Unicode. O usuário recebe UUID, datas de criação e atualização e estado inicial `ATIVO`. `INATIVO` é reconhecido para negar autenticação; ainda não existe fluxo de administração desse estado. |
| RN-018 | O e-mail é obrigatório, tem formato validado, recebe trim e lowercase e é único globalmente. A restrição do PostgreSQL garante a unicidade também em cadastros concorrentes; o conflito produz erro previsível. |
| RN-019 | A senha tem entre 12 e 128 caracteres, sem trim; a confirmação deve coincidir e pertence somente ao frontend. Somente o hash Argon2id é persistido. Senha e hash não podem aparecer em respostas, logs ou auditoria, e a senha não pode ser persistida no navegador. |
| RN-020 | O primeiro vínculo sempre recebe `PROPRIETARIO`, papel de autoridade administrativa máxima. Somente esse papel é implementado; papéis adicionais e sua matriz de permissões permanecem pendentes. A entrega do cadastro não implementa autorização das operações futuras. |
| RN-021 | O vínculo identifica escritório e usuário existentes e é único para o par `officeId` + `userId`. A persistência restringe exclusão e alteração dos identificadores referenciados; não há exclusão em cascata nesse relacionamento. |
| RN-022 | O cadastro público aceita somente nome do escritório, nome do responsável, e-mail e senha. IDs, papel, estado e datas são definidos pelo servidor, e campos extras são rejeitados. |
| RN-023 | A resposta de sucesso contém os dados públicos do escritório, somente ID, nome e e-mail do usuário e o papel `PROPRIETARIO`. O cadastro não emite tokens, não inicia sessão nem confirma a titularidade do e-mail. |
| RN-024 | Login normaliza e-mail com trim/lowercase e verifica a senha sem trim. E-mail inexistente e senha incorreta recebem a mesma resposta genérica; a ausência do usuário também executa verificação Argon2id com hash de referência. |
| RN-025 | Login exige usuário ATIVO e vínculo com escritório ATIVO. Zero escritórios ativos impede acesso; mais de um gera conflito explícito, sem escolha arbitrária. Seleção e troca de escritório permanecem pendentes. |
| RN-026 | Cada login válido cria Sessao vinculada a usuário, escritório e VinculoEscritorio existentes. O banco guarda somente SHA-256 do refresh token aleatório de 256 bits; nunca o token original. |
| RN-027 | Access token JWT tem validade padrão e máxima de 15 minutos, algoritmo fixo HS256 e validação de assinatura, emissor, audiência e expiração. Contém somente identificadores de usuário/sessão/escritório, papel e claims temporais/de validação. |
| RN-028 | Refresh token tem validade padrão e máxima de 7 dias e é enviado somente por cookie HttpOnly, SameSite=Lax, Path=/api/v1/auth, sem Domain; Secure em produção. O cookie não autentica `/me` sozinho. |
| RN-029 | `/me` exige Bearer válido e sessão existente, não revogada e não expirada; reconfirma usuário ATIVO, escritório ATIVO, vínculo e papel. Retorna somente identidade pública, sem tokens ou hashes. |
| RN-030 | O navegador mantém access token somente em memória, sem localStorage/sessionStorage/IndexedDB. Abas da mesma origem compartilham identidade/token em memória e coordenam a renovação quando as APIs nativas estão disponíveis. Recarregar restaura por outra aba ou refresh e só então mostra conteúdo protegido; falha definitiva e logout limpam as abas. Sem Web Locks, exige novo login em vez de refresh automático inseguro. |
| RN-031 | Login limita todas as tentativas antes da verificação da senha. Padrões em 15 minutos: 30 por IP em desenvolvimento/teste, 10 em produção e 5 por IP/e-mail normalizado. Cadastro: 10 por IP/15 minutos. Políticas configuráveis, contagem compartilhada no PostgreSQL, chaves HMAC sem dados legíveis; excesso retorna 429/Retry-After e falha do limitador bloqueia com 503. Proteção avançada permanece pendente. |
| RN-032 | Refresh combina UUID público da sessão e segredo aleatório de 256 bits, sem dados pessoais. O banco guarda somente SHA-256 do token completo, comparado em tempo constante. Formatos antigos exigem novo login. |
| RN-033 | Cada renovação válida consome o hash atual atomicamente, grava outro hash e atualiza lastUsedAt/updatedAt. A expiração absoluta de sete dias do login nunca se estende. Sessão expirada/revogada, usuário/escritório inativo ou vínculo inválido impede renovar. |
| RN-034 | Token identificável com hash divergente, inclusive disputa de consumo, revoga a sessão inteira e limpa o cookie com erro genérico. Frontend compartilha uma Promise de renovação por instância para evitar duplicações normais. |
| RN-035 | Logout revoga a sessão quando identificável, limpa cookie e memória e retorna 204 também para sessão ausente, inválida, expirada ou já revogada. Não há blacklist de JWT; validade residual máxima de 15 minutos, mas `/me` rejeita imediatamente a sessão revogada no banco. Falha de infraestrutura não pode ser apresentada como revogação confirmada. |
| RN-036 | POSTs de autenticação exigem Origin exato configurado; origem ausente/null é recusada. Cookie SameSite=Lax complementa CSRF; API permanece sob proxy de mesma origem, sem CORS. Refresh limita, por padrão, 30 tentativas por IP/minuto, com contagem compartilhada no PostgreSQL. |

## Decisões pendentes

Os IDs abaixo registram perguntas em aberto, não regras aprovadas. Devem ser
resolvidos com o responsável pelo produto antes da conclusão da etapa afetada.

| ID | Decisão pendente | Requisitos afetados |
| --- | --- | --- |
| P-001 | Como serão manutenção e inativação de escritórios, convites e gerenciamento de membros, incluindo entrada e saída? Como será o uso de uma identidade em múltiplos escritórios? O cadastro conjunto e o primeiro vínculo PROPRIETARIO estão confirmados em RN-016 a RN-023; essas operações posteriores permanecem fora do escopo concluído de RF-001 e RF-002. | Evolução de escritórios e usuários; RF-004 |
| P-002 | Quais papéis existirão além de PROPRIETARIO e qual será a matriz de permissões? Quem pode ver ou alterar cada tipo de recurso, documento, anotação e auditoria? Haverá restrições adicionais por recurso dentro do mesmo escritório? | RF-004, RF-012, RF-013, RF-016 |
| P-003 | Como implementar verificação de e-mail, recuperação de senha e dois fatores? Login, rotação, reutilização, logout, `/me`, coordenação entre abas compatíveis e limites compartilhados estão entregues. O cadastro não autentica automaticamente. | Evolução de autenticação e segurança após RF-004/RF-005/RF-006 |
| P-004 | Quais campos de cliente são obrigatórios e como detectar duplicidades? Clientes inativos poderão receber novos vínculos ou ser reativados? | RF-007 |
| P-005 | Quais campos e estados definem casos e processos? Quais são as relações permitidas entre clientes, casos e processos e seus critérios de encerramento? | RF-008, RF-009 |
| P-006 | Quais estados, responsáveis e regras de conclusão se aplicam a tarefas? Como registrar data, horário e fuso de prazos e agenda? Serão necessários recorrência, lembretes ou justificativa de alteração? | RF-010, RF-011, RF-014 |
| P-007 | Onde serão armazenados documentos? Quais tipos, tamanhos, versões e regras de substituição serão aceitos? Como editar e organizar anotações? | RF-012, RF-013 |
| P-008 | Quais operações exigem auditoria e justificativa? Quando usar inativação, arquivamento ou exclusão? Quais regras de restauração, retenção e manutenção se aplicam a históricos, arquivos e registros de auditoria? | RF-007, RF-010 a RF-013, RF-016 |
| P-009 | Quais indicadores, filtros e períodos compõem o dashboard e como cada valor é calculado a partir dos registros? | RF-015 |
| P-010 | Quais mecanismos adicionais de proteção avançada contra abuso serão aplicados ao cadastro público? Rate limit compartilhado por IP foi entregue; validação, hash, limite de corpo e esse controle inicial não representam proteção completa contra abuso distribuído. | RF-001; RNF-002 |

Não foram definidas regras de contagem jurídica de prazos, feriados, suspensão,
prescrição ou obrigações de retenção. O cadastro de um prazo não deve ser
interpretado como validação jurídica de sua data. Qualquer automação desse tipo
exige definição específica; não há requisito confirmado de cálculo jurídico
automático nesta versão.

Metas operacionais de desempenho, disponibilidade e recuperação estão pendentes
nos [requisitos não funcionais](requirements.md). Hipóteses sobre necessidades e
benefícios do público-alvo estão na [visão](vision.md), e não constituem regras
confirmadas de negócio.

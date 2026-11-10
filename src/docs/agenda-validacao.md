# Registro de validação da Agenda

Data: 09/11/2026. Branch de trabalho: `feature/matheus-agenda-dashboard`. Base de implementação: `46b2e3708c612cbc759f5b3ff30631867d91d5a0`. Alterações ainda locais, sem commit ou push desta implementação.

## Verificações executadas

Este é o registro da implementação inicial. A revisão posterior de permissões dos vínculos e da busca compartilhada, com nova regressão completa, está em [revisao-integrada.md](revisao-integrada.md).

| Verificação | Resultado |
| --- | --- |
| ESLint do backend e frontend | Aprovado, após alterações finais de código. |
| TypeScript do backend e frontend | Aprovado, após alterações finais de código. |
| Build do backend e frontend | Aprovado, após alterações finais de código. |
| Suíte completa do backend | 39 arquivos, 656 testes aprovados. |
| Suíte completa do frontend, incluindo Agenda | 15 arquivos, 146 testes aprovados. |
| Regressão focada após ajustes finais na interface e integração administrativa | 17 testes do frontend (Agenda, Administração, Tarefas e Documentos) e 11 do backend (Administração e fronteiras entre escritórios) aprovados. |
| Integração da Agenda com PostgreSQL real | Aprovada em banco temporário criado e removido pelo runner. |
| Migrações em banco vazio | Todas as 14 migrations aplicadas com sucesso pelo runner. |
| Atualização do banco local de desenvolvimento | A nova migration foi aplicada sobre as 13 existentes em `webdireito_dev`, sem reset. |
| Revisão de espaços/formato com `git diff --check` | Sem erros. |

A primeira execução da suíte completa detectou a necessidade de classificar o novo adaptador no inventário de isolamento do projeto; a classificação foi incluída, com referência ao teste comportamental real. Essa execução também encontrou incompatibilidade do `localStorage` experimental do Node 26 com o Vitest/jsdom e falha de teste SMTP sem acesso à conexão local. A suíte passou após usar `--no-experimental-webstorage`, limitar trabalhadores e permitir as conexões locais dos testes, sem modificar o código de autenticação nem relaxar as asserções existentes.

Ambiente: Windows, Node 26.13.0, pnpm 9.15.4, Prisma 6.19.3 e PostgreSQL 18.6. Os comandos e a opção de compatibilidade estão em [agenda.md](agenda.md).

## Integração exercitada

- Cadastro, leitura após persistência, alteração e encerramento.
- Os quatro tipos de compromisso e vínculos reais com cliente/caso/processo.
- Rejeição de vínculo e participante de outro escritório, participante inativo e leitura de histórico alheio.
- Edição por participante, recusa de edição por não participante e cancelamento restrito.
- Sobreposição recusada sem consentimento; confirmação aceita; horários adjacentes permitidos.
- Duas reservas simultâneas: apenas uma aceita sem confirmação; duas edições da mesma versão: apenas uma aceita.
- Histórico e auditoria na mesma transação; histórico não alterável.
- Falha intencional no histórico: rollback também de compromisso, participantes e lembretes.
- Lembretes persistentes, repetição de consulta sem duplicação, leitura por destinatário, substituição na remarcação e remoção no encerramento.
- Filtros, evento atravessando o mês e datas civis de tarefas na visão unificada.
- Exportação com compromissos somente do escritório autorizado.
- API sem Bearer, origem inválida, corpo com campo extra, horário inválido, link executável e sessão de vínculo desativado.
- Interface: três visões, filtros, abertura por URL, confirmação explícita de conflito e preservação do formulário em falha de gravação.
- Conversão de fuso, horário inexistente na mudança de horário de verão e limites de dia/mês.

## Ainda não comprovado por este registro

Não foi realizada uma sessão manual de ponta a ponta no navegador com o responsável, nem validação com usuários do público-alvo. Inspeção visual em dispositivos reais, navegação completa por teclado e aceite das regras de permissão pelo grupo continuam no roteiro manual de `agenda.md`. Nenhuma dessas atividades está sendo declarada aprovada pelos testes automatizados.

Este registro histórico cobre a etapa da Agenda. A implementação posterior do Dashboard RF-089–097, incluindo a integração de navegação e a regressão conjunta, está registrada em [dashboard-validacao.md](dashboard-validacao.md). Os números acima correspondem à verificação da Agenda naquele momento. Nenhum dos registros comprova integrações externas ou entrega de e-mails de lembretes da Agenda.

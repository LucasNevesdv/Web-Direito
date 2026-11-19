# Entrega 5 — Resumo dos dados guardados pelo sistema

Resumo técnico para o bloco 2 (inventário de dados e documentos de privacidade). Descreve o que o MVP grava
hoje, conforme `src/backend/prisma/schema.prisma`. Não é uma política de privacidade; é a base para escrevê-la.

## Princípios já implementados

- **Isolamento por escritório:** todo dado de negócio pertence a um escritório e só é lido ou alterado por
  membros ativos desse escritório. O mesmo CPF pode existir em escritórios diferentes sem que um veja o outro.
- **Senhas:** guardadas somente como hash Argon2id. A senha nunca é gravada nem devolvida pela API.
- **Sessões:** o token de acesso fica só na memória do navegador; o token de renovação fica em cookie
  `HttpOnly` e, no banco, apenas o seu hash. O IP é guardado mascarado.
- **Arquivos:** ficam em armazenamento compatível com S3. O PostgreSQL guarda apenas nome, tamanho, tipo,
  hash SHA-256, autor e a referência ao arquivo.
- **Histórico imutável:** históricos de tarefas e prazos, eventos e versões de documentos e a trilha de
  auditoria não podem ser alterados nem apagados pela aplicação (garantido por triggers no PostgreSQL).
- **Inativação em vez de exclusão:** clientes, documentos e vínculos de equipe são inativados, sem apagar o
  histórico.

## Dados por grupo

| Grupo | O que guarda | Dados pessoais ou sensíveis | Finalidade |
| :--- | :--- | :--- | :--- |
| Escritório | Nome, situação e datas | Não | Identificar o escritório (raiz dos dados) |
| Usuários da equipe | Nome, e-mail, hash da senha, situação, papel e permissões | Nome e e-mail | Acesso ao sistema e controle de permissões |
| Sessões | Navegador, dispositivo, IP mascarado, última atividade, hash do token de renovação | IP mascarado | Segurança e encerramento de sessões |
| Recuperação de senha | Hash do token, validade e fila de e-mails | E-mail (via usuário) | Redefinir senha |
| Clientes | Tipo (pessoa física ou jurídica), nome, nome social ou razão social, CPF ou CNPJ, e-mail, telefone, endereço completo, observações internas, advogado responsável | **Sim:** CPF, contatos, endereço e observações internas | Cadastro e atendimento do cliente |
| Contatos do cliente | Nome, cargo ou relação, e-mail, telefone e observações | Sim | Falar com pessoas ligadas ao cliente |
| Casos | Título, descrição, natureza, área jurídica, prioridade, situação, responsável, equipe, valores da causa e envolvidos | Pode conter, na descrição | Organizar o trabalho jurídico |
| Partes do caso | Papel, nome, CPF/CNPJ, OAB, contato e observações | **Sim:** documentos e contatos de terceiros | Registrar partes contrárias e envolvidos |
| Processos e movimentações | Número CNJ, tribunal, comarca, vara, instância, fase e movimentações manuais | Dados públicos do processo | Acompanhar o processo |
| Tarefas | Título, descrição, situação, prioridade, responsável, revisor, prazo interno, vínculo, conclusão e checklist | Pode conter, no texto | Distribuir e acompanhar o trabalho |
| Prazos judiciais | Descrição, data limite, origem, responsável, confirmação do advogado, vínculo e cumprimento | Não, salvo no texto | Controlar prazos |
| Lembretes | Destinatário, tipo, título, data e situação do envio por e-mail | E-mail (via usuário) | Avisar prazos internos e críticos |
| Agenda | Título, descrição, tipo, início, fim, local ou link remoto, participantes, lembretes e vínculo | Local e participantes | Compromissos e audiências |
| Documentos | Nome, descrição, categoria, confidencialidade, vínculo, versões e eventos de visualização, download e alteração | **Sim:** o conteúdo dos arquivos (procurações, documentos pessoais) | Guardar e controlar documentos |
| Auditoria | Autor, ação, entidade, valor anterior e novo, metadados e data; inclui logins e falhas de login | Identificação de quem agiu | Rastrear operações relevantes |

## Pontos de atenção para o bloco 2

1. **Dados de terceiros:** o escritório cadastra dados de clientes e de partes contrárias. Pela LGPD, o
   escritório é o controlador desses dados e o Web-Direito atua como operador.
2. **Dados sensíveis em texto livre:** descrições, observações e documentos podem conter dados de saúde ou
   outros dados sensíveis (por exemplo, laudos anexados). O sistema não classifica esse conteúdo.
3. **Exclusão definitiva:** ainda não existe. Históricos e auditoria são imutáveis, então um pedido de exclusão
   exigirá uma política de retenção e um procedimento administrativo (pendência P-008 em
   [business-rules.md](../../src/docs/business-rules.md)).
4. **Exportação:** a administração já exporta os dados do escritório, o que ajuda no direito de portabilidade.
5. **E-mails enviados:** lembretes e recuperação de senha passam pelo provedor de e-mail configurado (SMTP ou
   Resend). Os lembretes incluem o título da tarefa ou do prazo.

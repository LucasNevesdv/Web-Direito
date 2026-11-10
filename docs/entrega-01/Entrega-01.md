# UNIVERSIDADE FEDERAL DE LAVRAS
## DEPARTAMENTO DE CIÊNCIA DA COMPUTAÇÃO
### EMPREENDEDORISMO EM SISTEMAS DE INFORMAÇÃO (2026/2)

**Orientador:** Prof. Johnatan Oliveira  
**Data Limite:** 29 de setembro de 2026  
**Local:** Lavras - MG  

---

# WEB-DIREITO
## ENTREGA 1: DESCOBERTA DO PROBLEMA E DA OPORTUNIDADE

**Integrantes da Equipe:**
- Augusto Fernandes Carvalho
- Alexandre Bortone
- Lucas Marcelino Neves
- Matheus Pimenta
- Diovani Da Cruz Mangia

**Repositório Oficial:** [https://github.com/LucasNevesdv/Web-Direito](https://github.com/LucasNevesdv/Web-Direito)

---

## 1. IDENTIFICAÇÃO DO GRUPO E DO EMPREENDIMENTO

- **Nome Provisório do Empreendimento:** Web-Direito (Gestão Jurídica Integrada).
- **Equipe:** Composta oficialmente por cinco integrantes regularmente matriculados no curso de Sistemas de Informação da Universidade Federal de Lavras (UFLA).
- **Proposta Central:** Investigação e concepção de uma solução de software no modelo Software as a Service (SaaS) voltada para a organização de fluxos operacionais, tarefas, documentos e prazos em pequenos escritórios de advocacia no Brasil.
- **Repositório do Projeto:** [https://github.com/LucasNevesdv/Web-Direito](https://github.com/LucasNevesdv/Web-Direito), organizado conforme a estrutura recomendada pela disciplina.

---

## 2. TRÊS PROBLEMAS INICIALMENTE CONSIDERADOS

Durante a fase de brainstorming e imersão inicial, o grupo avaliou três problemas reais que afetam profissionais autônomos e prestadores de serviços jurídicos:

| Problema Candidato | Breve Descrição | Público Relacionado | Motivo da Relevância Percebida |
| :--- | :--- | :--- | :--- |
| **1. Dispersão de dados de clientes e casos em ferramentas desconectadas** | Informações de clientes, notas de atendimento e números de processos ficam espalhados entre conversas de WhatsApp, e-mails, anotações de caderno e pastas locais no computador. | Advogados autônomos e assistentes administrativos de pequenos escritórios. | Causa perda de tempo nas consultas diárias, risco de perda de contatos estratégicos e dificuldade de passar informações precisas ao cliente final quando este solicita uma posição sobre seu caso. |
| **2. Dificuldade de acompanhamento compartilhado de tarefas, responsáveis e prazos** | Falta de visão clara e centralizada sobre quais petições precisam ser elaboradas, quem é o responsável pela redação, quem deve revisar e qual é o prazo fatal para cumprimento perante o Poder Judiciário. | Advogados sócios, advogados associados e estagiários de direito que dividem demandas. | Prazos processuais são peremptórios e fatais no Direito brasileiro: a perda de um prazo acarreta preclusão, prejuízo irreparável ao cliente e responsabilidade civil e disciplinar perante a OAB para o profissional. |
| **3. Desorganização e descontrole de versões em documentos jurídicos** | Minutas de peças processuais, contratos e procurações circulam sem controle de versão, gerando retrabalho na consolidação de correções e risco de protocolo de versões desatualizadas nos tribunais. | Equipes jurídicas que compartilham a redação de peças e contratos. | Gera desgaste interno na equipe, perda de arquivos e risco de erros formais graves na instrução de processos judiciais. |

---

## 3. PROBLEMA ESCOLHIDO E SUA DELIMITAÇÃO

Após análise comparativa de viabilidade e impacto durante o período da disciplina, o grupo selecionou como foco central de investigação o **Problema 2**, considerando a dispersão de dados e documentos como fatores agravantes desse fluxo.

### 3.1. Definição Objetiva do Problema
> **Como pequenos escritórios de advocacia podem acompanhar tarefas, responsáveis e prazos quando as informações do trabalho estão distribuídas entre diferentes ferramentas e registros?**

### 3.2. Contexto em que Ocorre
O problema manifesta-se cotidianamente no fluxo de trabalho de escritórios enxutos (compostos por 2 a 8 colaboradores), nos quais os integrantes dividem a condução de dezenas ou centenas de demandas ativas. A rotina é dinâmica e pautada pela publicação diária de intimações no Diário da Justiça Eletrônico (DJe) e nos sistemas de processo eletrônico dos tribunais (PJe, e-SAJ, Projudi).

### 3.3. Frequência e Recorrência Esperada
A ocorrência é diária e contínua. A cada novo dia útil, novas publicações geram prazos peremptórios (ex.: 5 dias para embargos, 15 dias para contestações e recursos), demandando distribuição rápida entre os colaboradores, acompanhamento de etapas de minuta e conferência final antes do protocolo.

### 3.4. Consequências Identificadas
- **Perda de Prazos Fatais:** Risco máximo de preclusão de direitos materiais ou processuais de clientes.
- **Retrabalho e Duplicidade:** Dúvidas recorrentes sobre se determinada petição já foi elaborada ou se alguém já assumiu a demanda.
- **Sobrecarga de Gestão:** Necessidade de reuniões diárias ou dezenas de mensagens em grupos de WhatsApp apenas para conferir pendências.
- **Falta de Clareza na Revisão:** Dificuldade em distinguir quando uma peça foi apenas rascunhada por um estagiário ou associado e quando ela foi devidamente revisada pelo sócio responsável antes do protocolo.

### 3.5. Pessoas e Organizações Afetadas
Escritórios de advocacia em fase inicial ou de pequeno porte, sociedades unipessoais de advocacia que começam a contratar estagiários ou associados, e os próprios clientes desses escritórios, cuja segurança jurídica depende da eficiência do atendimento.

---

## 4. PÚBLICO-ALVO PRELIMINAR

O público-alvo inicial foi delimitado geograficamente e estruturalmente para garantir acesso viável a entrevistas durante o semestre letivo:

### 4.1. Segmento Prioritário
Pequenos escritórios de advocacia no Brasil que possuem entre **2 e 8 pessoas** atuando de forma compartilhada na elaboração e condução de casos.

### 4.2. Características Relevantes
- Estrutura física enxuta ou atuação híbrida/remota.
- Baixo orçamento disponível para investimentos em tecnologia da informação.
- Ausência de equipe de TI própria, exigindo soluções de implantação simples, que rodem diretamente no navegador web sem requerer servidores dedicados ou consultorias de parametrização.

### 4.3. Distinção entre Usuários e Clientes (Pagadores)
- **Usuários Finais da Solução:**
  - *Advogados Associados e Sócios:* que distribuem tarefas, redigem peças complexas, revisam trabalhos e monitoram datas fatais.
  - *Estagiários de Direito:* que elaboram minutas iniciais, cumprem diligências e acompanham checklists de rotina.
  - *Assistentes e Secretárias:* responsáveis pelo primeiro atendimento ao cliente, cadastro básico e controle de arquivos.
- **Cliente ou Pagador:**
  - *Sócio Proprietário ou Administrador do Escritório:* profissional que possui poder decisório de contratação e orçamento para assinar ferramentas de apoio à gestão.

---

## 5. EVIDÊNCIAS SECUNDÁRIAS E PESQUISA DE MERCADO

Para verificar se o problema possui respaldo mercadológico e não se trata apenas de uma suposição interna do grupo, realizou-se um levantamento preliminar em fontes públicas e relatórios do setor jurídico brasileiro:

1. **Estudo "Perfil ADV" (Conselho Federal da OAB, 2024):**
   - Revela que a expressiva maioria dos advogados registrados no Brasil atua de forma autônoma ou em pequenos núcleos societários (aproximadamente 72% dos profissionais entrevistados).
   - Fonte: [OAB — Perfil ADV: maioria dos advogados brasileiros são autônomos](https://www.oab.org.br/noticia/62213/perfil-adv-maioria-dos-advogados-brasileiros-sao-autonomos).
2. **Relatório "Justiça em Números" (Conselho Nacional de Justiça - CNJ, 2024):**
   - Aponta a tramitação de mais de 80 milhões de processos ativos no judiciário brasileiro, exigindo dos operadores do direito um volume incessante de acompanhamentos e cumprimento de prazos em dias úteis regulados pelo Código de Processo Civil (CPC).
   - Fonte: Portal do Conselho Nacional de Justiça (CNJ).
3. **Tendência de Sobrecarga em Ferramentas Informais:**
   - Artigos de periódicos sobre gestão jurídica indicam que a dependência excessiva de planilhas Excel e conversas de WhatsApp é o principal fator de falha de comunicação e estresse operacional em equipes forenses iniciantes.

---

## 6. ANÁLISE DE SOLUÇÕES ATUAIS E ALTERNATIVAS DO MERCADO

O grupo investigou as alternativas atualmente utilizadas pelos profissionais para lidar com a organização de demandas:

### 6.1. Softwares Jurídicos Existentes (Concorrentes Diretos)
- **Projuris ADV e Astrea:** Softwares consolidados no mercado brasileiro. Oferecem módulos completos de processos e financeiro, porém possuem planos com preços elevados para quem está iniciando e demandam curvas longas de aprendizado e configuração burocrática.
- **ADVBOX e EasyJur:** Focados em produtividade e automação de tribunais, porém estruturados para bancas maiores, muitas vezes apresentando complexidade excessiva para escritórios de 2 a 4 pessoas.

### 6.2. Métodos Manuais e Ferramentas Genéricas (Concorrentes Indiretos)
- **Planilhas Eletrônicas (Excel / Google Sheets):** Muito utilizadas por não gerarem custo direto adicional. No entanto, não possuem controle de permissões por papel, não alertam sobre proximidade fatal de prazos de forma inteligente e tornam-se caóticas quando editadas simultaneamente por vários colaboradores.
- **Aplicativos de Gestão Genéricos (Trello / Notion / Asana):** Atendem bem à divisão visual de cartões, mas não possuem conceitos forenses essenciais (como número CNJ, diferenciação de prazo judicial de publicação versus prazo interno, ou trava formal de revisão de petições).
- **Agendas Físicas e Grupos de WhatsApp:** Geram perda de histórico, misturam assuntos pessoais com profissionais e aumentam o risco de esquecimento de tarefas importantes.

---

## 7. HIPÓTESES INICIAIS FORMULADAS

Com base no problema delimitado e na análise preliminar de mercado, o grupo definiu quatro hipóteses centrais a serem confrontadas com o público-alvo:

| Tipo de Hipótese | Hipótese Formulada | Como Será Avaliada na Prática |
| :--- | :--- | :--- |
| **Hipótese de Problema** | A dispersão de informações entre ferramentas diferentes dificulta o acompanhamento de tarefas e prazos em pequenos escritórios de advocacia. | Investigar nas entrevistas se os participantes relatam atrito, insegurança ou perda de tempo buscando dados em múltiplos lugares. |
| **Hipótese de Cliente** | Sócios e administradores de pequenos escritórios reconhecem essa dificuldade como relevante e têm interesse em uma solução dedicada. | Avaliar se o decisor financeiro do escritório percebe que as falhas operacionais atuais geram prejuízo real na rotina. |
| **Hipótese de Necessidade** | Equipes que compartilham tarefas precisam de uma visualização compartilhada que distingua quem executa, quem revisa e qual é a data limite. | Questionar como o escritório garante que uma petição elaborada por estagiário/associado foi revisada antes do protocolo. |
| **Hipótese Preliminar de Valor** | Centralizar clientes, casos, tarefas com fluxo de revisão e prazos em um único software reduz o retrabalho e dá visibilidade clara da próxima ação da demanda. | Testar a reação dos profissionais perante a proposta de um fluxo simples e focado, sem excesso de configurações. |

---

## 8. PLANO DE VALIDAÇÃO PARA A ENTREGA 2

Para a realização da **Entrega 2 (Validação do Problema, Clientes e Mercado)**, prevista para 13/10/2026, a equipe definiu a seguinte estratégia de pesquisa empírica:

### 8.1. Participantes Pretendidos
- Meta: Realizar pelo menos **8 interações válidas**, contemplando no mínimo **5 entrevistas semiestruturadas aprofundadas**.
- Perfil dos entrevistados: Sócios proprietários, advogados associados em pequenas bancas, assistentes jurídicos e estagiários de Direito.

### 8.2. Forma de Recrutamento
Os profissionais serão contatados por meio da rede de relacionamento pessoal dos integrantes da equipe, visitas a escritórios de advocacia em Lavras/MG e proximidades, além de abordagens pelo LinkedIn e indicações profissionais.

### 8.3. Roteiro de Entrevista Semiestruturada (Guia Inicial)
As entrevistas focarão na experiência e nas dores reais do participante, sem apresentar ou "vender" qualquer software de imediato:
1. *Como vocês costumam organizar os processos, prazos e as atividades do dia a dia no escritório?*
2. *Quais ferramentas vocês utilizam atualmente (planilhas, softwares, agendas, mensagens)? O que funciona bem e o que gera dificuldade?*
3. *Como você sabe o que cada pessoa da equipe está fazendo e quem é o responsável por determinada petição?*
4. *Você se lembra de alguma situação recente em que a comunicação falhou ou quase se perdeu um prazo? Como isso foi resolvido?*
5. *Quando uma peça processual é redigida por um colaborador, como é feito o acompanhamento da revisão até o protocolo final?*
6. *Vocês já buscaram ou contrataram algum software de gestão jurídica? O que motivou a contratação ou por que decidiram não usar?*
7. *Quais fatores pesam mais na decisão de adotar uma ferramenta nova para o escritório?*

### 8.4. Distribuição Preliminar de Responsabilidades
- **Augusto Fernandes Carvalho e Diovani Da Cruz Mangia:** Elaboração do protocolo de pesquisa, agendamento de entrevistas e contato com profissionais da área cível e trabalhista.
- **Lucas Marcelino Neves e Alexandre Bortone:** Condução das entrevistas, gravação dos depoimentos e extração dos padrões e evidências qualitativas.
- **Matheus Pimenta:** Comparativo analítico dos concorrentes de mercado e consolidação do documento oficial da Entrega 2.

---

## 9. CHECKLIST DA ENTREGA 1 (SEÇÃO 25 DO EDITAL)

| Item Obrigatório de Verificação | Situação | Localização / Comprovação no Documento |
| :--- | :---: | :--- |
| **O grupo possui de 3 a 5 integrantes?** | **SIM** | Seção 1: 5 integrantes oficialmente registrados. |
| **O repositório foi criado?** | **SIM** | Seção 1: Link oficial no GitHub configurado. |
| **Três problemas foram inicialmente considerados?** | **SIM** | Seção 2: Tabela detalhando os 3 problemas candidatos. |
| **Um problema foi escolhido e delimitado?** | **SIM** | Seção 3: Problema das tarefas, prazos e responsáveis. |
| **O público preliminar foi definido?** | **SIM** | Seção 4: Pequenos escritórios (2 a 8 integrantes) e distinção usuário/pagador. |
| **Existem evidências secundárias?** | **SIM** | Seção 5: Dados da OAB (Perfil ADV), CNJ e pesquisas do setor. |
| **Foram analisadas soluções atuais?** | **SIM** | Seção 6: Concorrentes diretos (Projuris, Astrea) e indiretos (planilhas, Trello). |
| **As hipóteses foram explicitadas?** | **SIM** | Seção 7: Matriz com 4 hipóteses (Problema, Cliente, Necessidade, Valor). |
| **Existe plano de validação para a Entrega 2?** | **SIM** | Seção 8: Recrutamento, roteiro de 7 perguntas e divisão de papéis. |

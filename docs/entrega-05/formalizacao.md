# Dossiê de Formalização Empresarial Simulada — Web-Direito

> **Documento acadêmico simulado.** Elaborado para a disciplina Empreendedorismo em Sistemas de Informação (UFLA, 2026/2). Nenhuma empresa foi constituída. Nenhum ato foi registrado em órgão público. Os dados pessoais além dos nomes dos integrantes são fictícios.

**Responsável:** Diovani Da Cruz Mangia · **Itens do pacote final:** 12 · **Seções do relatório final:** 25, 26, 27 e 29

**Sócios fundadores simulados:** Alexandre Bortone, Augusto Fernandes Carvalho, Lucas Marcelino Neves, Matheus Pimenta e Diovani Da Cruz Mangia.

---

## 1. Formalização empresarial simulada (Seção 25)

O Web-Direito é uma plataforma SaaS de gestão de demandas para pequenos escritórios de advocacia. A hipótese de receita é uma assinatura mensal por escritório, definida na Entrega 3. Essa hipótese ainda não foi validada.

Este dossiê simula como os cinco integrantes da equipe formalizariam o empreendimento como pessoa jurídica. Para isso, ele define:

- o tipo societário;
- o quadro de sócios e o capital social;
- o objeto social e os CNAEs (detalhados em [cnaes.md](cnaes.md));
- o contrato social ([contrato-social.md](contrato-social.md));
- o acordo de fundadores ([acordo-fundadores.md](acordo-fundadores.md));
- o fluxo de abertura da empresa em Lavras/MG.

A formalização simulada busca quatro objetivos:

1. Separar o patrimônio dos fundadores do patrimônio do negócio.
2. Permitir a emissão de notas fiscais e a contratação por escritórios.
3. Atribuir à sociedade a titularidade do software.
4. Criar regras claras de entrada e saída de sócios antes de qualquer receita.

---

## 2. Estrutura empresarial escolhida e justificativa (Seção 26)

### 2.1 Critérios de escolha

Os tipos jurídicos foram comparados pelos critérios que mais pesam para este empreendimento:

1. **Número de sócios:** a equipe tem cinco fundadores, e todos precisam constar como sócios.
2. **Responsabilidade:** o patrimônio pessoal de estudantes de graduação deve ficar protegido.
3. **Custo e complexidade:** a operação inicial tem orçamento baixo.
4. **Adequação à atividade:** a atividade é desenvolvimento e licenciamento de software.
5. **Entrada de investidor:** é preciso poder receber investimento no futuro.
6. **Tributação:** o tipo escolhido precisa ser compatível com o Simples Nacional.

### 2.2 Comparação dos tipos jurídicos

| Critério | MEI | SLU (Sociedade Limitada Unipessoal) | LTDA pluripessoal | Sociedade Anônima (S/A) |
| --- | --- | --- | --- | --- |
| Base legal | LC 123/2006, art. 18-A | CC, art. 1.052, §1º (Lei 13.874/2019) | CC, arts. 1.052 a 1.087 | Lei 6.404/1976 |
| Número de sócios | Um titular, sem sócios | Um único sócio | Dois ou mais sócios | Dois ou mais acionistas |
| Responsabilidade | Patrimônio do empresário não é separado do negócio | Limitada ao capital | Limitada ao valor das quotas, com responsabilidade solidária pela integralização do capital | Limitada ao preço de emissão das ações |
| Capital mínimo | Não há | Não há | Não há | Não há em regra; exige 10% em dinheiro na subscrição |
| Custo e complexidade | Muito baixos | Baixos | Baixos a moderados | Altos (assembleias, livros, publicações, demonstrações) |
| Atividade de software | **Não permitida.** A lista de ocupações do MEI não inclui desenvolvimento de software. | Permitida | Permitida | Permitida |
| Limite de faturamento | R$ 81.000,00 por ano | Sem limite próprio | Sem limite próprio | Sem limite próprio |
| Simples Nacional | Regime próprio (SIMEI) | Pode optar | Pode optar | **Não pode optar** (LC 123/2006, art. 3º, §4º, X) |
| Entrada de investidor | Inviável | Exige transformar em sociedade pluripessoal | Por cessão de quotas, aumento de capital ou investidor-anjo (LC 123/2006, art. 61-A) | Por emissão de ações; mecanismos mais flexíveis |
| Adequação aos 5 fundadores | ❌ | ❌ | ✅ | ✅, mas com custo desproporcional |

### 2.3 Tipos descartados

- **MEI:** não admite sócios. Também não inclui o desenvolvimento de software entre as ocupações permitidas. O teto de R$ 81 mil por ano é incompatível com uma plataforma SaaS escalável.
- **SLU:** admite apenas um sócio. Com cinco fundadores, os outros quatro ficariam sem participação formal. Isso contraria a divisão igualitária decidida pela equipe.
- **Sociedade Anônima:** comporta vários sócios e investidores. Por outro lado, tem custos e obrigações formais desproporcionais para uma empresa sem receita. Além disso, a S/A não pode optar pelo Simples Nacional. A LC 182/2021 (Marco Legal das Startups) simplificou algumas obrigações da S/A de menor porte, mas não remove essa vedação.
- **Sociedade simples:** foi desconsiderada. A exploração de software como produto, com organização dos fatores de produção, caracteriza atividade empresária (CC, art. 966). O registro dessa atividade é feito na Junta Comercial, não no Cartório de Registro Civil de Pessoas Jurídicas.

### 2.4 Decisão: Sociedade Limitada pluripessoal (LTDA)

A estrutura escolhida é a **Sociedade Limitada pluripessoal**, com cinco sócios pessoas físicas. As razões são:

1. **Comporta os cinco fundadores:** a participação de cada um pode ser igualitária e formalizada em quotas.
2. **Protege o patrimônio pessoal:** a responsabilidade de cada sócio fica limitada ao valor de suas quotas, depois que o capital estiver integralizado.
3. **Tem baixo custo:**
   - não exige capital mínimo;
   - não exige publicações obrigatórias;
   - o contrato social é simples e segue os modelos da Junta Comercial.
4. **Permite optar pelo Simples Nacional:** a empresa se enquadra como microempresa enquanto a receita bruta anual for de até R$ 360 mil. Isso reduz a carga tributária e as obrigações acessórias na fase inicial.
5. **Admite investimento sem transformar a empresa:** o aporte de investidor-anjo (LC 123/2006, arts. 61-A a 61-D) não torna o investidor sócio e não tira a empresa do Simples. A empresa também pode se enquadrar como startup (LC 182/2021, art. 4º), sem perder a natureza de LTDA.
6. **Pode evoluir:** se uma rodada de investimento exigir, a LTDA pode ser transformada em S/A (CC, arts. 1.113 a 1.115).

O empreendimento não presta serviço jurídico; ele licencia software para escritórios. Por isso, a sociedade não precisa de registro na OAB e não se confunde com uma sociedade de advogados (Lei 8.906/1994, arts. 15 a 17). Essa restrição orienta a redação do objeto social.

### 2.5 Regime tributário considerado

O regime considerado é o **Simples Nacional**. O detalhamento tributário fica com Lucas Marcelino Neves, responsável pela pesquisa tributária e pelos cenários financeiros (Seção 34). Para esse trabalho, estes pontos são relevantes:

- A atividade principal candidata é a 6203-1/00, de licenciamento de software não customizável (ver [cnaes.md](cnaes.md)). No Simples, esse tipo de atividade fica sujeito ao **Fator R** (LC 123/2006, art. 18, §5º-J e §5º-M):
  - se a folha de salários, incluído o pró-labore, for igual ou maior que 28% da receita bruta, a tributação segue o **Anexo III**;
  - se for menor, segue o **Anexo V**, que tem alíquotas maiores.
- O pró-labore dos sócios, previsto no contrato social, influencia diretamente o Fator R.
- Por ser serviço, o imposto municipal (ISS) é devido ao Município de Lavras, e a empresa não precisa de inscrição estadual.

---

## 3. Quadro societário e capital social simulado (Seção 27)

### 3.1 Papéis dos sócios

Os papéis partem da divisão de módulos da Entrega 3, que distribuiu o desenvolvimento do MVP entre os cinco integrantes. Na sociedade simulada, cada sócio continua responsável pela área do produto que já conduz e assume também uma frente do negócio.

| Sócio | Área no produto (Entrega 3) | Função na sociedade (simulada) |
| --- | --- | --- |
| Lucas Marcelino Neves | Acesso, escritório, equipe, permissões, sessões e isolamento (RF-001 a RF-014) | Sócio administrador; gestão, finanças e tributação |
| Diovani Da Cruz Mangia | Clientes; casos e processos (RF-015 a RF-048) | Formalização, contratos e relação societária |
| Augusto Fernandes Carvalho | Tarefas e prazos; documentos (RF-049 a RF-077) | Produto e operação do fluxo de trabalho jurídico |
| Matheus Pimenta | Agenda e dashboard (RF-078 a RF-097) | Experiência do usuário e indicadores |
| Alexandre Bortone | Auditoria e histórico; administração e configurações (RF-098 a RF-117) | Segurança, conformidade e infraestrutura |

### 3.2 Divisão das quotas

A divisão é **igualitária: 20% para cada sócio**. Até aqui, os cinco integrantes contribuíram de forma equivalente: cada um assumiu um conjunto de módulos do MVP e participou da pesquisa, da documentação e da validação. Nenhum sócio aporta capital, tecnologia preexistente ou dedicação muito diferente da dos demais que justifique uma participação maior.

A divisão igualitária vale para o capital. A proteção contra a saída precoce de um fundador (vesting e cliff) fica no acordo de fundadores ([acordo-fundadores.md](acordo-fundadores.md)), e não no contrato social.

### 3.3 Capital social

O capital social simulado é de **R$ 5.000,00**, dividido em **5.000 quotas de R$ 1,00** cada.

O valor foi escolhido por três razões:

1. **É compatível com a renda de estudantes de graduação:** R$ 1.000,00 por sócio.
2. **Cobre os custos iniciais:**
   - taxas da Junta Comercial;
   - certificado digital;
   - contador nos primeiros meses;
   - infraestrutura mínima em nuvem.
3. **Não há exigência legal:** a LTDA não tem capital mínimo (CC, art. 1.055).

A integralização é em moeda corrente, em duas parcelas:

- **50% no ato da constituição:** R$ 500,00 por sócio, R$ 2.500,00 no total;
- **50% em até 12 meses** da assinatura do contrato social: os outros R$ 2.500,00.

Enquanto o capital não estiver totalmente integralizado, todos os sócios respondem solidariamente pelo valor que falta (CC, art. 1.052).

### 3.4 Administração

**Lucas Marcelino Neves** é o sócio administrador isolado. Ele tem poderes de gestão e representa a sociedade, ativa e passivamente, em juízo e fora dele (CC, arts. 1.060 e 1.064).

Alguns atos dependem de aprovação prévia dos sócios que representem a maioria do capital:

- alienação ou oneração de bens da sociedade;
- contratação de empréstimos ou dívidas acima do limite fixado no contrato social;
- prestação de garantias em favor de terceiros.

O limite exato e os quóruns ficam no contrato social ([contrato-social.md](contrato-social.md)).

### 3.5 Quadro societário

| Sócio | Quotas | Participação | Valor (R$) | Integralizado no ato (R$) | Função |
| --- | ---: | ---: | ---: | ---: | --- |
| Lucas Marcelino Neves | 1.000 | 20% | 1.000,00 | 500,00 | Sócio administrador; gestão, finanças e tributação |
| Diovani Da Cruz Mangia | 1.000 | 20% | 1.000,00 | 500,00 | Formalização, contratos e relação societária |
| Augusto Fernandes Carvalho | 1.000 | 20% | 1.000,00 | 500,00 | Produto e operação do fluxo de trabalho jurídico |
| Matheus Pimenta | 1.000 | 20% | 1.000,00 | 500,00 | Experiência do usuário e indicadores |
| Alexandre Bortone | 1.000 | 20% | 1.000,00 | 500,00 | Segurança, conformidade e infraestrutura |
| **Total** | **5.000** | **100%** | **5.000,00** | **2.500,00** | |

---

## 4. Fluxo pesquisado para abertura da empresa (Seção 29)

> **Valores simulados.** Os custos e prazos da Seção 4.3 são estimativas para fins acadêmicos, montadas a partir de fontes oficiais e de levantamentos de mercado consultados em 15/11/2026. Os valores vindos de sites comerciais estão indicados como tal e precisam ser confirmados nas tabelas oficiais (JUCEMG e Prefeitura de Lavras) antes de qualquer uso real. O enquadramento de risco das atividades em Lavras também precisa ser confirmado.

### 4.1 Visão geral

Desde a integração promovida pela REDESIM, a abertura de uma LTDA em Minas Gerais é feita em grande parte por um único fluxo digital: a viabilidade, o registro na JUCEMG e a inscrição no CNPJ estão interligados. Desde a Lei nº 14.195/2021, o CNPJ passa a ser o identificador único da empresa nesse fluxo.

### 4.2 Etapas

1. **Consulta prévia de viabilidade.** Pedida pelo portal da REDESIM. A Prefeitura de Lavras analisa se as atividades (CNAEs) podem ser exercidas no endereço informado, e a JUCEMG analisa se o nome empresarial está disponível.
2. **Documento Básico de Entrada (DBE).** Preenchido na Receita Federal, com os dados da empresa, dos sócios, dos CNAEs e do capital social. O protocolo do DBE acompanha o pedido de registro.
3. **Registro do contrato social na JUCEMG.** Envio do contrato social ([contrato-social.md](contrato-social.md)) assinado digitalmente pelos sócios, com os documentos de identificação e o pagamento das taxas. O registro dá à sociedade personalidade jurídica (CC, art. 985).
4. **Emissão do CNPJ.** Com o registro deferido, a Receita Federal libera o CNPJ no mesmo fluxo integrado.
5. **Inscrição municipal e alvará.**
   - A inscrição municipal na Prefeitura de Lavras é necessária porque a empresa presta serviço e recolhe ISS.
   - As atividades de software são candidatas a **baixo risco**. Nesse caso, a Lei nº 13.874/2019 (Liberdade Econômica), art. 3º, I, dispensa alvará e outros atos públicos de liberação. O enquadramento precisa ser confirmado na classificação de risco adotada pelo Município ou, na falta dela, na Resolução CGSIM nº 51/2019.
   - A **inscrição estadual não é necessária**, pois a empresa não vende mercadorias nem recolhe ICMS.
6. **Providências após a abertura.**
   - **Opção pelo Simples Nacional:** feita no Portal do Simples Nacional, dentro do prazo contado da inscrição no CNPJ e da última inscrição (municipal ou estadual) previsto na Resolução CGSN nº 140/2018. Fora do prazo, a opção só vale a partir do ano seguinte.
   - **Certificado digital e-CNPJ:** usado para assinar documentos e acessar os sistemas da Receita.
   - **Emissão de NFS-e:** habilitação no emissor nacional ou no sistema da Prefeitura de Lavras.
   - **Contador:** contratação para escrituração, folha do pró-labore e apuração mensal do Simples (DAS).

### 4.3 Tabela por etapa

| Etapa | Órgão | Documento principal | Custo estimado (simulado) | Prazo estimado (simulado) | Fonte (data de consulta) |
| --- | --- | --- | ---: | --- | --- |
| 1. Viabilidade | Prefeitura de Lavras e JUCEMG, via REDESIM | Pedido de viabilidade (nome e endereço) | R$ 0,00 | 2 a 5 dias úteis | REDESIM/gov.br (15/11/2026); valor e prazo simulados |
| 2. DBE | Receita Federal | DBE | R$ 0,00 | No mesmo dia | Receita Federal (15/11/2026) |
| 3. Registro | JUCEMG | Contrato social, documentos dos sócios, comprovante das taxas | R$ 282,00 | 2 a 5 dias úteis | Contabilizei, valor de LTDA porte ME em MG (15/11/2026); confirmar na Tabela de Preços da JUCEMG |
| 4. CNPJ | Receita Federal | Comprovante de inscrição no CNPJ | R$ 0,00 | Junto com o registro | Receita Federal (15/11/2026) |
| 5. Inscrição municipal e alvará | Prefeitura de Lavras | Inscrição municipal; alvará dispensado se a atividade for de baixo risco | R$ 0,00 a R$ 150,00 | 5 a 10 dias úteis | Simulado; tabela de taxas de Lavras não localizada (15/11/2026) |
| 6a. Simples Nacional | Receita Federal | Termo de opção | R$ 0,00 | Prazo da Res. CGSN 140/2018 | Portal do Simples Nacional (15/11/2026) |
| 6b. Certificado digital | Autoridade certificadora | e-CNPJ A1, validade de 1 ano | R$ 235,00 por ano | 1 dia útil | Omie e levantamentos de mercado: R$ 180 a R$ 280 (15/11/2026) |
| 6c. NFS-e | Prefeitura de Lavras / emissor nacional | Habilitação para emissão | R$ 0,00 | 1 a 3 dias úteis | Simulado; emissor nacional gratuito (15/11/2026) |
| 6d. Contador | Escritório de contabilidade | Contrato de prestação de serviços | R$ 300,00 por mês | — | Agilize e Meu Contador Online: R$ 120 a R$ 600 por mês para serviços no Simples (15/11/2026) |

**Total estimado para abrir e operar os 3 primeiros meses:** R$ 282,00 (JUCEMG) + até R$ 150,00 (Prefeitura) + R$ 235,00 (certificado) + R$ 900,00 (3 meses de contador) = **até R$ 1.567,00**.

**Prazo total estimado:** de 2 a 4 semanas entre a viabilidade e a primeira NFS-e, se não houver exigência dos órgãos.

O total cabe no capital integralizado no ato (R$ 2.500,00), conforme a justificativa do capital social na Seção 3.3. A diferença, de cerca de R$ 930,00, cobre a infraestrutura mínima em nuvem dos primeiros meses.

---

## Uso de inteligência artificial

Ferramentas de inteligência artificial foram usadas como apoio à pesquisa. Elas ajudaram a localizar as leis aplicáveis e a apresentar os tipos jurídicos existentes para a comparação da Seção 2. A análise, a escolha da estrutura e a redação final foram feitas pela equipe, e as referências legais foram conferidas nas fontes oficiais.

---

## Referências

- BRASIL. Lei nº 10.406, de 10 de janeiro de 2002. Código Civil.
- BRASIL. Lei Complementar nº 123, de 14 de dezembro de 2006. Estatuto Nacional da Microempresa e da Empresa de Pequeno Porte.
- BRASIL. Lei Complementar nº 182, de 1º de junho de 2021. Marco Legal das Startups.
- BRASIL. Lei nº 6.404, de 15 de dezembro de 1976. Lei das Sociedades por Ações.
- BRASIL. Lei nº 13.874, de 20 de setembro de 2019. Lei da Liberdade Econômica.
- BRASIL. Lei nº 8.906, de 4 de julho de 1994. Estatuto da Advocacia e da OAB.
- COMITÊ GESTOR DO SIMPLES NACIONAL. Resolução CGSN nº 140, de 22 de maio de 2018 (Anexo XI: ocupações permitidas ao MEI).
- BRASIL. Lei nº 14.195, de 26 de agosto de 2021. Facilitação para abertura de empresas.
- COMITÊ PARA GESTÃO DA REDESIM (CGSIM). Resolução CGSIM nº 51, de 11 de junho de 2019. Classificação de risco das atividades.
- REDESIM. Portal gov.br de abertura de empresas.
- JUNTA COMERCIAL DO ESTADO DE MINAS GERAIS (JUCEMG). Tabela de preços e orientações para registro de sociedade limitada.
- PREFEITURA MUNICIPAL DE LAVRAS. Inscrição municipal, alvará e NFS-e.
- JUCEMG. Tabela de Preços. Disponível em: https://jucemg.mg.gov.br/pagina/52. Acesso em: 15/11/2026.
- CONTABILIZEI. Quanto custa abrir empresa em Belo Horizonte. Disponível em: https://www.contabilizei.com.br/contabilidade-online/quanto-custa-abrir-empresa-em-belo-horizonte/. Acesso em: 15/11/2026.
- OMIE. Qual é o valor do certificado digital A1 e A3 em 2026. Disponível em: https://www.omie.com.br/blog/qual-e-o-valor-do-certificado-digital-a1-e-a3-em-2026/. Acesso em: 15/11/2026.
- AGILIZE. Quanto custa contador para pequena empresa em 2026. Disponível em: https://agilize.com.br/artigos/custo-contador-mensal-simples-nacional. Acesso em: 15/11/2026.
- MEU CONTADOR ONLINE. Quanto custa um contador para pequenas empresas em 2026. Disponível em: https://www.meucontadoronline.com.br/blog/quanto-custa-contador-pequenas-empresas/. Acesso em: 15/11/2026.
- NFE.IO. Lavras/MG: prefeitura integrada. Disponível em: https://nfe.io/docs/prefeituras-integradas/minas-gerais/lavras-mg-3138203/. Acesso em: 15/11/2026.

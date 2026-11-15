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

*Em elaboração (Bloco 2 do plano).*

---

## 4. Fluxo pesquisado para abertura da empresa (Seção 29)

*Em elaboração (Bloco 6 do plano).*

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

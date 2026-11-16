# Pesquisa de CNAEs e Objeto Social — Web-Direito

> **Documento acadêmico simulado.** Elaborado para a disciplina Empreendedorismo em Sistemas de Informação (UFLA, 2026/2). Nenhuma empresa foi constituída e nenhum código foi registrado.

**Responsável:** Diovani Da Cruz Mangia · **Item do pacote final:** 15 · **Seção do relatório final:** 28

**Referência de classificação:** CNAE 2.3, subclasses, mantida pela CONCLA/IBGE.

> **Conferência:** os códigos e as descrições foram conferidos em 15/11/2026 na base oficial da CNAE 2.3 do IBGE/CONCLA, pelo serviço de dados do IBGE (servicodados.ibge.gov.br). O enquadramento no Simples Nacional do CNAE principal e do 8599-6/03 foi conferido no texto compilado da LC 123/2006 (Planalto), na mesma data. O anexo dos CNAEs 6311-9/00, 6204-0/00 e 6209-1/00 ainda precisa ser confirmado no Anexo VI da Resolução CGSN nº 140/2018 e fica com o responsável pela pesquisa tributária.

---

## 1. Como os CNAEs foram escolhidos

O Web-Direito é um SaaS: os escritórios de advocacia acessam pela internet um software padronizado, sem desenvolvimento sob encomenda, mediante assinatura mensal. Os códigos foram escolhidos por três critérios:

1. **Descrever a receita principal:** o licenciamento de uso do software padronizado.
2. **Cobrir as atividades de apoio:** hospedagem da aplicação, implantação, suporte e treinamento.
3. **Não incluir atividade jurídica:** a sociedade não presta serviço de advocacia, que é privativo de advogados inscritos na OAB (Lei 8.906/1994, art. 1º).

## 2. CNAE principal

| Código | Descrição | Justificativa | Simples Nacional |
| --- | --- | --- | --- |
| **6203-1/00** | Desenvolvimento e licenciamento de programas de computador não customizáveis | É a receita principal: o mesmo software é licenciado a todos os escritórios, por assinatura, sem adaptação para cada cliente. | Permitido. Anexo III ou V, conforme o Fator R (LC 123/2006, art. 18, §5º-D, V, e §5º-M, II) |

## 3. CNAEs secundários

| Código | Descrição | Justificativa | Simples Nacional |
| --- | --- | --- | --- |
| 6311-9/00 | Tratamento de dados, provedores de serviços de aplicação e serviços de hospedagem na internet | O software é entregue como serviço na internet; a sociedade hospeda a aplicação e os dados dos escritórios. | Permitido. Anexo a confirmar (provável III ou V, conforme o Fator R) |
| 6204-0/00 | Consultoria em tecnologia da informação | Apoio ao escritório na organização do fluxo de demandas durante a implantação. | Permitido. Anexo a confirmar (provável III ou V, conforme o Fator R) |
| 6209-1/00 | Suporte técnico, manutenção e outros serviços em tecnologia da informação | Atendimento e suporte aos usuários dos escritórios assinantes. | Permitido. Anexo a confirmar (provável III ou V, conforme o Fator R) |
| 8599-6/03 | Treinamento em informática | Treinamento das equipes dos escritórios no uso da plataforma, se for cobrado à parte. | Permitido. Anexo III, sem Fator R (LC 123/2006, art. 18, §5º-B, I, escolas livres) |

O CNAE 8599-6/03 só entra se a implantação ou o treinamento for oferecido como serviço cobrado. Se o treinamento estiver incluído na assinatura, ele pode ser retirado.

## 4. CNAEs descartados

| Código | Descrição | Motivo do descarte |
| --- | --- | --- |
| 6201-5/01 | Desenvolvimento de programas de computador sob encomenda | O Web-Direito não é desenvolvido sob encomenda para um cliente específico. |
| 6202-3/00 | Desenvolvimento e licenciamento de programas de computador customizáveis | O modelo não prevê adaptar o software para cada escritório; todos usam a mesma versão. |
| 6319-4/00 | Portais, provedores de conteúdo e outros serviços de informação na internet | A plataforma não publica conteúdo nem vive de publicidade; é uma ferramenta de gestão. |
| 8599-6/04 | Treinamento em desenvolvimento profissional e gerencial | Trata de capacitação profissional e gerencial em geral. O treinamento no uso da plataforma se enquadra melhor em 8599-6/03 (treinamento em informática). |
| 6911-7/01 | Serviços advocatícios | Atividade privativa da advocacia. A sociedade não presta serviço jurídico e não pode ter esse objeto (Lei 8.906/1994, arts. 1º e 16). |

## 5. Objeto social

Redação proposta para o contrato social ([contrato-social.md](contrato-social.md)):

> A sociedade tem por objeto:
>
> a) o desenvolvimento e o licenciamento de uso de programas de computador não customizáveis, inclusive na modalidade de software como serviço;
>
> b) o tratamento de dados, a provisão de serviços de aplicação e a hospedagem na internet;
>
> c) a consultoria em tecnologia da informação;
>
> d) o suporte técnico, a manutenção e outros serviços em tecnologia da informação;
>
> e) o treinamento em informática relacionado ao uso dos seus programas.
>
> A sociedade não presta serviços jurídicos de qualquer natureza, inclusive consultoria, assessoria ou representação jurídica, atividades privativas da advocacia.

A última frase deixa claro que a plataforma é uma ferramenta usada por escritórios, e não um prestador de serviço jurídico. Isso evita conflito com o Estatuto da Advocacia (Lei 8.906/1994), que proíbe a sociedade não registrada na OAB de exercer atividade de advocacia.

## Referências

- BRASIL. Lei Complementar nº 123, de 14 de dezembro de 2006. Estatuto Nacional da Microempresa e da Empresa de Pequeno Porte.
- BRASIL. Lei nº 8.906, de 4 de julho de 1994. Estatuto da Advocacia e da OAB.
- COMITÊ GESTOR DO SIMPLES NACIONAL. Resolução CGSN nº 140, de 22 de maio de 2018.
- BRASIL. Lei Complementar nº 123/2006, texto compilado. Disponível em: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm. Acesso em: 15/11/2026.
- IBGE. Comissão Nacional de Classificação (CONCLA). Classificação Nacional de Atividades Econômicas, CNAE 2.3 – Subclasses. Disponível em: https://concla.ibge.gov.br. Consulta pela API de dados do IBGE: https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/{código}. Acesso em: 15/11/2026.

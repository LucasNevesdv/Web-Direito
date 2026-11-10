# Web-Direito — Plataforma SaaS de Gestão Jurídica

Projeto acadêmico desenvolvido na disciplina **Empreendedorismo em Sistemas de Informação (2026/2)** da **Universidade Federal de Lavras (UFLA)**, sob orientação do **Prof. Johnatan Oliveira**.

- **Etapa Atual:** Entrega 4 — MVP Funcional e Validação da Solução (10/11/2026)
- **Repositório:** [https://github.com/LucasNevesdv/Web-Direito](https://github.com/LucasNevesdv/Web-Direito)
- **Relatório Completo da Entrega 4:** [docs/entrega-04/relatorio-entrega-04.md](docs/entrega-04/relatorio-entrega-04.md)

---

## Integrantes da Equipe

- Augusto Fernandes Carvalho
- Alexandre Bortone
- Lucas Marcelino Neves
- Matheus Pimenta
- Diovani Da Cruz Mangia

---

## Proposta de Valor e Problema

> **Problema:** Como pequenos escritórios de advocacia podem acompanhar demandas compartilhadas quando responsáveis, etapas de revisão, documentos e prazos estão dispersos entre mensagens, planilhas e pastas locais?
>
> **Proposta de Valor:** O **Web-Direito** ajuda pequenas equipes de advocacia a coordenar suas demandas em um fluxo único, com visibilidade clara sobre o que precisa ser feito, quem executa, quem revisa e qual é o prazo crítico, mantendo documentos, clientes e histórico integrados ao caso.

---

## Estado do MVP Funcional (100% Integrado)

O software foi desenvolvido seguindo os princípios da **Clean Architecture** e isolamento estrito multi-tenant (`Escritorio` como raiz de dados):

- **Acesso, Equipe e Sessões (`RF-001` a `RF-014`):** Autenticação JWT em memória, renovação via cookie seguro `HttpOnly` com rotação, controle multi-abas via `BroadcastChannel` e papéis de permissão (`PROPRIETARIO`, `ADMINISTRADOR`, `ADVOGADO`, `ESTAGIARIO`, `SECRETARIO`).
- **Gestão de Clientes (`RF-015` a `RF-030`):** Pessoas Físicas (CPF) e Jurídicas (CNPJ), validação algorítmica, múltiplos contatos e histórico.
- **Casos e Processos (`RF-031` a `RF-048`):** Dossiês judiciais e consultivos, validação de padrão CNJ (20 dígitos), partes contrárias e movimentações manuais.
- **Tarefas, Prazos Judiciais e Documentos (`RF-049` a `RF-077`):** Fluxo com distinção de **executor** e **revisor** (uma tarefa com revisão pendente não encerra prematuramente), checklist interno, prazos judiciais com destaque de criticidade (escalonamento a 3 dias) e versionamento incremental de documentos vinculados.
- **Agenda e Dashboard (`RF-078` a `RF-097`):** Painel operacional consolidado com alertas imediatos de prazos críticos e agenda semanal unificada com compromissos e prazos fatais.
- **Auditoria e Administração (`RF-098` a `RF-117`):** Trilha de auditoria imutável via triggers SQL no PostgreSQL.
- **Qualidade Automatizada:** **821 testes automatizados aprovados** (662 no backend e 159 no frontend) com 0 erros de lint, typecheck e build de produção.

---

## Como Executar o Projeto Localmente

### Requisitos Prévios
- Node.js >= 20.19 ou 22+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9.15.4 --activate`)
- PostgreSQL 16+ ativo na porta 5432

### Passo a Passo

1. **Instalar Dependências:**
   ```bash
   pnpm install
   ```

2. **Configurar o Backend:**
   ```bash
   cp src/backend/.env.example src/backend/.env
   # Edite o src/backend/.env com os dados de acesso ao seu PostgreSQL local
   ```

3. **Aplicar Migrações e Gerar o Prisma Client:**
   ```bash
   cd src/backend
   pnpm run prisma:generate
   pnpm exec prisma migrate deploy
   ```

4. **Injetar Dados de Demonstração (Mock Seed):**
   Popula o banco com o escritório de testes (*Advocacia do Marmelo*), com 8 clientes, 5 casos, 4 processos, 4 tarefas e 3 prazos judiciais:
   ```bash
   pnpm run seed:dev
   ```

5. **Iniciar a Aplicação (Backend + Frontend):**
   Na raiz de `src/`:
   ```bash
   pnpm run dev
   ```
   - **Frontend:** `http://localhost:5173`
   - **Backend API:** `http://127.0.0.1:3000`

6. **Credenciais Pré-Configuradas:**
   - **E-mail:** `marmelo@gmail.com`
   - **Senha:** `SenhaForte@123`

---

## Síntese da Validação com Usuários (Entrega 4)

O MVP foi submetido a testes de usabilidade com 5 participantes representativos da rotina forense (Dr. Roberto - Gestor, Dra. Mariana - Advogada Plena, Camila - Assistente Administrativa, Dr. Carlos - Sócio Administrador e Lucas - Estagiário):

- **Taxa Geral de Conclusão das Tarefas:** **92%** sem intervenção direta do observador (**100%** de conclusão total).
- **Tempo Médio de Execução:** **7 minutos e 31 segundos** para todo o fluxo de ponta a ponta.
- **Validação da Hipótese de Revisão:** **100% dos participantes** compreenderam que "elaboração concluída" não encerra a demanda sem aprovação do revisor.
- **Índice de Utilidade Percebida:** **4,6 / 5,0** na escala Likert.
- **Decisão Oficial:** **Prosseguir com ajustes** rumo à Entrega 5 (Pitch final em 01/12/2026).

Consulte o relatório completo com todas as fichas individuais e prints em [docs/entrega-04/Entrega-04.md](docs/entrega-04/Entrega-04.md).

---

## Histórico de Documentos das Entregas

- [Entrega 1 — Descoberta do Problema e da Oportunidade](docs/entrega-01/Entrega-01.md)
- [Entrega 2 — Validação do Problema, Clientes e Mercado](docs/entrega-02/Entrega-02.md)
- [Entrega 3 — Proposta de Valor, Modelo de Negócio e Definição do MVP](docs/entrega-03/Entrega-03.md)
- [Entrega 4 — MVP Funcional e Validação da Solução](docs/entrega-04/Entrega-04.md)

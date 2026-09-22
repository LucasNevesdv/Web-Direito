# Legal System

Fundação técnica do SaaS jurídico Legal System.

## Requisitos

- Node.js 20 ou superior
- pnpm 9 ou superior

## Instalação

```bash
pnpm install
```

## Desenvolvimento

```bash
pnpm dev
```

A aplicação web fica disponível em `http://localhost:5173` e o backend em `http://localhost:3000`.

## Verificações

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

A API expõe apenas `GET /health`, que retorna `{ "status": "ok" }`.

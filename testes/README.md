# Testes

Os testes automatizados ficam junto do código:

- Backend: `src/backend/tests` (unitários e de rotas) e `src/backend/tests/integration` (verificações em PostgreSQL real).
- Frontend: arquivos `*.test.tsx` ao lado de cada tela em `src/frontend/src`.

Para rodar todos, na pasta `src`:

```bash
pnpm test
```

As verificações em banco real usam um banco descartável. Exemplo:

```bash
VERIFICACAO_BANCO_DESCARTAVEL=true pnpm --filter ./backend run verify:tasks-documents
```

Os testes com usuários estão em [docs/entrega-04](../docs/entrega-04/Entrega-04.md).

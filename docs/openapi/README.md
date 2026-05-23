# OpenAPI

Runtime спецификация доступна по адресу:

```text
/api/openapi.json
```

Локально:

```bash
curl http://localhost:3000/api/openapi.json
```

Документ генерируется из `apps/api/src/openapi.ts` и описывает основные публичные и защищенные API-группы. При добавлении новых endpoint нужно обновлять этот файл в том же pull request.

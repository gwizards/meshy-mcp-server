# Meshy MCP Server

## Build & Run

- `npm run build` — compile TypeScript to `dist/`
- `npm run dev` — run with tsx (hot reload)
- `npm test` — run tests with vitest
- `npm start` — run compiled server

## Architecture

Two source files:
- `src/index.ts` — MCP server setup, 36 tool definitions (34 CRUD + wait_for_task + get_balance), validation, error handling. Exports `createServer(apiKey?)` for testing. Version read from package.json at runtime. Rigging and animation have no list tools (Meshy API does not expose list endpoints for these types).
- `src/meshy-client.ts` — Meshy API HTTP client with retry logic, generic `getTask()` for polling, exports `TaskType` union and `TASK_TYPES` const

## Key Patterns

- `taskId` and `paginationSchema` are module-level constants — created once, not per `createServer()` call
- Repetitive GET/DELETE/LIST handlers use `makeGetHandler`, `makeDeleteHandler`, `makeListHandler` factories
- `taskCreated(id, taskType)` formats all create success messages consistently with a typed `TaskType` param
- All tool handlers wrap in try-catch and return `{ isError: true }` on failure
- `MeshyClient.request()` computes `backoffDelay` once per retry iteration, used by both network and HTTP error paths
- Retry logic retries 429/5xx with exponential backoff; respects `Retry-After` header on 429
- `wait_for_task` checks remaining time before sleeping (not after) to avoid timeout overshoot
- `MeshyClient.listPath()` builds paginated query strings — used by all 7 list methods
- Task IDs validated with regex `/^[a-zA-Z0-9_-]+$/` and encoded with `encodeURIComponent()` in URL paths
- Create handlers validate `result.result` exists before returning task ID
- Conditional validation in create tools (e.g., prompt required for preview mode)
- Content-Type header only sent when request body is present
- Non-JSON API responses and empty bodies (on non-DELETE) throw descriptive errors

## Environment

- `MESHY_API_KEY` (required) — Meshy API bearer token

## Versioning

Follow [Semantic Versioning](https://semver.org/) (SemVer). Update `version` in `package.json` with every code change:
- **MAJOR** (X.0.0) — breaking changes to tool names, removed tools, changed input schemas
- **MINOR** (0.X.0) — new tools, new optional parameters, new features
- **PATCH** (0.0.X) — bug fixes, internal refactors, documentation, test changes

Version is read from `package.json` at runtime and reported to MCP clients. Always bump the version as part of the same commit that changes the code.

## Testing

- Tests use vitest with `global.fetch` mocking
- `tests/meshy-client.test.ts` — client retry/error/header tests
- `tests/tools.test.ts` — end-to-end MCP tool tests via InMemoryTransport (all 36 tools covered)

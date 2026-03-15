# Meshy MCP Server

## Build & Run

- `npm run build` — compile TypeScript to `dist/`
- `npm run dev` — run with tsx (hot reload)
- `npm test` — run tests with vitest
- `npm start` — run compiled server

## Architecture

Two source files:
- `src/index.ts` — MCP server setup, 26 tool definitions (24 CRUD + wait_for_task + get_balance), validation, error handling. Exports `createServer(apiKey?)` for testing. Version read from package.json at runtime.
- `src/meshy-client.ts` — Meshy API HTTP client with retry logic and generic `getTask()` for polling

## Key Patterns

- All tool handlers wrap in try-catch and return `{ isError: true }` on failure
- `MeshyClient.request()` retries transient errors (429, 5xx) and network errors with exponential backoff
- Retry logic respects `Retry-After` header on 429 responses
- `wait_for_task` polls any task type until terminal state (SUCCEEDED/FAILED/CANCELED)
- Get tool responses format completed tasks with extracted download URLs
- Zod validates all tool inputs at the MCP layer (including `.int().min(1)` on pagination)
- Conditional validation in create tools (e.g., prompt required for preview mode)
- Content-Type header only sent when request body is present

## Environment

- `MESHY_API_KEY` (required) — Meshy API bearer token

## Testing

- Tests use vitest with `global.fetch` mocking
- `tests/meshy-client.test.ts` — client retry/error/header tests
- `tests/tools.test.ts` — end-to-end MCP tool tests via InMemoryTransport (all 26 tools covered)

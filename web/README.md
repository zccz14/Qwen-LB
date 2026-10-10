# Qwen-LB web console

React + TypeScript + Vite + shadcn/ui console for the Qwen-LB voice API load
balancer. It is embedded into the single Rust binary via `rust-embed` and served
from `/`; the API it talks to lives under `/api` and `/v1`.

- `npm ci && npm run dev` — local dev with Vite proxying `/api` and `/v1` to
  `http://127.0.0.1:8080` (run `cargo run` for the backend).
- `npm run check` — the full gate: unit tests, typecheck, ESLint, production
  build, and the built-CSS layout checks.
- `npm run build` — typecheck + production bundle into `web/dist`, which the
  Rust build embeds. Build this before `cargo build`.

Design language and product context live in the repository's `PRODUCT.md` and
`DESIGN.md`.

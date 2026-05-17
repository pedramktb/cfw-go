# cfw-go

Template for running Go on Cloudflare Workers via TinyGo + [`syumai/workers`](https://github.com/syumai/workers).

More at the blog post: [Running Go on Cloudflare Workers](https://www.pedramktb.com/Blogs/Running%20Go%20on%20Cloudflare%20Workers).

Live example: <https://cfw-go.pedramktb.com>

## Why TinyGo?

The standard Go compiler targets WebAssembly via `GOOS=js GOARCH=wasm`, but produces ~5.4 MB binaries before any application code. Cloudflare Workers caps bundles at 3 MB compressed (free) / 10 MB compressed (paid). TinyGo strips the full Go runtime and produces a Hello World under 1 MB with `-no-debug`.

## How it works

1. [`workers-assets-gen`](https://github.com/syumai/workers) generates the JS glue ([build/worker.mjs](build/worker.mjs), [build/wasm_exec.js](build/wasm_exec.js), [build/runtime.mjs](build/runtime.mjs)).
2. `tinygo build -target wasm` compiles [main.go](main.go) to [build/app.wasm](build/app.wasm).
3. `wrangler deploy` ships it to Cloudflare.

Build orchestration uses [go-task](https://taskfile.dev), invoked as `go tool task`, so tool versions stay pinned in [go.mod](go.mod) without a separate `package.json`.

## Requirements

- Go (tested with v1.26.2 — see [go.mod](go.mod))
- TinyGo v0.41.1 — install via <https://tinygo.org/getting-started/install/>
- Node.js (for `wrangler` and the patch scripts)
- A Cloudflare account (free tier works)

## Getting started

```bash
go mod tidy
go tool task           # list tasks
go tool task build     # build the wasm bundle
go tool task run       # build + local dev server (wrangler dev)
go tool task test      # go test ./...
```

To deploy, set `account_id` in [wrangler.toml](wrangler.toml) (and adjust `name` / `routes`), then:

```bash
go tool task wrangler -- deploy
```

Or push to `main` and let [.github/workflows/ci.yml](.github/workflows/ci.yml) deploy it (requires the `CF_API_TOKEN` repo secret).

## TinyGo v0.41.1 patches

Two issues affect TinyGo v0.41.1 + `syumai/workers`. Both fixes are merged upstream in TinyGo and will ship in the next release after v0.41.1 — until then, the scripts below are applied automatically during `go tool task build` and become no-ops once you upgrade.

### 1. `t.roundTrip undefined` (compile error)

`net/http/roundtrip_js.go` in TinyGo v0.41.1 still calls `t.roundTrip(req)` after `roundTrip` was refactored from a method to a function. [scripts/patch-roundtrip.mjs](scripts/patch-roundtrip.mjs) locates `$TINYGOROOT` via `tinygo env TINYGOROOT` and rewrites the call. Fixed upstream in [tinygo-org/tinygo#5351](https://github.com/tinygo-org/tinygo/pull/5351) (merged, pending release).

### 2. Missing `runtime.getRandomData` (runtime crash)

The worker crashes on startup with `Import #17 'gojs' 'runtime.getRandomData': function import requires a callable`. [scripts/patch-wasm-exec.mjs](scripts/patch-wasm-exec.mjs) injects an implementation backed by the Web Crypto API into the generated `wasm_exec.js`:

```js
"runtime.getRandomData": (slice_ptr, slice_len, slice_cap) => {
    crypto.getRandomValues(loadSlice(slice_ptr, slice_len, slice_cap));
},
```

The three-parameter signature follows TinyGo's WASM C ABI. `crypto.getRandomValues` has a 65536-byte per-call limit, but `crypto/internal/sysrand` chunks requests, so the handler never exceeds it. Fixed upstream in [tinygo-org/tinygo#5363](https://github.com/tinygo-org/tinygo/pull/5363) (merged, pending release); also tracked in [syumai/workers#195](https://github.com/syumai/workers/pull/195) (open) and issue [tinygo-org/tinygo#5357](https://github.com/tinygo-org/tinygo/issues/5357).

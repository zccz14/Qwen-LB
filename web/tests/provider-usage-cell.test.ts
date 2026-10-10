import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")

test("shows provider usage as labeled voice metrics with grouped numbers", () => {
  const cell = app.slice(
    app.indexOf("{t.providerUsageRequests}"),
    app.indexOf("{t.providerNoUsage}")
  )
  assert.match(cell, /usage\.requests\.toLocaleString\(locale\)/)
  assert.match(cell, /usage\.errors\.toLocaleString\(locale\)/)
  assert.match(cell, /label=\{t\.audioSeconds\}/)
  assert.match(cell, /formatSeconds\(/)
  assert.match(cell, /label=\{t\.characters\}/)
  assert.match(cell, /value=\{usage\.characters\.toLocaleString\(locale\)\}/)
  assert.match(cell, /formatUsd\(usage\.cost_usd_nanos, locale\)/)
  assert.doesNotMatch(cell, /usage\.input_tokens|usage\.output_tokens/)
  assert.doesNotMatch(app, /providerUsageTokens/)
})

test("keeps the shared metric grouped for both locales", () => {
  const metric = app.slice(
    app.indexOf("function MetricValue("),
    app.indexOf("function DataTable(")
  )
  assert.match(metric, /\{value\}/)
  assert.match(metric, /<span className="text-muted-foreground">\{label\}<\/span>/)
})

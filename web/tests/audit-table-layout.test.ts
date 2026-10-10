import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("inference audit keeps its table columns aligned around user and consumer", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8")
  const audit = app.slice(
    app.indexOf("function AuditPage"),
    app.indexOf("function CopyableIdentifier")
  )
  const header = audit.slice(
    audit.indexOf("<TableHeader>"),
    audit.indexOf("</TableHeader>")
  )
  const columns = [
    "{t.userLabel}",
    "{t.consumer}",
    "{t.time}",
    "{t.model}",
    "{t.cost}",
    "{t.provider}",
    "{t.threadId}",
    "{t.status}",
    "{t.usage}",
    "{t.actions}",
  ]
  let previous = -1
  for (const column of columns) {
    const position = header.indexOf(column)
    assert.ok(position > previous, `${column} is in the expected column order`)
    previous = position
  }
  for (const hiddenColumn of [
    "downstreamModel",
    "upstreamModel",
    "sessionId",
    "downstreamUserAgent",
  ]) {
    assert.doesNotMatch(header, new RegExp(`\\{t\\.${hiddenColumn}\\}`))
  }

  const rowStart = audit.indexOf("<TableRow key={row.id}>")
  const firstRow = audit.slice(rowStart, audit.indexOf("</TableRow>", rowStart))
  assert.match(
    firstRow,
    /<LinkitUserInfo[\s\S]*?<\/TableCell>\s*<TableCell className="font-medium">\s*\{row\.consumer_name\}\s*<\/TableCell>\s*<TableCell className="whitespace-nowrap">/
  )
  assert.match(firstRow, /formatSeconds\(row\.audio_seconds, locale\)/)
  assert.match(firstRow, /row\.characters\.toLocaleString\(locale\)/)
  assert.match(firstRow, /formatUsd\(row\.cost_usd_nanos, locale\)/)
  assert.doesNotMatch(firstRow, /row\.upstream_model|row\.input_tokens/)
})

import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { ROOT } from '../src/io.mjs'

const SOURCE_FILES = readdirSync(join(ROOT, 'src'))
  .filter((name) => name.endsWith('.mjs'))
  .sort()
  .map((name) => ({ name, text: readFileSync(join(ROOT, 'src', name), 'utf8') }))

test('production source imports only bounded Node built-ins and local modules', () => {
  const allowedBuiltins = new Set(['node:crypto', 'node:fs', 'node:path', 'node:url'])
  for (const { name, text } of SOURCE_FILES) {
    const imports = [...text.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map((match) => match[1])
    for (const specifier of imports) {
      assert.equal(specifier.startsWith('./') || specifier.startsWith('../') || allowedBuiltins.has(specifier), true, `${name}: ${specifier}`)
    }
  }
})

test('production source contains no network, subprocess, sandbox, package, credential, or dynamic-code door', () => {
  const source = SOURCE_FILES.map(({ name, text }) => `\n${name}\n${text}`).join('\n')
  const forbidden = [
    /\bfetch\s*\(/u,
    /\bXMLHttpRequest\b/u,
    /\bWebSocket\b/u,
    /\bEventSource\b/u,
    /node:(?:http|https|net|tls|dgram|dns|child_process|cluster|worker_threads|vm)/u,
    /\b(?:exec|execFile|spawn|fork)Sync?\s*\(/u,
    /\bprocess\.env\b/u,
    /\beval\s*\(/u,
    /\bnew\s+Function\b/u,
    /\bWebAssembly\b/u,
    /\bnpm\s+(?:install|exec|publish)\b/u,
    /\b(?:approve|signature|credential)\s*\(/iu,
  ]
  for (const pattern of forbidden) assert.doesNotMatch(source, pattern)
})

test('the sole production write primitive is fixed to public/trials.json', () => {
  const io = readFileSync(join(ROOT, 'src', 'io.mjs'), 'utf8')
  const trials = readFileSync(join(ROOT, 'src', 'trials.mjs'), 'utf8')
  const cli = readFileSync(join(ROOT, 'src', 'cli.mjs'), 'utf8')
  assert.match(io, /PUBLIC_SNAPSHOT = join\(ROOT, 'public', 'trials\.json'\)/u)
  assert.match(io, /export function atomicWritePublicSnapshot\(text\)/u)
  assert.equal((`${io}\n${trials}\n${cli}`.match(/\b(?:writeSync|renameSync)\s*\(/gu) ?? []).length, 2)
  assert.doesNotMatch(`${trials}\n${cli}`, /\b(?:writeFile|appendFile|openSync|writeSync|renameSync|mkdirSync)\b/u)
  assert.doesNotMatch(cli, /--output/u)
})

test('Phase-0 data contains no artifact bodies, code, credentials, signatures, or common shared gate state words', () => {
  const publicText = readFileSync(join(ROOT, 'public', 'trials.json'), 'utf8')
  for (const key of ['fullText', 'abstract', 'sourceCode', 'artifactBody', 'credentialValue', 'signatureValue']) {
    assert.doesNotMatch(publicText, new RegExp(`"${key}"\\s*:`, 'u'))
  }
  assert.doesNotMatch(publicText, /"(?:status|outcome|score)"\s*:/iu)
  assert.doesNotMatch(publicText, /:\s*"(?:approved|pass|authorized|active)"/iu)
})

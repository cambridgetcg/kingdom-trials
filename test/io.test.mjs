import assert from 'node:assert/strict'
import { join } from 'node:path'
import test from 'node:test'

import {
  JSON_LIMITS,
  ROOT,
  assertNoSymlinkComponents,
  canonicalJson,
  insideRoot,
  parseJsonBytes,
  prettyCanonicalJson,
  readJson,
  sha256Json,
} from '../src/io.mjs'

test('strict parser rejects duplicate object keys', () => {
  assert.throws(
    () => parseJsonBytes(Buffer.from('{"safe":true,"safe":false}')),
    /duplicate JSON object key/u,
  )
})

test('strict parser rejects malformed UTF-8', () => {
  assert.throws(() => parseJsonBytes(Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x22, 0x3a, 0x31, 0x7d])), /encoded data/u)
})

test('strict parser enforces depth, node, collection, and string bounds', () => {
  const base = { ...JSON_LIMITS }
  assert.throws(
    () => parseJsonBytes(Buffer.from('[[[[]]]]'), 'deep', { ...base, depth: 2 }),
    /nesting exceeds/u,
  )
  assert.throws(
    () => parseJsonBytes(Buffer.from('[1,2,3]'), 'nodes', { ...base, nodes: 3 }),
    /node count exceeds/u,
  )
  assert.throws(
    () => parseJsonBytes(Buffer.from('[1,2,3]'), 'collection', { ...base, collectionItems: 2 }),
    /array exceeds/u,
  )
  assert.throws(
    () => parseJsonBytes(Buffer.from('{"long":"abcd"}'), 'string', { ...base, stringCodePoints: 3 }),
    /string exceeds/u,
  )
})

test('strict parser rejects unsafe JSON integers', () => {
  assert.throws(() => parseJsonBytes(Buffer.from('{"integer":9007199254740993}')), /unsafe JSON integer/u)
})

test('canonical JSON is stable and normalizes negative zero', () => {
  const left = { z: [3, { b: -0, a: true }], a: 'first' }
  const right = { a: 'first', z: [3, { a: true, b: 0 }] }
  assert.equal(canonicalJson(left), canonicalJson(right))
  assert.equal(prettyCanonicalJson(left).endsWith('\n'), true)
  assert.equal(sha256Json(left), sha256Json(right))
})

test('canonical JSON preserves root and nested prototype-shaped member names', () => {
  const hostile = parseJsonBytes(Buffer.from('{"__proto__":{"polluted":true},"constructor":"constructor-data","nested":{"__proto__":{"admin":true},"prototype":"prototype-data"},"safe":1}'))
  const withoutPrototypeMember = parseJsonBytes(Buffer.from('{"constructor":"constructor-data","nested":{"prototype":"prototype-data"},"safe":1}'))
  const canonical = canonicalJson(hostile)

  assert.notEqual(canonical, canonicalJson(withoutPrototypeMember))
  assert.notEqual(sha256Json(hostile), sha256Json(withoutPrototypeMember))
  assert.match(canonical, /"__proto__":\{"polluted":true\}/u)
  assert.match(canonical, /"nested":\{"__proto__":\{"admin":true\},"prototype":"prototype-data"\}/u)
  assert.match(canonical, /"constructor":"constructor-data"/u)
  assert.equal(Object.prototype.polluted, undefined)
  assert.equal(Object.prototype.admin, undefined)
})

test('bundled-path guard rejects traversal and a simulated symlink ancestor', () => {
  assert.equal(insideRoot(join(ROOT, 'data', 'config.json')), true)
  assert.equal(insideRoot(join(ROOT, '..', 'outside.json')), false)
  const target = join(ROOT, 'data', 'simulated.json')
  const directoryStatus = {
    isSymbolicLink: () => false,
    isDirectory: () => true,
    isFile: () => false,
  }
  const symlinkStatus = {
    isSymbolicLink: () => true,
    isDirectory: () => false,
    isFile: () => false,
  }
  assert.throws(
    () => assertNoSymlinkComponents(target, (path) => path === join(ROOT, 'data') ? symlinkStatus : directoryStatus),
    /symbolic-link path components are forbidden/u,
  )
})

test('checked-in JSON files pass the strict local reader', () => {
  const config = readJson(join(ROOT, 'data', 'config.json'))
  assert.equal(config.observatoryBinding.snapshotAsOf, '2026-08-20T18:10:14Z')
})

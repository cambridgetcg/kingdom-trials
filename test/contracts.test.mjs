import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { ROOT, readJson } from '../src/io.mjs'
import {
  loadSchemaRegistry,
  schemaDocumentIssues,
  validateWithSchema,
} from '../src/schema-validator.mjs'
import { buildSnapshot } from '../src/trials.mjs'

const SCHEMA_NAMES = [
  'adoption-record.schema.json',
  'evaluation-plan.schema.json',
  'evaluation-request.schema.json',
  'evaluation-result.schema.json',
  'preflight.schema.json',
  'public-snapshot.schema.json',
  'referral.schema.json',
  'trial-authority.schema.json',
  'trial-run.schema.json',
  'use-authority.schema.json',
]

const RESERVED = [
  'preflight.schema.json',
  'trial-authority.schema.json',
  'trial-run.schema.json',
  'evaluation-result.schema.json',
  'adoption-record.schema.json',
  'use-authority.schema.json',
]

test('exact ten Draft 2020-12 schema documents have canonical IDs and closed objects', () => {
  const registry = loadSchemaRegistry()
  assert.deepEqual(schemaDocumentIssues(registry), [])
  for (const name of SCHEMA_NAMES) {
    const schema = registry.get(name)
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
    assert.equal(schema.$id, `https://thekingdom.dev/trials/schemas/v0.1/${name}`)
  }
})

test('all six post-plan schemas directly deny every object in Phase 0', () => {
  const registry = loadSchemaRegistry()
  for (const name of RESERVED) {
    assert.match(registry.get(name).description, /Deny-all contract/u)
    assert.notDeepEqual(validateWithSchema({}, name, registry), [], name)
    assert.notDeepEqual(validateWithSchema({ schema: 'invented' }, name, registry), [], name)
  }
})

test('dated public schema validates exact Phase-0 snapshot and rejects count drift', () => {
  const registry = loadSchemaRegistry()
  const snapshot = buildSnapshot()
  assert.deepEqual(validateWithSchema(snapshot, 'public-snapshot.schema.json', registry), [])
  const mutated = structuredClone(snapshot)
  mutated.counts.referrals = 5
  assert.match(validateWithSchema(mutated, 'public-snapshot.schema.json', registry).join('\n'), /declared constant/u)
})

test('package is private, unlicensed, zero-dependency, and Node 20+', () => {
  const pkg = readJson(join(ROOT, 'package.json'))
  assert.equal(pkg.private, true)
  assert.equal(pkg.version, '0.1.1')
  assert.equal(pkg.license, 'UNLICENSED')
  assert.equal(pkg.engines.node, '>=20')
  assert.equal(Object.hasOwn(pkg, 'dependencies'), false)
  assert.equal(Object.hasOwn(pkg, 'devDependencies'), false)
})

test('CI actions are commit-pinned and use Node 22', () => {
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'validate.yml'), 'utf8')
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/u)
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/u)
  assert.match(workflow, /node-version: "22"/u)
  assert.match(workflow, /npm run build:check/u)
})

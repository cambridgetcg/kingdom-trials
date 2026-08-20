import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

import { ROOT, canonicalJson, readJson } from './io.mjs'

const SCHEMA_DIR = join(ROOT, 'schemas', 'v0.1')
const MAX_SCHEMA_DEPTH = 64
const EXPECTED_NAMES = Object.freeze([
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
])

function jsonEqual(left, right) {
  try { return canonicalJson(left) === canonicalJson(right) } catch { return false }
}

function typeMatches(value, type) {
  if (type === 'null') return value === null
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  if (type === 'integer') return Number.isSafeInteger(value)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  return typeof value === type
}

function pointer(root, fragment) {
  if (fragment === '' || fragment === '#') return root
  if (!fragment.startsWith('#/')) throw new Error(`unsupported schema fragment ${fragment}`)
  let current = root
  for (const raw of fragment.slice(2).split('/')) {
    const token = raw.replaceAll('~1', '/').replaceAll('~0', '~')
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, token)) {
      throw new Error(`unresolved schema fragment ${fragment}`)
    }
    current = current[token]
  }
  return current
}

export function loadSchemaRegistry() {
  const names = readdirSync(SCHEMA_DIR).filter((entry) => entry.endsWith('.json')).sort()
  if (canonicalJson(names) !== canonicalJson(EXPECTED_NAMES)) {
    throw new Error(`schema inventory must be exactly ${EXPECTED_NAMES.join(', ')}`)
  }
  const registry = new Map()
  for (const name of names) {
    const schema = readJson(join(SCHEMA_DIR, name))
    registry.set(name, schema)
    if (typeof schema.$id === 'string') registry.set(schema.$id, schema)
  }
  return registry
}

function resolveReference(reference, rootSchema, registry) {
  const hash = reference.indexOf('#')
  const document = hash === -1 ? reference : reference.slice(0, hash)
  const fragment = hash === -1 ? '' : reference.slice(hash)
  const targetRoot = document === ''
    ? rootSchema
    : registry.get(document) ?? registry.get(basename(document))
  if (targetRoot === undefined) throw new Error(`unresolved schema reference ${reference}`)
  return { schema: pointer(targetRoot, fragment), root: targetRoot }
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const instant = new Date(Date.UTC(year, month - 1, day))
  return instant.getUTCFullYear() === year && instant.getUTCMonth() === month - 1 && instant.getUTCDate() === day
}

function validDateTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) return false
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value
}

function validUri(value) {
  try {
    const url = new URL(value)
    return url.href === value
  } catch {
    return false
  }
}

function formatMatches(value, format) {
  if (format === 'date') return validDate(value)
  if (format === 'date-time') return validDateTime(value)
  if (format === 'uri') return validUri(value)
  return true
}

function walk(value, schema, path, rootSchema, registry, depth) {
  if (depth > MAX_SCHEMA_DEPTH) return [`${path}: schema nesting exceeds ${MAX_SCHEMA_DEPTH}`]
  if (schema === true) return []
  if (schema === false) return [`${path}: value is forbidden`]
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    return [`${path}: invalid schema node`]
  }
  if (typeof schema.$ref === 'string') {
    const resolved = resolveReference(schema.$ref, rootSchema, registry)
    return walk(value, resolved.schema, path, resolved.root, registry, depth + 1)
  }

  const issues = []
  if (Object.hasOwn(schema, 'const') && !jsonEqual(value, schema.const)) {
    issues.push(`${path}: must equal declared constant`)
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonEqual(item, value))) {
    issues.push(`${path}: value is outside enum`)
  }
  if (schema.not !== undefined) {
    if (walk(value, schema.not, path, rootSchema, registry, depth + 1).length === 0) {
      issues.push(`${path}: value matches a forbidden schema`)
    }
  }
  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf.map((branch) => walk(value, branch, path, rootSchema, registry, depth + 1))
    if (branches.filter((branch) => branch.length === 0).length !== 1) issues.push(`${path}: must match exactly one oneOf branch`)
  }
  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf.map((branch) => walk(value, branch, path, rootSchema, registry, depth + 1))
    if (branches.every((branch) => branch.length > 0)) issues.push(`${path}: must match at least one anyOf branch`)
  }
  if (Array.isArray(schema.allOf)) {
    for (const child of schema.allOf) issues.push(...walk(value, child, path, rootSchema, registry, depth + 1))
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((type) => typeMatches(value, type))) {
      issues.push(`${path}: expected ${types.join('|')}`)
      return issues
    }
  }

  if (typeof value === 'string') {
    const length = [...value].length
    if (schema.minLength !== undefined && length < schema.minLength) issues.push(`${path}: string is too short`)
    if (schema.maxLength !== undefined && length > schema.maxLength) issues.push(`${path}: string is too long`)
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) {
      issues.push(`${path}: string does not match pattern`)
    }
    if (typeof schema.format === 'string' && !formatMatches(value, schema.format)) {
      issues.push(`${path}: string does not match ${schema.format} format`)
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) issues.push(`${path}: number is below minimum`)
    if (schema.maximum !== undefined && value > schema.maximum) issues.push(`${path}: number is above maximum`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) issues.push(`${path}: array has too few items`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) issues.push(`${path}: array has too many items`)
    if (schema.uniqueItems === true) {
      const keys = value.map((item) => canonicalJson(item))
      if (new Set(keys).size !== keys.length) issues.push(`${path}: array items must be unique`)
    }
    if (schema.items !== undefined) {
      for (let index = 0; index < value.length; index += 1) {
        issues.push(...walk(value[index], schema.items, `${path}/${index}`, rootSchema, registry, depth + 1))
      }
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value)
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) issues.push(`${path}: object has too few properties`)
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) issues.push(`${path}: object has too many properties`)
    const properties = schema.properties ?? {}
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) issues.push(`${path}/${required}: required property is missing`)
    }
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        issues.push(...walk(child, properties[key], `${path}/${key}`, rootSchema, registry, depth + 1))
      } else if (schema.additionalProperties === false) {
        issues.push(`${path}/${key}: additional property is forbidden`)
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        issues.push(...walk(child, schema.additionalProperties, `${path}/${key}`, rootSchema, registry, depth + 1))
      }
    }
  }
  return issues
}

export function validateWithSchema(value, schemaName, registry = loadSchemaRegistry()) {
  const schema = registry.get(schemaName)
  if (schema === undefined) throw new Error(`unknown schema ${schemaName}`)
  return walk(value, schema, '$', schema, registry, 0)
}

function collectReferences(value, references = []) {
  if (value === null || typeof value !== 'object') return references
  if (typeof value.$ref === 'string') references.push(value.$ref)
  for (const child of Object.values(value)) collectReferences(child, references)
  return references
}

function objectContractsClosed(value, path = '$', issues = []) {
  if (value === null || typeof value !== 'object') return issues
  if (!Array.isArray(value) && value.type === 'object' && value.additionalProperties !== false) {
    issues.push(`${path}: object contract must set additionalProperties false`)
  }
  for (const [key, child] of Object.entries(value)) objectContractsClosed(child, `${path}/${key}`, issues)
  return issues
}

export function schemaDocumentIssues(registry = loadSchemaRegistry()) {
  const issues = []
  const seenIds = new Set()
  for (const name of EXPECTED_NAMES) {
    const schema = registry.get(name)
    if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
      issues.push(`${name}: unsupported or missing $schema`)
    }
    const expectedId = `https://thekingdom.dev/trials/schemas/v0.1/${name}`
    if (schema.$id !== expectedId || seenIds.has(schema.$id)) {
      issues.push(`${name}: $id must be unique and equal ${expectedId}`)
    } else {
      seenIds.add(schema.$id)
    }
    issues.push(...objectContractsClosed(schema).map((issue) => `${name}: ${issue}`))
    for (const reference of collectReferences(schema)) {
      try { resolveReference(reference, schema, registry) } catch (error) {
        issues.push(`${name}: ${error.message}`)
      }
    }
  }
  return issues.sort()
}

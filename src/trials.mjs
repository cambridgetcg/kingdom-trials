import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
  PUBLIC_SNAPSHOT,
  ROOT,
  atomicWritePublicSnapshot,
  canonicalJson,
  prettyCanonicalJson,
  readBoundedBytes,
  readJson,
  sha256Bytes,
  sha256Json,
} from './io.mjs'
import {
  loadSchemaRegistry,
  schemaDocumentIssues,
  validateWithSchema,
} from './schema-validator.mjs'

const COLLECTIONS = Object.freeze({
  referrals: { file: 'referrals.json', schema: 'referral.schema.json' },
  evaluationRequests: { file: 'evaluation-requests.json', schema: 'evaluation-request.schema.json' },
  evaluationPlans: { file: 'evaluation-plans.json', schema: 'evaluation-plan.schema.json' },
  preflights: { file: 'preflights.json', schema: 'preflight.schema.json' },
  trialAuthorities: { file: 'trial-authorities.json', schema: 'trial-authority.schema.json' },
  trialRuns: { file: 'trial-runs.json', schema: 'trial-run.schema.json' },
  evaluationResults: { file: 'evaluation-results.json', schema: 'evaluation-result.schema.json' },
  adoptionRecords: { file: 'adoption-records.json', schema: 'adoption-record.schema.json' },
  useAuthorities: { file: 'use-authorities.json', schema: 'use-authority.schema.json' },
})

const EXPECTED_COUNTS = Object.freeze({
  referrals: 4,
  evaluationRequests: 3,
  evaluationPlans: 3,
  preflights: 0,
  trialAuthorities: 0,
  trialRuns: 0,
  evaluationResults: 0,
  adoptionRecords: 0,
  useAuthorities: 0,
})

const EXPECTED_OBSERVATORY_BINDING = Object.freeze({
  snapshotUrl: 'https://thekingdom.dev/research.json',
  snapshotAsOf: '2026-08-20T18:10:14Z',
  snapshotByteSha256: 'sha256:d7da3f38de019dc0f2c45f477740222527f156d8a4d3f6a2e22aced67b282a94',
  snapshotCanonicalReceipt: 'sha256:17c487aa03f8427fc324b8da34dedbc00db76362be78620bde3a8d075e3942cd',
  captureSetReceipt: 'sha256:68a69dc390aa34133cadc8807ed33ddd1fae72e7e99706cf714d72698d071f7f',
})

const EXPECTED_LOCK_RECEIPT = 'sha256:56aae803528a75548c6f3583139b1655e8e8ad9d0c820d351cf5e2181dd3b32c'

const EXPECTED_QUESTIONS = Object.freeze({
  'referral:semantic-zero-trust-mcp:2026-08-20': 'On finite, self-authored MCP traces, can a declared intent-and-capability envelope identify pre-registered boundary violations that a minimal deny-by-default baseline misses, without changing allowed traces?',
  'referral:mcp-registry-drift:2026-08-20': 'Under one fixed audit budget, can a coverage-aware re-audit policy expose more planted change patterns across a finite synthetic registry than recency-only, score-only, or uniform baselines?',
  'referral:thinking-no-thinking-sae:2026-08-20': 'Can a bounded interpretability-evidence protocol distinguish feature association, declared confounding, and absence of signal without promoting a sparse representation into an explanation of reasoning?',
})

const CONFIG_KEYS = Object.freeze([
  'asOf',
  'boundaries',
  'expiresAt',
  'observatoryBinding',
  'onExpiry',
  'urls',
])

function issue(message) {
  return `semantic: ${message}`
}

function exactKeys(value, keys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort())
}

function sortedRecords(records) {
  return [...records].sort((left, right) => left.id.localeCompare(right.id))
}

export function loadObservatoryLock() {
  const lock = readJson(join(ROOT, 'data', 'observatory-lock.json'))
  if (sha256Json(lock) !== EXPECTED_LOCK_RECEIPT) {
    throw new Error('observatory projected lock receipt differs from the reviewed constant')
  }
  if (!exactKeys(lock, ['snapshotAsOf', 'snapshotByteSha256', 'snapshotCanonicalReceipt', 'captureSetReceipt', 'works'])) {
    throw new Error('observatory projected lock has an unexpected shape')
  }
  if (canonicalJson({
    snapshotUrl: EXPECTED_OBSERVATORY_BINDING.snapshotUrl,
    snapshotAsOf: lock.snapshotAsOf,
    snapshotByteSha256: lock.snapshotByteSha256,
    snapshotCanonicalReceipt: lock.snapshotCanonicalReceipt,
    captureSetReceipt: lock.captureSetReceipt,
  }) !== canonicalJson(EXPECTED_OBSERVATORY_BINDING)) {
    throw new Error('observatory projected lock binding differs from the reviewed whole-snapshot constants')
  }
  return lock
}

export function loadInputs() {
  const config = readJson(join(ROOT, 'data', 'config.json'))
  if (!exactKeys(config, CONFIG_KEYS)) throw new Error('config must contain exactly the declared Phase-0 keys')
  const collections = {}
  for (const [name, contract] of Object.entries(COLLECTIONS)) {
    const records = readJson(join(ROOT, 'data', contract.file))
    if (!Array.isArray(records)) throw new TypeError(`${contract.file} must contain an array`)
    if (records.length > 1024) throw new RangeError(`${contract.file} exceeds the Phase-0 record bound`)
    collections[name] = records
  }
  return { config, collections, lock: loadObservatoryLock() }
}

export function assembleSnapshot(config, collections) {
  const counts = {}
  const arrays = {}
  for (const name of Object.keys(COLLECTIONS)) {
    const records = collections[name]
    if (!Array.isArray(records)) throw new TypeError(`${name} must be an array`)
    arrays[name] = sortedRecords(records)
    counts[name] = records.length
  }
  return {
    schema: 'kingdom.trial-public-snapshot/0.1',
    contractVersion: '0.1.0',
    asOf: config.asOf,
    expiresAt: config.expiresAt,
    onExpiry: config.onExpiry,
    urls: config.urls,
    observatoryBinding: config.observatoryBinding,
    boundaries: config.boundaries,
    counts,
    ...arrays,
  }
}

function uniqueIdIssues(records, label) {
  const issues = []
  const ids = new Set()
  for (const record of records) {
    if (typeof record?.id !== 'string') continue
    if (ids.has(record.id)) issues.push(issue(`${label} repeats ID ${record.id}`))
    ids.add(record.id)
  }
  return issues
}

function sourceBindingForLock(work, lock) {
  return {
    snapshotAsOf: lock.snapshotAsOf,
    snapshotByteSha256: lock.snapshotByteSha256,
    snapshotCanonicalReceipt: lock.snapshotCanonicalReceipt,
    workId: work.workId,
    sourceIds: work.sourceIds,
    primaryIdentifier: work.primaryIdentifier,
    relatedWorkIds: work.relatedWorkIds,
    observationIds: work.observationIds,
    observations: work.observations,
    payloadReceiptsAreArtifactDigests: false,
    signalIds: work.signalIds,
  }
}

function forbiddenVocabularyIssues(value, path = '$', issues = []) {
  if (typeof value === 'string' && /^(?:approved|pass|authorized|active)$/iu.test(value)) {
    issues.push(issue(`${path} uses forbidden shared gate vocabulary ${JSON.stringify(value)}`))
  }
  if (value === null || typeof value !== 'object') return issues
  if (Array.isArray(value)) {
    value.forEach((child, index) => forbiddenVocabularyIssues(child, `${path}/${index}`, issues))
    return issues
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:status|outcome|score)$/iu.test(key)) {
      issues.push(issue(`${path}/${key} is a forbidden scalar/shared gate field`))
    }
    forbiddenVocabularyIssues(child, `${path}/${key}`, issues)
  }
  return issues
}

function phaseZeroIssues(snapshot, lock) {
  const issues = []
  if (canonicalJson(snapshot.counts) !== canonicalJson(EXPECTED_COUNTS)) {
    issues.push(issue('counts must remain the exact dated Phase-0 counts'))
  }
  for (const [name, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (!Array.isArray(snapshot[name]) || snapshot[name].length !== expected) {
      issues.push(issue(`${name} must contain exactly ${expected} records`))
    }
  }
  if (canonicalJson(snapshot.observatoryBinding) !== canonicalJson(EXPECTED_OBSERVATORY_BINDING)) {
    issues.push(issue('snapshot Observatory binding differs from reviewed whole-snapshot constants'))
  }
  if (!(Date.parse(snapshot.asOf) < Date.parse(snapshot.expiresAt))) {
    issues.push(issue('snapshot must be created before its explicit expiry'))
  }
  if (snapshot.onExpiry !== 'freeze-projection-and-require-new-human-review') {
    issues.push(issue('expiry must freeze the projection and require new human review'))
  }

  for (const [name] of Object.entries(COLLECTIONS)) issues.push(...uniqueIdIssues(snapshot[name] ?? [], name))
  const allIds = Object.keys(COLLECTIONS).flatMap((name) => (snapshot[name] ?? []).map((record) => record.id))
  if (new Set(allIds).size !== allIds.length) issues.push(issue('record IDs must be globally unique across gates'))

  const lockByWork = new Map(lock.works.map((work) => [work.workId, work]))
  for (const referral of snapshot.referrals ?? []) {
    const work = lockByWork.get(referral.sourceBinding?.workId)
    if (work === undefined) {
      issues.push(issue(`${referral.id} is absent from the reviewed Observatory projected lock`))
      continue
    }
    if (referral.sourceMetadataTitle !== work.sourceMetadataTitle) {
      issues.push(issue(`${referral.id} title differs from the projected lock`))
    }
    if (canonicalJson(referral.sourceBinding) !== canonicalJson(sourceBindingForLock(work, lock))) {
      issues.push(issue(`${referral.id} source binding differs from exact projected lock fields`))
    }
  }
  const referredWorkIds = (snapshot.referrals ?? []).map((record) => record.sourceBinding?.workId).sort()
  const lockedWorkIds = lock.works.map((record) => record.workId).sort()
  if (canonicalJson(referredWorkIds) !== canonicalJson(lockedWorkIds)) {
    issues.push(issue('referrals must cover exactly the four works in the projected lock'))
  }

  const referrals = new Map((snapshot.referrals ?? []).map((record) => [record.id, record]))
  const requests = new Map((snapshot.evaluationRequests ?? []).map((record) => [record.id, record]))
  const plans = new Map((snapshot.evaluationPlans ?? []).map((record) => [record.id, record]))

  for (const referral of referrals.values()) {
    if (referral.sourceTitleIsScientificClaim !== false || !referral.claimBoundary?.includes('not a scientific claim')) {
      issues.push(issue(`${referral.id} must preserve the metadata-title claim boundary`))
    }
    if (referral.disposition === 'advanced-to-human-scoping') {
      if (referral.holdReasons?.length !== 0) issues.push(issue(`${referral.id} advanced referral must not carry a hold reason`))
      const request = requests.get(referral.evaluationRequestId)
      if (request === undefined || request.referralId !== referral.id) {
        issues.push(issue(`${referral.id} must point to one reciprocal assisted request draft`))
      }
    } else if (referral.disposition === 'held-for-source-resolution') {
      if (referral.evaluationRequestId !== null) issues.push(issue(`${referral.id} held referral cannot point to a request`))
      const requiredHolds = [
        'self-version-relation-unresolved',
        'supplement-target-absent-from-pinned-snapshot',
        'model-pin-absent',
        'method-pin-absent',
        'dataset-pin-absent',
        'artifact-pin-absent',
      ]
      if (canonicalJson(referral.holdReasons) !== canonicalJson(requiredHolds)) {
        issues.push(issue(`${referral.id} must preserve exactly the ordered six source-identity/artifact holds`))
      }
    }
    if (referral.referredOn !== '2026-08-20' || Date.parse(`${referral.referredOn}T23:59:59Z`) < Date.parse(referral.sourceBinding?.snapshotAsOf)) {
      issues.push(issue(`${referral.id} must preserve the dated referral chronology`))
    }
  }

  for (const request of requests.values()) {
    const referral = referrals.get(request.referralId)
    const plan = plans.get(request.planId)
    if (referral?.evaluationRequestId !== request.id) issues.push(issue(`${request.id} referral edge is not reciprocal`))
    if (plan?.requestId !== request.id || plan?.referralId !== request.referralId) {
      issues.push(issue(`${request.id} plan edge is not reciprocal`))
    }
    if (request.evaluationQuestion !== EXPECTED_QUESTIONS[request.referralId]) {
      issues.push(issue(`${request.id} does not preserve the reviewed synthetic-only question`))
    }
    if (request.authorship?.origin !== 'maintainer-authorized-assisted-draft'
      || request.authorship?.humanDirectionRecorded !== true
      || request.authorship?.exactTextHumanReviewed !== false
      || request.authorship?.compiledBy !== 'codex-assisted-publication') {
      issues.push(issue(`${request.id} overstates or omits assisted-draft provenance`))
    }
    if (request.requestedInputClass !== 'SELF-AUTHORED-SYNTHETIC-ONLY' || request.sourceMethodsKnown !== false) {
      issues.push(issue(`${request.id} must remain synthetic-only with source methods unknown`))
    }
    if (request.authoredOn !== '2026-08-20' || request.evaluationLens !== referral?.evaluationLens) {
      issues.push(issue(`${request.id} must preserve its dated referral lens`))
    }
  }

  for (const plan of plans.values()) {
    const request = requests.get(plan.requestId)
    if (request === undefined || request.planId !== plan.id || request.referralId !== plan.referralId) {
      issues.push(issue(`${plan.id} request/referral edges are not reciprocal`))
    }
    if (plan.evaluationQuestion !== EXPECTED_QUESTIONS[plan.referralId]
      || plan.evaluationQuestion !== request?.evaluationQuestion) {
      issues.push(issue(`${plan.id} does not preserve its exact assisted synthetic question`))
    }
    if (plan.planState !== 'DRAFT' || plan.sealState !== 'UNSEALED' || plan.noRunState !== 'NO-RUN') {
      issues.push(issue(`${plan.id} must remain DRAFT, UNSEALED, and NO-RUN`))
    }
    if (plan.expiresAt !== snapshot.expiresAt || plan.expiryEffect !== 'FREEZE_AND_REQUIRE_NEW_HUMAN_REVIEW') {
      issues.push(issue(`${plan.id} must share the dated snapshot expiry and freeze effect`))
    }
    if (plan.sourceMethodsKnown !== false || plan.inputClass !== 'SELF-AUTHORED-SYNTHETIC-ONLY') {
      issues.push(issue(`${plan.id} must remain synthetic-only with source methods unknown`))
    }
    if (plan.draftedOn !== '2026-08-20'
      || plan.evaluationLens !== request?.evaluationLens
      || plan.inputClass !== request?.requestedInputClass) {
      issues.push(issue(`${plan.id} must preserve the dated request lens and input class`))
    }
    if (plan.authorship?.exactTextHumanReviewed !== false || plan.authorship?.humanDirectionRecorded !== true) {
      issues.push(issue(`${plan.id} must preserve assisted-draft authorship truth`))
    }
    const envelope = plan.resourceEnvelope ?? {}
    for (const key of ['network', 'credentials', 'personalData', 'persistentWrites', 'shell', 'artifactFetch']) {
      if (envelope[key] !== false) issues.push(issue(`${plan.id} resourceEnvelope.${key} must remain false`))
    }
    if ((plan.fixtures?.length ?? 0) > envelope.maxCases) issues.push(issue(`${plan.id} fixture count exceeds its finite case bound`))
    if (!plan.fixtures?.every((fixture) => fixture.synthetic === true) || !plan.fixtures?.some((fixture) => fixture.heldOut === true)) {
      issues.push(issue(`${plan.id} fixtures must all be synthetic and include a held-out case`))
    }
    if (plan.reversibility?.externalEffects !== false || plan.reversibility?.cleanupRequired !== false) {
      issues.push(issue(`${plan.id} Phase-0 plan must have no external or cleanup effect`))
    }
    if (plan.rightsBlock?.state !== 'BLOCKED_PENDING_ITEM_RIGHTS_REVIEW'
      || plan.securityBlock?.state !== 'BLOCKED_PENDING_SECURITY_PREFLIGHT') {
      issues.push(issue(`${plan.id} must retain both rights and security blocks`))
    }
    if (plan.passingEffect !== 'RETAIN_FOR_SEPARATE_REVIEW_ONLY') {
      issues.push(issue(`${plan.id} can only retain evidence for separate review`))
    }
  }

  const laterGates = ['preflights', 'trialAuthorities', 'trialRuns', 'evaluationResults', 'adoptionRecords', 'useAuthorities']
  for (const gate of laterGates) {
    if ((snapshot[gate]?.length ?? -1) !== 0) issues.push(issue(`${gate} is deny-all and must remain empty in v0.1`))
  }
  for (const [key, value] of Object.entries(snapshot.boundaries ?? {})) {
    if (value !== false) issues.push(issue(`boundary ${key} must remain false`))
  }
  issues.push(...forbiddenVocabularyIssues(snapshot))
  return issues
}

export function snapshotIssues(snapshot, lock = loadObservatoryLock(), registry = loadSchemaRegistry()) {
  const issues = []
  issues.push(...schemaDocumentIssues(registry).map((entry) => `schema: ${entry}`))
  issues.push(...validateWithSchema(snapshot, 'public-snapshot.schema.json', registry).map((entry) => `schema: ${entry}`))
  issues.push(...phaseZeroIssues(snapshot, lock))
  return [...new Set(issues)].sort()
}

export function buildSnapshot(inputs = loadInputs()) {
  const snapshot = assembleSnapshot(inputs.config, inputs.collections)
  const issues = snapshotIssues(snapshot, inputs.lock)
  if (issues.length > 0) throw new Error(`Trial Chamber validation failed:\n${issues.map((entry) => `- ${entry}`).join('\n')}`)
  return snapshot
}

export function validateCheckedInSnapshot() {
  const snapshot = buildSnapshot()
  if (!existsSync(PUBLIC_SNAPSHOT)) return { snapshot, current: false, byteReceipt: null, canonicalReceipt: sha256Json(snapshot) }
  const bytes = readBoundedBytes(PUBLIC_SNAPSHOT)
  const expected = Buffer.from(prettyCanonicalJson(snapshot))
  return {
    snapshot,
    current: bytes.equals(expected),
    byteReceipt: sha256Bytes(bytes),
    canonicalReceipt: sha256Json(snapshot),
  }
}

export function writeSnapshot(inputs = loadInputs()) {
  const snapshot = buildSnapshot(inputs)
  const output = prettyCanonicalJson(snapshot)
  atomicWritePublicSnapshot(output)
  return {
    snapshot,
    bytes: Buffer.byteLength(output),
    byteReceipt: sha256Bytes(Buffer.from(output)),
    canonicalReceipt: sha256Json(snapshot),
    path: PUBLIC_SNAPSHOT,
  }
}

export const contracts = COLLECTIONS
export const expectedCounts = EXPECTED_COUNTS
export const expectedLockReceipt = EXPECTED_LOCK_RECEIPT
export const expectedObservatoryBinding = EXPECTED_OBSERVATORY_BINDING

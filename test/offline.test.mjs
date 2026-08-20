import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  PUBLIC_SNAPSHOT,
  ROOT,
  canonicalJson,
  prettyCanonicalJson,
  readJson,
  sha256Bytes,
  sha256Json,
} from '../src/io.mjs'
import {
  buildSnapshot,
  expectedLockReceipt,
  expectedObservatoryBinding,
  loadInputs,
  loadObservatoryLock,
  snapshotIssues,
  validateCheckedInSnapshot,
  writeSnapshot,
} from '../src/trials.mjs'

const QUESTIONS = [
  'On finite, self-authored MCP traces, can a declared intent-and-capability envelope identify pre-registered boundary violations that a minimal deny-by-default baseline misses, without changing allowed traces?',
  'Under one fixed audit budget, can a coverage-aware re-audit policy expose more planted change patterns across a finite synthetic registry than recency-only, score-only, or uniform baselines?',
  'Can a bounded interpretability-evidence protocol distinguish feature association, declared confounding, and absence of signal without promoting a sparse representation into an explanation of reasoning?',
]

test('deterministic Phase-0 build has exact separate gate counts and no effects', () => {
  const snapshot = buildSnapshot()
  assert.deepEqual(snapshot.counts, {
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
  assert.equal(Object.values(snapshot.boundaries).every((value) => value === false), true)
  assert.equal(snapshot.boundaries.automaticAction, false)
  assert.equal(snapshot.boundaries.scalarScoreUsed, false)
  assert.deepEqual(snapshotIssues(snapshot), [])
})

test('checked-in snapshot is exact canonical build bytes', () => {
  const snapshot = buildSnapshot()
  const bytes = readFileSync(PUBLIC_SNAPSHOT)
  assert.equal(bytes.toString('utf8'), prettyCanonicalJson(snapshot))
  assert.equal(sha256Bytes(bytes), 'sha256:15934c754fc7dd7ab4869c6b6c73a146b43255c1f402d06ffbc5caa59b6340b6')
  assert.equal(sha256Json(snapshot), 'sha256:4e518fe41cfd2cd579db64e6dd5ea9175a4fa387a93859cc331d195523c317d5')
  assert.equal(validateCheckedInSnapshot().current, true)
})

test('top-level record order cannot change deterministic output', () => {
  const inputs = loadInputs()
  const reversed = structuredClone(inputs)
  for (const records of Object.values(reversed.collections)) records.reverse()
  assert.equal(prettyCanonicalJson(buildSnapshot(inputs)), prettyCanonicalJson(buildSnapshot(reversed)))
})

test('exact Observatory projected lock is pinned to whole-snapshot evidence', () => {
  const lock = loadObservatoryLock()
  assert.equal(sha256Json(lock), expectedLockReceipt)
  assert.deepEqual({
    snapshotUrl: expectedObservatoryBinding.snapshotUrl,
    snapshotAsOf: lock.snapshotAsOf,
    snapshotByteSha256: lock.snapshotByteSha256,
    snapshotCanonicalReceipt: lock.snapshotCanonicalReceipt,
    captureSetReceipt: lock.captureSetReceipt,
  }, expectedObservatoryBinding)
  assert.equal(lock.works.length, 4)
  assert.equal(lock.works.flatMap((work) => work.observations).every((item) => /^sha256:[0-9a-f]{64}$/u.test(item.sourcePayloadReceipt)), true)
})

test('referrals preserve metadata—not scientific claims—and Role-Styled stays exactly held', () => {
  const snapshot = buildSnapshot()
  assert.equal(snapshot.referrals.every((record) => record.sourceTitleIsScientificClaim === false), true)
  assert.equal(snapshot.referrals.every((record) => record.sourceBinding.payloadReceiptsAreArtifactDigests === false), true)
  const held = snapshot.referrals.find((record) => record.id.includes('role-styled'))
  assert.equal(held.disposition, 'held-for-source-resolution')
  assert.equal(held.evaluationRequestId, null)
  assert.deepEqual(held.holdReasons, [
    'self-version-relation-unresolved',
    'supplement-target-absent-from-pinned-snapshot',
    'model-pin-absent',
    'method-pin-absent',
    'dataset-pin-absent',
    'artifact-pin-absent',
  ])
})

test('requests and plans preserve exact synthetic questions and truthful assisted authorship', () => {
  const snapshot = buildSnapshot()
  assert.deepEqual(snapshot.evaluationRequests.map((record) => record.evaluationQuestion).sort(), [...QUESTIONS].sort())
  assert.deepEqual(snapshot.evaluationPlans.map((record) => record.evaluationQuestion).sort(), [...QUESTIONS].sort())
  for (const record of [...snapshot.evaluationRequests, ...snapshot.evaluationPlans]) {
    assert.equal(record.authorship.origin, 'maintainer-authorized-assisted-draft')
    assert.equal(record.authorship.humanDirectionRecorded, true)
    assert.equal(record.authorship.exactTextHumanReviewed, false)
    assert.equal(record.authorship.compiledBy, 'codex-assisted-publication')
  }
})

test('plans are finite, reversible, blocked, DRAFT, UNSEALED, NO-RUN, and synthetic-only', () => {
  const snapshot = buildSnapshot()
  for (const plan of snapshot.evaluationPlans) {
    assert.equal(plan.planState, 'DRAFT')
    assert.equal(plan.sealState, 'UNSEALED')
    assert.equal(plan.noRunState, 'NO-RUN')
    assert.equal(plan.inputClass, 'SELF-AUTHORED-SYNTHETIC-ONLY')
    assert.equal(plan.sourceMethodsKnown, false)
    assert.equal(plan.passingEffect, 'RETAIN_FOR_SEPARATE_REVIEW_ONLY')
    assert.equal(plan.fixtures.length <= plan.resourceEnvelope.maxCases, true)
    assert.equal(plan.fixtures.every((fixture) => fixture.synthetic), true)
    assert.equal(plan.fixtures.some((fixture) => fixture.heldOut), true)
    assert.equal(['network', 'credentials', 'personalData', 'persistentWrites', 'shell', 'artifactFetch'].every((key) => plan.resourceEnvelope[key] === false), true)
    assert.equal(plan.reversibility.externalEffects, false)
    assert.match(plan.rightsBlock.state, /^BLOCKED_/u)
    assert.match(plan.securityBlock.state, /^BLOCKED_/u)
  }
})

test('read-only CLI exposes only validate, build, check, overview, and help', () => {
  const overview = spawnSync(process.execPath, ['src/cli.mjs', 'overview'], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(overview.status, 0, overview.stderr)
  const parsed = JSON.parse(overview.stdout)
  assert.equal(parsed.assistedRequestDrafts, 3)
  assert.equal(parsed.unsealedDraftPlans, 3)
  assert.equal(parsed.laterGateSchemas, 'deny-all-reserved-until-a-new-contract-version')

  for (const command of ['poll', 'fetch', 'run', 'execute', 'approve', 'sign', 'adopt']) {
    const result = spawnSync(process.execPath, ['src/cli.mjs', command], { cwd: ROOT, encoding: 'utf8' })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /unknown command/u)
  }
  const arbitraryOutput = spawnSync(process.execPath, ['src/cli.mjs', 'build', '--output', '/tmp/elsewhere'], { cwd: ROOT, encoding: 'utf8' })
  assert.notEqual(arbitraryOutput.status, 0)
  assert.match(arbitraryOutput.stderr, /unexpected argument/u)
  assert.equal(arbitraryOutput.stdout, '')
})

test('invalid build fails before the sole output is touched', () => {
  const before = readFileSync(PUBLIC_SNAPSHOT)
  const inputs = loadInputs()
  inputs.config.boundaries.automaticAction = true
  assert.throws(() => writeSnapshot(inputs), /validation failed/u)
  assert.deepEqual(readFileSync(PUBLIC_SNAPSHOT), before)
})

test('public output parses strictly and contains only the expected top-level contract', () => {
  const checked = readJson(PUBLIC_SNAPSHOT)
  assert.equal(canonicalJson(checked), canonicalJson(buildSnapshot()))
})

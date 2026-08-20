import assert from 'node:assert/strict'
import test from 'node:test'

import { canonicalJson } from '../src/io.mjs'
import { loadSchemaRegistry, validateWithSchema } from '../src/schema-validator.mjs'
import { buildSnapshot, loadObservatoryLock, snapshotIssues } from '../src/trials.mjs'

const baseline = buildSnapshot()
const lock = loadObservatoryLock()

function mutation(name, change, expected) {
  test(`fixture mutation rejects ${name}`, () => {
    const mutated = structuredClone(baseline)
    change(mutated)
    const issues = snapshotIssues(mutated, lock).join('\n')
    assert.match(issues, expected)
  })
}

mutation('source metadata title drift', (value) => {
  value.referrals[0].sourceMetadataTitle = 'Changed but plausible title'
}, /title differs from the projected lock/u)

mutation('source payload receipt drift', (value) => {
  value.referrals[0].sourceBinding.observations[0].sourcePayloadReceipt = `sha256:${'0'.repeat(64)}`
}, /source binding differs from exact projected lock fields/u)

mutation('observation time drift', (value) => {
  value.referrals[0].sourceBinding.observations[0].observedAt = '2026-08-20T18:09:57Z'
}, /source binding differs from exact projected lock fields/u)

mutation('canonical source URL drift', (value) => {
  value.referrals[0].sourceBinding.observations[0].canonicalUrl = 'https://example.invalid/changed'
}, /source binding differs from exact projected lock fields/u)

mutation('signal ID drift', (value) => {
  value.referrals[0].sourceBinding.signalIds[0] = 'signal:publication-link:0000000000000000'
}, /source binding differs from exact projected lock fields/u)

mutation('work ID drift', (value) => {
  value.referrals[0].sourceBinding.workId = 'work:00000000000000000000'
}, /absent from the reviewed Observatory projected lock/u)

mutation('whole-snapshot hash drift', (value) => {
  value.observatoryBinding.snapshotByteSha256 = `sha256:${'0'.repeat(64)}`
}, /Observatory binding differs/u)

mutation('exact synthetic question drift', (value) => {
  value.evaluationRequests[0].evaluationQuestion += ' Changed.'
}, /does not preserve the reviewed synthetic-only question/u)

mutation('human-review overstatement', (value) => {
  value.evaluationRequests[0].authorship.exactTextHumanReviewed = true
}, /assisted-draft provenance|declared constant/u)

mutation('plan sealing', (value) => {
  value.evaluationPlans[0].sealState = 'SEALED'
}, /must remain DRAFT, UNSEALED, and NO-RUN|declared constant/u)

mutation('network capability', (value) => {
  value.evaluationPlans[0].resourceEnvelope.network = true
}, /resourceEnvelope.network must remain false|declared constant/u)

mutation('source methods claimed known', (value) => {
  value.evaluationPlans[0].sourceMethodsKnown = true
}, /source methods unknown|declared constant/u)

mutation('cross-lens substitution', (value) => {
  value.evaluationPlans[0].evaluationLens = 'security-model-clarity'
}, /dated request lens|value is outside enum/u)

mutation('effect beyond separate review', (value) => {
  value.evaluationPlans[0].passingEffect = 'ADOPT'
}, /only retain evidence for separate review|declared constant/u)

mutation('expiry drift', (value) => {
  value.evaluationPlans[0].expiresAt = '2026-09-21T00:00:00Z'
}, /share the dated snapshot expiry/u)

mutation('extra Role-Styled hold', (value) => {
  const held = value.referrals.find((record) => record.id.includes('role-styled'))
  held.holdReasons.push('item-rights-unresolved')
}, /exactly the ordered six/u)

mutation('held referral advancement', (value) => {
  const held = value.referrals.find((record) => record.id.includes('role-styled'))
  held.evaluationRequestId = value.evaluationRequests[0].id
}, /held referral cannot point to a request/u)

mutation('post-plan record insertion', (value) => {
  value.preflights.push({})
  value.counts.preflights = 1
}, /array has too many items|declared constant|deny-all/u)

mutation('duplicate gate ID', (value) => {
  value.evaluationRequests[1].id = value.evaluationRequests[0].id
}, /repeats ID|globally unique/u)

mutation('generic active state field', (value) => {
  value.evaluationRequests[0].status = 'active'
}, /forbidden shared gate vocabulary|additional property is forbidden/u)

mutation('automatic action', (value) => {
  value.boundaries.automaticAction = true
}, /boundary automaticAction must remain false|declared constant/u)

mutation('scalar score', (value) => {
  value.boundaries.scalarScoreUsed = true
}, /boundary scalarScoreUsed must remain false|declared constant/u)

test('every deny-all schema rejects multiple plausible future-record shapes', () => {
  const registry = loadSchemaRegistry()
  const reserved = [
    'preflight.schema.json',
    'trial-authority.schema.json',
    'trial-run.schema.json',
    'evaluation-result.schema.json',
    'adoption-record.schema.json',
    'use-authority.schema.json',
  ]
  const candidates = [{}, { id: 'candidate' }, { schema: 'candidate', decision: 'DEFER' }]
  for (const schema of reserved) {
    for (const candidate of candidates) {
      assert.notEqual(validateWithSchema(candidate, schema, registry).length, 0, `${schema} accepted ${canonicalJson(candidate)}`)
    }
  }
})

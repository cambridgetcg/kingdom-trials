#!/usr/bin/env node

import { relative } from 'node:path'

import { ROOT, prettyCanonicalJson, sha256Json } from './io.mjs'
import {
  buildSnapshot,
  expectedLockReceipt,
  validateCheckedInSnapshot,
  writeSnapshot,
} from './trials.mjs'

const HELP = `KINGDOM Trial Chamber v0.1 (offline, no execution)

Usage:
  kingdom-trials validate   validate source records, schemas, lock, and semantics
  kingdom-trials build      deterministically write only public/trials.json
  kingdom-trials check      prove public/trials.json has exact current bytes
  kingdom-trials overview   print a read-only gate summary
  kingdom-trials help       print this help
`

function output(value) {
  process.stdout.write(prettyCanonicalJson(value))
}

function counts(snapshot) {
  return snapshot.counts
}

function requireNoArguments(rest) {
  if (rest.length !== 0) throw new Error(`unexpected argument(s): ${rest.join(' ')}`)
}

function main() {
  const [command = 'help', ...rest] = process.argv.slice(2)
  if (command === 'help' || command === '--help' || command === '-h') {
    requireNoArguments(rest)
    process.stdout.write(HELP)
    return
  }
  requireNoArguments(rest)

  if (command === 'validate') {
    const snapshot = buildSnapshot()
    output({
      state: 'valid-phase-0-projection',
      asOf: snapshot.asOf,
      expiresAt: snapshot.expiresAt,
      counts: counts(snapshot),
      snapshotCanonicalReceipt: sha256Json(snapshot),
      observatoryProjectedLockReceipt: expectedLockReceipt,
      networkUsed: false,
      artifactExecutionPerformed: false,
    })
    return
  }

  if (command === 'build') {
    const built = writeSnapshot()
    output({
      state: 'built-deterministic-phase-0-projection',
      path: relative(ROOT, built.path),
      bytes: built.bytes,
      counts: counts(built.snapshot),
      snapshotByteReceipt: built.byteReceipt,
      snapshotCanonicalReceipt: built.canonicalReceipt,
    })
    return
  }

  if (command === 'check') {
    const checked = validateCheckedInSnapshot()
    if (!checked.current) throw new Error('public/trials.json is absent or differs from the deterministic build')
    output({
      state: 'current-deterministic-phase-0-projection',
      path: 'public/trials.json',
      counts: counts(checked.snapshot),
      snapshotByteReceipt: checked.byteReceipt,
      snapshotCanonicalReceipt: checked.canonicalReceipt,
    })
    return
  }

  if (command === 'overview') {
    const snapshot = buildSnapshot()
    output({
      phase: '0-read-only-planning',
      asOf: snapshot.asOf,
      expiresAt: snapshot.expiresAt,
      onExpiry: snapshot.onExpiry,
      counts: counts(snapshot),
      advancedReferrals: snapshot.referrals.filter((record) => record.disposition === 'advanced-to-human-scoping').length,
      heldReferrals: snapshot.referrals.filter((record) => record.disposition === 'held-for-source-resolution').length,
      assistedRequestDrafts: snapshot.evaluationRequests.filter((record) => record.authorship.exactTextHumanReviewed === false).length,
      unsealedDraftPlans: snapshot.evaluationPlans.filter((record) => record.planState === 'DRAFT' && record.sealState === 'UNSEALED').length,
      laterGateSchemas: 'deny-all-reserved-until-a-new-contract-version',
      automaticAction: false,
      scalarScoreUsed: false,
    })
    return
  }

  throw new Error(`unknown command ${JSON.stringify(command)}\n\n${HELP}`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
}

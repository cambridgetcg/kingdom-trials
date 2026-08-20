# KINGDOM Research Trial Chamber

The Trial Chamber is a read-only planning projection between research
discovery and any future experiment. Phase 0 contains four exact referrals,
three maintainer-authorized assisted request drafts, and three plans that are
explicitly `DRAFT` and `UNSEALED`. Every later gate is empty.

The current machine projection will be published at:

- canonical snapshot:
  `https://thekingdom.dev/trials/research-trial-chamber-2026-08-20.json`
- current alias: `https://thekingdom.dev/trials.json`
- human view: `https://thekingdom.dev/trial-chamber/`
- public guide: `https://thekingdom.dev/TRIAL-CHAMBER-v0.1.md`

The producer source is intended to be pinned at
`https://github.com/cambridgetcg/kingdom-trials/tree/v0.1.1`. Public visibility
does not grant reuse rights; this package is `UNLICENSED`.

## Offline commands

```sh
npm test
npm run validate
npm run build
npm run build:check
npm run overview
```

There are no runtime dependencies. Node.js 20 or later is required. No command
makes a network request or executes a research artifact. `build` deterministically
and atomically writes only `public/trials.json`; `build:check` proves that the
checked-in bytes are current without writing.

## Public records

The snapshot keeps nine gate-specific arrays:

1. `referrals`
2. `evaluationRequests`
3. `evaluationPlans`
4. `preflights`
5. `trialAuthorities`
6. `trialRuns`
7. `evaluationResults`
8. `adoptionRecords`
9. `useAuthorities`

Each family has a separate closed Draft 2020-12 schema. Referrals, requests,
and plans use distinct vocabularies. The six later-gate schemas are deny-all
reserved contracts, so v0.1 cannot represent those records at all. The
snapshot is the tenth closed schema. Its counts are checked against the arrays
and its references are checked as an acyclic, forward-only gate graph.

The request and plan text was compiled by Codex under the maintainer's explicit
direction; its exact wording has not yet been separately human-reviewed. That
provenance is machine-visible and is one reason every plan remains unsealed.

The four referrals are bound to one immutable Observatory byte hash, one
canonical JSON receipt, its exact `asOf`, its capture-set receipt, and exact
work, observation, and signal IDs. Those bindings make drift visible; the
build never silently follows a mutable feed.

`data/observatory-lock.json` is an exact four-work projected lock derived from
the reviewed Observatory snapshot. Its canonical receipt is independently
pinned in the producer code, while the whole external Observatory is bound by
its byte SHA-256 and canonical JSON receipt. The producer validates every
published title, identifier, observation time, canonical URL, source payload
receipt, and signal against that projected lock. It does not claim to
recompute the whole 244,699-byte Observatory snapshot. KINGDOM-OS integration
independently performs that full-snapshot projection check against its exact
checked-in Observatory bytes.

See [TRIAL-CHAMBER.md](./TRIAL-CHAMBER.md) for the gate semantics and future
phase boundaries.

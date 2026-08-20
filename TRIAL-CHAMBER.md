# Trial Chamber v0.1

## What Phase 0 does

Phase 0 turns four selected Observatory records into source-bound referrals.
Codex compiled three assisted request drafts and bounded plan drafts under the
maintainer's explicit direction. Their exact wording has not yet been separately
human-reviewed. This is planning evidence only.

The source title is preserved under `sourceMetadataTitle`. It is not parsed as,
or represented as, a scientific claim. Every `evaluationQuestion` is assisted
draft text for synthetic-only scoping and is not attributed to the observed
work.

The Role-Styled Prompt Injection referral remains held. The Observatory record
contains an `is-version-of` relation that points to its own DOI and an
`is-supplement-to` relation whose target is not resolved in the pinned
snapshot. Advancing it would hide a source-identity uncertainty.
No model, method, dataset, or executable artifact pin is present either, so
six explicit holds remain machine-visible.

## Gate sequence

```text
Observatory metadata
  -> referral
  -> maintainer-authorized assisted evaluation request draft
  -> DRAFT + UNSEALED evaluation plan
  -> future preflight
  -> future trial authority
  -> future bounded run
  -> future evidence result
  -> future adoption decision
  -> future expiring use authority
```

No record inherits the power of the next gate. A result cannot create an
adoption. An adoption cannot create use authority. A module candidate and a
guest candidate require different future contracts.

## Current evaluation lenses

- **Semantic Zero-Trust:** compare a frozen intent-and-capability envelope with
  a minimal deny-by-default baseline on five finite self-authored MCP traces.
- **MCP registry drift:** compare four equal-budget re-audit policies on frozen
  finite synthetic registries with planted changes across declared strata.
- **Thinking vs. NoThinking:** apply a bounded evidence vocabulary to three tiny
  self-authored matrices: planted association, declared confounding, and null.

These are synthetic protocol questions, not reconstructions of source methods,
summaries, scientific claims, or endorsements. Source methods are unknown.

## What a future preflight must establish

A separately authored preflight would have to pin artifact identity and
receipts; establish item-level rights; identify hostile-instruction and supply
chain risks; specify data, privacy, compute, network, and writable-path bounds;
verify controls and stop conditions; and identify an accountable operator.
Phase 0 does none of that work.

## Later phases require separate authority

All six post-plan v0.1 schemas are deny-all reserved contracts: v0.1 cannot
represent a preflight, authority, run, result, adoption, or use record. A new
contract version is mandatory before any such record can exist. A later phase
may introduce an external, capability-bounded runner only after that stronger
contract and a specific trial authority exist. Results, adoption records,
module engineering, guest admission, and use authority each remain separately
proposed future work. Credentials, signatures, approval services, artifact
acquisition, and execution do not belong in this producer.

## Security properties

Inputs are local regular files beneath the repository root. Reads reject
symbolic-link components, invalid UTF-8, duplicate JSON object keys, excessive
bytes, excessive nesting, and excessive node or collection counts. Schemas are
closed. Semantic validation checks gate references, exact Observatory binding,
hold behavior, empty later gates, non-authorizing boundary flags, and forbidden
scalar gate vocabulary. The output is canonical pretty JSON with a stable
SHA-256 receipt.

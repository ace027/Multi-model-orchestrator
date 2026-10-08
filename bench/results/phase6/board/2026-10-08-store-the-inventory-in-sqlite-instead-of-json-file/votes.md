# Board Votes — Store the inventory in SQLite instead of JSON files

**Date**: 2026-10-08

## Individual Votes

### Vote: App Store Optimizer
- Verdict: REJECT
- Confidence: 0.85
- Conditions: To move to approve, the user would have to name a concrete driver for SQLite, such as concurrent writers, audit history or thousands of SKUs. PROJECT.md would then be amended first, covering the core value and the "Persistence other than JSON" out-of-scope line. The change would need to keep JSON import and export, or JSON as the default. It would also need a defined exit-2 behavior for bad files, and it would have to land as a later milestone. Phase 2 stays on JSON as planned. If durability is the worry, atomic JSON saves (temp file, then `os.replace`) are the in-scope fix.

This vote rests on the Phase 1 assessments and the Round 1 discussion. I did not re-read the repository.

### Vote: LSP/Index Engineer
- Verdict: REJECT
- Confidence: 0.85
- Conditions: None to approve as scoped. I would change my vote only if all of the following happen:
  1. The user names a concrete driver, such as scale, concurrent writers, or audit history, that atomic JSON saves (temp file, then `os.replace`) cannot meet.
  2. PROJECT.md is amended first. That means the core value ("from one JSON file") and the out-of-scope line ("Persistence other than JSON").
  3. SQLite is scheduled as a new milestone, not folded into Phase 2.
  4. Storage sits behind a small interface, with JSON import and export kept.
  5. The STOCK-02 loader contract and the exit-2 bad-file semantics are redefined explicitly. This includes what FILE means in CLI-01.

The board agrees that no driver has been stated. SQLite's real advantage is crash safety, and atomic JSON writes give that at a fraction of the cost. They also leave the validated Phase 1 work and the planned Phase 2 intact. The user should own the amendment decision, and the orchestrator should ask for the driver before any storage change is planned.

### Vote: Mobile App Builder
- Verdict: REJECT
- Confidence: 0.8
- Conditions: To move to approve, all of the following would need to happen:
  1. The user names a concrete driver, such as concurrent writers, audit history or a large SKU count, that JSON with atomic saves cannot meet.
  2. PROJECT.md is amended first. That means the core value ("from one JSON file") and the out-of-scope line ("Persistence other than JSON") are both changed explicitly.
  3. The STOCK-02 loader tests are kept valid. JSON stays the default, with import and export. The CLI-01 FILE meaning and the exit-2 bad-file semantics are defined before any work starts.
  4. Phase 2 is replanned on purpose, not patched.

Reasoning: No driver has been stated, and none of the board found one. SQLite does have a real benefit, crash-safe writes. Atomic JSON saves (temp file, then `os.replace`) deliver the same safety at far lower cost, so they are the in-scope fix if durability is the worry. The change would also contradict the project's own documented scope, reopen validated STOCK-02 and reverse an adopted decision. I am not recommending an optional backend or storage interface on the roadmap, because that would be speculative abstraction.

## Tally

| Metric | Count |
|--------|-------|
| Approve | 0 |
| Reject | 3 |
| Abstain | 0 |
| Effective Board Size | 3 |

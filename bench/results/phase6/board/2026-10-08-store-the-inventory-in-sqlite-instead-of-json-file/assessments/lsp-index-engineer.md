## Assessment: LSP/Index Engineer
### Verdict: REJECT
### Score: 3/10

### Evaluation (by lens):
- protocol-compliance: 3/10 — The "protocol" here is the project's own contract: the core value ("from one JSON file"), the out-of-scope line ("Persistence other than JSON") and the Adopted decision (plain dict, JSON round-trip). The proposal violates all three without amending them. The format is also public API, because FILE in CLI-01 changes meaning. sqlite3 is stdlib, so the technical constraint is met, but the governance constraints are not.
- graph-consistency: 4/10 — SQLite would give real integrity: a PRIMARY KEY on SKU and a CHECK (qty >= 0) would enforce "exactly one record per SKU" and reject over-removal at the storage layer. But STOCK-01 already enforces these rules in code, so the gain is duplicated, and two sources of truth (dict and table) can drift. The validated STOCK-02 loader would need rework, which risks regressing Phase 1.
- query-performance: 2/10 — REPORT-01 is a threshold filter with a sort by level then SKU. On small data a dict plus `sorted()` is effectively instant. SQLite's `WHERE qty <= ? ORDER BY qty, sku` with an index only pays off at tens of thousands of rows or more. No scale evidence was given, and connection and open overhead make a one-shot CLI slightly slower.
- incremental-updates: 4/10 — SQLite transactions would give atomic, crash-safe writes and concurrent access, which a rewritten JSON file cannot offer. That is the real argument for the change, but nobody has said it is needed. There is no concurrency, history or multi-writer requirement. A JSON write via temp file plus `os.replace` gets atomicity at a fraction of the cost.

### Red Flags:
- It contradicts an explicit out-of-scope line and the core value statement.
- It reopens an Adopted decision and a validated requirement with no justification.

### Concerns:
- Phase 2 is already planned in 2 waves around the JSON/dict model, so the plans would be invalidated.
- Human-readable, diffable, single-file JSON is the product's selling point, and a binary database loses it.
- A migration path for existing JSON files is unspecified.
- The change expands scope in a "tiny" library.

### Recommendations:
- Finish Phase 2 as planned on JSON.
- If durability is the motive, add atomic JSON saves (temp file, then `os.replace`).
- If SQLite is wanted later, make it an explicit new milestone. Amend PROJECT.md first, keep JSON import and export, and put storage behind a small interface.
- Ask the user for the concrete driver: scale, concurrency or history.

### Questions for Other Board Members:
- Does anyone see a stated need, such as scale, concurrent writers or audit history, that I have missed?
- Should the out-of-scope line be revisited formally before any storage change is considered?

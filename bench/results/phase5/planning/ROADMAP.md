# Invlib — Roadmap

## Phases

- [x] Phase 1: Stock Core (1 plan)
- [x] Phase 2: Reporting (2 plans)

---

## Phase Details

### Phase 1: Stock Core
**Goal**: Stock levels per SKU with validation, loaded from JSON
**Requirements**: STOCK-01, STOCK-02
**Recommended Agents**: engineering-senior-developer
**Success Criteria**:
- Adding and removing stock works and invalid quantities raise StockError
- Stock.load reads a JSON file

### Phase 2: Reporting
**Goal**: Low-stock report and a command line to print it
**Requirements**: REPORT-01, REPORT-02, CLI-01
**Recommended Agents**: engineering-senior-developer, engineering-backend-architect
**Success Criteria**:
- low_stock returns SKUs at or below the threshold, sorted by level then SKU
- `python -m invlib.cli report sample.json --threshold 5` prints NUT and WASHER
- A missing or malformed file exits with code 2 and a one-line error

## Progress

| Phase | Plans | Completed | Status | Reviewed |
|-------|-------|-----------|--------|----------|
| 1 — Stock Core | 1 | 1 | Complete | yes |
| 2 — Reporting | 2 | 2 | Complete | — |

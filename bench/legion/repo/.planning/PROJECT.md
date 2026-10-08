# Invlib

## What This Is

A tiny Python inventory library: stock levels per SKU, low-stock reports and a command line.

## Core Value

Know what to reorder, from one JSON file.

## Requirements

### Validated

- STOCK-01: Add and remove stock per SKU, rejecting non-positive quantities and over-removal
- STOCK-02: Load stock levels from a JSON file

### Active

- REPORT-01: List SKUs at or below a threshold, sorted by level then SKU
- REPORT-02: Format a plain-text report
- CLI-01: `python -m invlib.cli report FILE --threshold N` prints the report; exit 2 on a bad file

### Out of Scope

- Persistence other than JSON

## Constraints

- Python 3 standard library only; tests with unittest

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Plain dict for levels | Small data, JSON round-trips | Adopted |

---
*Last updated: 2026-09-30 after Phase 1*

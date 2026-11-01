---
description: Read-only quality audit of a repo or folder (bugs, security, scale, missing tests, speed, what to delete or merge), ranked, in plain English; changes nothing
argument-hint: "[path] [--save]"
---
Audit the code like the senior developer who just inherited it and will be paged when it breaks. Arguments: $ARGUMENTS

Load the tools: ToolSearch with query `select:mcp__triad__persona_run,mcp__triad__map`. This audit changes no code, no STATE.md and no ROADMAP.md.

1. Scope: the path in the arguments, else the whole repo. Find the expected load (README, deploy config): one person running a script, or many users and processes at once.
2. Map: if `.planning/CODEBASE.md` exists, read it and call map action `check` (say so if it is stale). Otherwise list the source files with `git ls-files` (a helper for a big tree). Do not read the code yourself.
3. Split by area, not by topic, so no file is read twice: up to 40 source files is one area; larger scopes get up to 3 areas, by where a mistake costs the most (input from users, money, auth, data writes, background jobs, shared state first). Name the parts you leave out.
4. Call persona_run once (read_only true), one run per area, all with agent `engineering-senior-developer`, label `audit-<area>`. Each brief: the area's files and entry points, the expected load, and these rules:
   - Read the entry points and trace the main flows end to end: where data comes in, what is stored, what goes out.
   - Look for, in this order: bug (wrong result, crash, missed edge case, callers that disagree with a function); risk (injection, weak randomness, secrets in code, unchecked user input, swallowed errors, writes in the wrong order); scale (check-then-write races, work repeated by every process, lists that only grow, a query per item, O(n^2) on big input); missing test (risky logic with no test that fails when it breaks); speed (big slowdowns); lean (delete dead code and unused options; reuse a helper the repo already has, naming its path; the standard library or platform already does it; an abstraction with one implementation; near-copies that must change together; one function doing unrelated jobs).
   - Every finding needs a concrete case: this input or situation leads to this wrong result. No case, no finding. Before calling code unused, grep the whole tree for it, including tests, config and string references. A `shortcut:` comment that names its limit is a decision, not a finding, unless the expected load crosses it. No style taste, no "consider".
   - Propose the smallest fix; prefer fixes that delete code.
   - Answer with at most 10 findings, each: title, `file:lines`, group (must fix: bug, security, data loss, breaks at the expected load; should fix: risky code without a test, real slowness, duplication, mixed jobs, code that should not exist; nice to have), and four parts of one or two short sentences: What this is, Problem, Fix, If we skip it. Then `Lean: -N lines possible` and `Not checked:`.
5. Merge the answers yourself: drop duplicates and findings without a concrete case, rank most important first, at most 20 (say how many smaller ones you left out). Do not re-read the code to second-guess a finding; when two answers disagree, say so.
6. Report in very simple English, short sentences, everyday words; explain a technical term the first time it is used:
   - `What this repo does:` two or three sentences, and the load you assumed.
   - The findings in groups **Must fix**, **Should fix**, **Nice to have** (skip empty groups), numbered across groups so the user can say "fix 2 and 5", each with its title, location and the four parts.
   - `Verdict:` healthy, or what to fix first. `Lean: -<N> lines, -<M> dependencies possible.` when there are lean findings. `Not checked:` the parts nobody read or could not run.
   - Nothing found: `What this repo does:`, then `Healthy. Nothing to fix.` and one line on what was checked.
   - Add one line: `/triad debt` lists the known shortcuts.
7. `--save`: write the report to `.planning/AUDIT.md` (or `AUDIT.md` when there is no `.planning/`). To fix findings, the user runs `/triad:quick` with their numbers.

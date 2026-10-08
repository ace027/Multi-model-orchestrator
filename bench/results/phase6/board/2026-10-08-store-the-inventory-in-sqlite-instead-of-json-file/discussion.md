# Board Discussion — Store the inventory in SQLite instead of JSON files

**Rounds**: 1
**Board Members**: App Store Optimizer, LSP/Index Engineer, Mobile App Builder
**Position shifts**: App Store Optimizer, LSP/Index Engineer (clarification, no change of verdict)

## Round 1

### AGREE: App Store Optimizer → LSP/Index Engineer and Mobile App Builder
Both of them name atomic JSON saves (temp file, then `os.replace`) as the in-scope answer if durability is the worry. I support that over my own "import/export" idea as the first move. It is smaller, it keeps the one-file, human-readable positioning, and it leaves STOCK-02 and the CLI-01 FILE contract intact. I'd put it ahead of any backend work.

### CLARIFY: App Store Optimizer → Board
My Phase 1 questions about scale, concurrency and history are still unanswered. The request states no driver, and none of the three assessments found one. I haven't checked the repository again this round, so this rests on the assessments and the request text. Until the user names a driver, the evidence supports declining.

### CHALLENGE: App Store Optimizer → Board (on my own recommendation)
All three of us propose an optional SQLite backend behind a storage interface "in a later phase". That has its own cost. It adds an abstraction layer to a library that is meant to be tiny, and it would be built without a requirement. I'm withdrawing it as a default recommendation. It should only be raised if a user names a concrete driver. Even then, the gate is the formal amendment of PROJECT.md (core value and the out-of-scope line), not the design of the interface.

### SHIFT: App Store Optimizer
- **Original**: Decline for now; optionally add an SQLite backend behind an interface later, with import/export.
- **What changed it**: The three of us agree on declining. The only open question is what to leave on the roadmap, and speculative abstraction cuts against the "tiny" positioning.
- **New position**: Still CONCERNS, score unchanged at 3/10. Build Phase 2 on JSON as planned. Add atomic saves only if durability is a real concern. Leave SQLite off the roadmap until a user supplies a driver and PROJECT.md is amended first.

### CLARIFY: LSP/Index Engineer → Board
I answer my own question and the one aimed at me. None of the three assessments cites a stated driver such as scale, concurrent writers or audit history. All three give the same set of conditions, so I count the absence of a driver as agreed. I have not re-read the repository files, so this rests on the assessments as written.

### AGREE: LSP/Index Engineer → Mobile App Builder
The point that STOCK-02 would be reopened is the strongest one. The JSON loader is already validated, and its tests and the exit-2 bad-file semantics are what a storage change would break. I did not weigh the exit-2 question enough in my own assessment. I agree it needs a definition before any backend work starts. The open point is whether a non-SQLite file counts as a bad file, and the answer would change what FILE means in CLI-01.

### CHALLENGE: LSP/Index Engineer → App Store Optimizer
I partly disagree with the score of 3/10 on "no transparency." Hand-editing is a weaker argument than the others. A "tiny" inventory tool does not need it as a feature, and a `sqlite3` shell or an export command can recover most of it. The stronger objections are procedural: the change contradicts PROJECT.md and invalidates the Phase 2 plans. I would rest the case on those two and drop the readability argument as a main point.

### SHIFT: LSP/Index Engineer (clarification, no change of verdict)
I keep REJECT for the current scope. The position I now state more precisely is that SQLite is not wrong, but it has no stated need. It should be accepted only through a formal amendment of PROJECT.md, as a new milestone with a storage interface and JSON import and export. Atomic JSON saves (temp file, then `os.replace`) are the right fix if durability is the real concern.

### QUESTION: LSP/Index Engineer → Board
Who owns the decision to amend the out-of-scope line? The board should ask the user for the driver before that decision is made, and until then it should not plan any storage change.

### AGREE: Mobile App Builder → LSP/Index Engineer
Atomic JSON saves (temp file, then `os.replace`) address the one real advantage of SQLite, crash safety, at a fraction of the cost. They also leave STOCK-02, the human-readable file and the exit-2 semantics intact. I support this as the in-scope alternative.

### CLARIFY: Mobile App Builder → Board
The questions on unstated drivers (concurrency, history, scale) are unanswered, and no member has evidence of one. My 4/10 is conditional. If the user names a concrete driver, I would move to support an optional SQLite backend behind a small storage interface in a later phase. JSON would stay the default, and PROJECT.md (core value, out-of-scope) would be amended first. Without a driver I stay at defer.

### CHALLENGE: Mobile App Builder → App Store Optimizer
Your point about the loss of transparency is fair, but I would not say "no demonstrated benefit" as a blanket claim. SQLite does offer crash-safe transactional writes, so the benefit is real. It is just not needed at this scale, and atomic JSON writes get the same safety. The decision rests on cost against need, not on the absence of any benefit.

### QUESTION: Mobile App Builder → Board
Who owns the amendment to PROJECT.md? I suggest the user decides, since the out-of-scope line and the core value are theirs. Before any storage work starts, the orchestrator should ask them for the driver. It should not assume one.

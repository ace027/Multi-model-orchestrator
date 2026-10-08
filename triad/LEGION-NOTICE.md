# Legion notice

Triad's `.planning/` workflow (the `/triad:*` commands and `hooks/legion/`) is a port of Legion's core workflow. Derived material:

- `personas/*.md` and `hooks/legion/personas.ts`: distilled from Legion's `agents/*.md`. Each file names its source.
- `hooks/legion/data.ts`: Legion's schemas (plan, summary, finding, outcome, settings), its PROJECT/ROADMAP/STATE templates, default settings, control modes, review rubrics and domain map.
- `hooks/legion/personasfull.ts`: Legion's full persona bodies, used when `execution.agent_personality_verbosity` is `full`.
- `hooks/legion/execdata.ts`: Legion's escalation protocol and agent-communication defaults (escalation format, control-mode behaviors, resolution statuses, SUMMARY sections).
- `hooks/legion/configdata.ts`: Legion's intent-teams and roster-gap configuration.
- File layout, frontmatter fields, commit message formats and the review triage rules follow Legion's so that existing Legion projects load unchanged.

`scripts/gen_legion.ts` and `scripts/gen_legion_exec.ts` regenerate the derived files from a Legion checkout. Legion's scripts were not copied or run; its logic was reimplemented.

Legion (`@9thlevelsoftware/legion` 8.0.6, https://github.com/9thLevelSoftware) is distributed under the MIT License, Copyright (c) 9thLevelSoftware:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

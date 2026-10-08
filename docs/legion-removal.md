# Removing Legion

SPEC section 6: remove Legion only after Triad matches it on the benchmark (`bench/run_phase7.sh`, results in `docs/results.md`). These steps run on your machine, where Legion is installed. Triad does not need Legion installed: it embeds the personas, templates and data it took from Legion, and it reads Legion's `.planning/` projects as they are.

## 1. Find every install

Legion installs per runtime, globally or per project, and writes a manifest each time.

- Global: `~/.claude/legion/manifest.json`
- Per project: `<project>/.claude/legion/manifest.json`

```
ls ~/.claude/legion/manifest.json
find ~ -path '*/.claude/legion/manifest.json' -not -path "$HOME/.claude/*" 2>/dev/null
```

Legion also supports other CLIs (Codex, Kiro, and others). Triad replaces only the Claude Code install; leave the others alone unless you also stop using Legion there.

## 2. Check what depends on it

- **Your projects' instructions.** Search for references to Legion's commands: `grep -rn "/legion:" ~/.claude/CLAUDE.md <projects>/CLAUDE.md <projects>/.github`. Change each to its `/triad:` equivalent (`docs/commands.md`). The command names match, except `/legion:validate` and `/legion:status`, which are `/triad validate` and `/triad status`, and `/legion:update`, which is `claude plugin update`.
- **Scripts and CI** that call `npx @9thlevelsoftware/legion` or Legion's scripts.
- **Settings hooks.** Look in `~/.claude/settings.json` and each project's `.claude/settings.json` for hooks that run Legion files.
- **Planning data.** Nothing to do: `.planning/` stays where it is, and Triad reads and writes it without migration. Run `/triad validate` and `/triad status` in each Legion project to confirm.
- **The portfolio registry.** `~/.claude/legion/portfolio.md` is shared: Triad's `/triad:portfolio` reads the same file. Back it up before uninstalling (`cp ~/.claude/legion/portfolio.md ~/portfolio.md.bak`), and put it back afterwards if it is gone.

## 3. Uninstall

With Legion's own uninstaller, which removes only what its manifest lists and restores any agent file it replaced:

```
npx @9thlevelsoftware/legion --claude --uninstall            # global
cd <project> && npx @9thlevelsoftware/legion --claude --local --uninstall   # each project install
```

It removes Legion's 49 agent files from `~/.claude/agents/`, `~/.claude/commands/legion/`, and `skills/`, `adapters/` and the manifest under `~/.claude/legion/`. If you would rather remove them by hand, the manifest lists the agent files.

## 4. Confirm

1. Start Claude Code and check that no `/legion:` commands are listed.
2. Install Triad if you have not (`triad/README.md`), and run `/triad status` in a Legion project.
3. Check that `~/.claude/legion/portfolio.md` is still there if you use the portfolio.

## What Triad does not carry over

`PARITY.md` lists every Legion feature. The ones marked Not applicable are Legion's runtime adapters and installer for other CLIs, the Codex bridge skill, and cross-CLI dispatch (Gemini, Codex, Copilot). If you rely on any of them, say so before uninstalling: SPEC section 6 asks for any Legion behaviour you still want to be ported as an agent or command.

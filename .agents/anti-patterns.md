# Anti-Patterns

Hard constraints for all agents working on UI Glitch Hunter. These are non-negotiable.

## Workflow Anti-Patterns

- **Implementing without accepted criteria** — Always get explicit user approval on what "done" means before writing code. Use Given/When/Then format.
- **Implementing without a shared design concept** — Resolve the important design decisions first and capture them in `.agents/plans/<feature-slug>.md`.
- **Skipping the planning stage** — Stage 1 exists to avoid wasted implementation effort. Never jump straight to code.
- **Treating built-in skill listings as exhaustive** — When the user invokes a slash command, load the project-local skill from `.codex/skills/`, `.claude/skills/`, or `.antigravity/skills/` before acting. Local slash-command rules are the workflow contract.
- **Ignoring the glossary or module map when they exist** — Shared language and module boundaries are part of the source of truth for future changes.
- **Allowing term drift** — If the code, docs, and conversations start using different names for the same concept, update the ubiquitous language before proceeding.
- **Committing without running tests** — `npm test` must pass before any commit. No exceptions.
- **Creating commits without user review** — Stage 2.5 human review is mandatory. Never skip it.
- **Switching branches without explicit approval** — Implementation approval is not branch-switch approval. Present the proposed branch operation and wait before running `git checkout`, `git switch`, or equivalent.
- **Letting unrelated dirty files enter scope** — Record the dirty-worktree baseline before staging. Do not stage scaffold refreshes, generated assets, or local edits that were already dirty unless the user explicitly approves that scope.
- **Letting commit messages drift from staged contents** — A semantic commit message must describe every staged change. If migrations, generated assets, or unrelated files are staged, either split the commit or ask the user to approve the broader scope.
- **Force-pushing or hard-resetting** — These are destructive. Ask the user first.
- **Bypassing hooks** — Never run `git commit --no-verify` — it skips the beads task handoff.
- **Creating task-tracking noise** — Do not create Beads tasks for discussion, read-only inspection, retros, or task-management bookkeeping. One coherent body of work gets one task; follow-ups are only for separate future work.
- **Treating scaffold presence as proof that tooling is ready** — Generated files and hook scripts are not the same thing as a bootstrapped local tool state. Verify operational readiness explicitly.
- **Ending tracked-file work without a commit message handoff** — If git-tracked files changed, the handoff must include a meaningful, high-signal conventional commit message.
- **Over-closing exploratory prompts** — When the user is running a thought exercise, guessing game, or design probe, do not rush from sparse evidence to one precise answer. Start with calibrated broad hypotheses, visible uncertainty, and a small steering question.

## Code Quality Anti-Patterns

- **Implementing beyond the acceptance criteria** — Do exactly what was agreed. Extra features introduce risk and aren't reviewed.
- **Duplicating code instead of reusing** — Explore `src` for existing implementations before writing new ones.
- **Growing shallow modules by default** — Prefer a smaller number of deeper modules with simple interfaces over many thin layers with leaky boundaries.
- **Changing module internals without checking the public interface** — Design the boundary first, then verify behavior through that boundary.
- **Adding error handling for impossible cases** — Only validate at system boundaries. Don't guard against things that can't happen.
- **Writing comments that describe what the code does** — Well-named identifiers already do that. Only comment the non-obvious *why*.
- **Leaving debug code, TODO markers, or dead code** — Clean up before the commit stage.

## Testing Anti-Patterns

- **Skipping tests "because it's simple"** — Tests catch issues humans miss. No feature is too small to test.
- **Skipping the red phase** — Write the failing test or other observable check first so you know the change is necessary.
- **Outrunning feedback loops** — Do not batch large code drops before running the fastest available typecheck, lint, browser, or test loop.
- **Treating optional feedback loops as optional thinking** — If `npm run typecheck`, `not configured`, or `npm run test:e2e` is configured, use it.
- **Testing implementation details** — Test observable behavior, not internal structure.
- **Testing below the module boundary by default** — Prefer interface-level tests unless the risk truly lives inside the module.
- **Mocking what you don't own** — Prefer real integrations at system boundaries when feasible.
- **Making infrastructure green by weakening the guardrail** — For infrastructure, deployment, configuration, or YAML-heavy changes, the red phase should prove unsafe state is rejected before mutation. Do not remove or relax a preflight, plan check, secret check, ingress check, or fail-loud message just to make a deployment pass.

## Operations Anti-Patterns

- **Drifting off a monitoring mission** — When the user asks you to monitor, babysit, follow through, or see a deployment through, do not let adjacent cleanup, planning, or interesting side investigations replace the watched run. Handle blockers and repo-side fixes, then return to the monitored run until terminal success or a clearly named blocker.

---

*This file is updated by the `/retro` skill. New entries are added when patterns are discovered through retrospectives.*

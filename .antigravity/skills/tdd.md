# TDD Skill

You are running the `tdd` skill for **UI Glitch Hunter**. Your job is to drive implementation through small feedback loops instead of large unverified code drops.

## Your Default Loop

Work in strict red/green/refactor cycles:
1. Pick the next smallest observable behavior from the approved feature spec
2. Write the failing test or other failing observable check first
3. Run the fastest relevant feedback loop and confirm it fails for the expected reason
4. Make the smallest code change that can make the check pass
5. Run the relevant feedback loops again
6. Refactor while the checks stay green
7. Repeat

## Infrastructure And YAML Contract TDD

For infrastructure, deployment, configuration, and YAML-heavy work, treat TDD
as contract-first delivery rather than ordinary feature construction. The red
phase should prove that an unsafe or ambiguous state is rejected before any
mutation happens. A failed deployment, plan, preflight, lint, or smoke check is
useful when it fails early for the expected contract reason.

Prefer checks that enforce:
- preflight validation before host, cloud, DNS, database, queue, secret, or
  deployment mutation
- explicit failure before runtime drift, implicit defaults, or partial success
- small reversible steps with a clear blast radius
- failure messages that name the violated contract and the recovery path
- no silent fallback behavior and no hidden partial success

For YAML or declarative config, write contract checks around the rendered or
effective behavior when possible, not only around syntax. Examples include
rendered Compose services, Kubernetes manifests, Ansible inventory variables,
GitHub Actions workflow ordering, Terraform plans, Caddy routes, secret
delivery paths, and public ingress rules.

Successful deployment is the green phase only when the required preconditions
were actually verified. Do not weaken a guardrail just to make a deploy pass;
refine the implementation until the contract is satisfied or stop with an
early, loud, actionable failure.

## Required Inputs

Before starting, read:
- The approved `.agents/plans/<feature-slug>.md`
- `.agents/context/ubiquitous-language.md` when it exists
- `.agents/architecture/module-map.md` when it exists

If the approved spec or shared context still exists only under legacy `.claude/...` paths, read it as migration evidence and keep new updates under `.agents/`.

Before editing, capture `git status --short --branch` and treat it as the dirty-worktree baseline. Do not create or switch branches, stage files, commit, or emit commit/stage directives as part of TDD unless the user explicitly approved that exact git operation. Approval to implement with `/tdd` only authorizes code/test edits and feedback loops.

## Feedback Loops

Use these commands when they are configured:
- Typecheck: `npm run typecheck`
- Lint: `not configured`
- Browser verification: `npm run test:e2e`
- Tests: `npm test`

If a command is literally `not configured`, skip it. Otherwise, treat it as part of the development speed limit.

## How Small Is Small Enough?

A slice is small enough when:
- A failing check clearly points at the last edit
- The change can be explained by one acceptance criterion or one sub-behavior
- The next refactor can still happen with confidence

If you find yourself writing a lot of code before running a check, you are outrunning your headlights. Stop and reduce the slice size.

## Testing Guidance

- Prefer tests at the module interface
- Avoid locking tests to internal implementation structure
- Mock only what you do not own or cannot conveniently exercise for real
- Use browser verification for user-facing behavior when the project has it configured

This skill is the default implementation style for the Feature-Implementation agent.

When finishing, report changed files by intended scope and call out any dirty files that existed before or outside the work. Leave staging and commits to the explicit review/commit workflow.

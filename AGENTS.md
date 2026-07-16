# WinSight agent contract

This repository uses file-backed project state. Chat context is never the source of truth.

Before changing code, documentation, Git state, releases, or installation state:

1. Read `docs/WORKFLOW_GUARDRAILS.md`.
2. Read `docs/PROJECT_STATUS.md`, `docs/CURRENT_TASK.md`, `docs/ROADMAP.md`, and `docs/ACCEPTANCE.md`.
3. Read the latest relevant entry in `docs/DECISION_LOG.md` and `docs/COMPLETED.md`.
4. Run `git status --short` and inspect relevant diffs.
5. Run `python scripts/check_project_docs.py`.

Keep exactly one current task. Its active state is normally `IN_PROGRESS`, but may be `NEEDS_USER_ACCEPTANCE`, `BLOCKED`, or `DEFERRED` when no implementation should proceed. Do not start a roadmap item until `CURRENT_TASK.md` names it. Record automated evidence as `AUTO_VERIFIED`; never promote it to `USER_ACCEPTED` without explicit user confirmation. Move development-complete work to `docs/COMPLETED.md`, while any outstanding human checks remain visible in `docs/ACCEPTANCE.md`.

When scope changes, update the state files before implementation. When a task is blocked or deferred, record the reason and required resume signal. At handoff, update evidence, next action, and acceptance state, then rerun the consistency check.

# Workflow guardrails

## Source-of-truth order

1. User's latest explicit instruction
2. `docs/CURRENT_TASK.md`
3. `docs/PROJECT_STATUS.md`
4. `docs/ROADMAP.md`
5. `docs/ACCEPTANCE.md`
6. `docs/DECISION_LOG.md`
7. `docs/COMPLETED.md`
8. Chat history

If files conflict with code or test evidence, stop implementation, reconcile the files, and record the correction.

## Required preflight

- Read every current-truth file listed in `AGENTS.md`.
- Inspect `git status --short` and relevant diffs.
- Run `python scripts/check_project_docs.py`.
- Confirm there is exactly one `IN_PROGRESS` task.
- Confirm the requested work belongs to that task. If not, update the task files before editing.

## Status vocabulary

- `PLANNED`: defined but not started.
- `IN_PROGRESS`: the one active task.
- `AUTO_VERIFIED`: implementation is complete and automated/local evidence passed.
- `NEEDS_USER_ACCEPTANCE`: automated evidence passed but a user-visible or real-environment check remains.
- `USER_ACCEPTED`: the user explicitly accepted the result.
- `BLOCKED`: progress requires unavailable authority, information, or external state.
- `DEFERRED`: intentionally paused until a recorded resume signal.
- `ARCHIVED`: development-complete and recorded in `COMPLETED.md`.

`AUTO_VERIFIED` and `USER_ACCEPTED` are deliberately different states.

## One-task rule

- `CURRENT_TASK.md` contains exactly one active task.
- `ROADMAP.md` may contain many items but exactly one line may be `IN_PROGRESS`.
- A newly requested task replaces or defers the active task only after state files are updated.
- Do not expand into adjacent roadmap items merely because they are convenient.

## Completion and archive rule

When development work is complete:

1. Add an evidence entry to `COMPLETED.md`.
2. Remove completed implementation details from `CURRENT_TASK.md`.
3. Keep pending human checks in `ACCEPTANCE.md`.
4. Select the next task in `CURRENT_TASK.md`, or set the project to `DEFERRED/BLOCKED` with a resume condition.
5. Update `PROJECT_STATUS.md` and `ROADMAP.md` in the same change.
6. Run the consistency checker again.

## Handoff rule

Every handoff must state:

- current task and status;
- last verified evidence;
- next concrete action;
- user acceptance still needed;
- blockers or deferred resume signals.

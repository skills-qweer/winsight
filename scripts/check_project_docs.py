from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
REQUIRED = [
    ROOT / "AGENTS.md",
    DOCS / "WORKFLOW_GUARDRAILS.md",
    DOCS / "PROJECT_CHARTER.md",
    DOCS / "PROJECT_STATUS.md",
    DOCS / "CURRENT_TASK.md",
    DOCS / "ROADMAP.md",
    DOCS / "ACCEPTANCE.md",
    DOCS / "COMPLETED.md",
    DOCS / "DECISION_LOG.md",
]
ALLOWED_ACCEPTANCE_STATES = {
    "PLANNED",
    "AUTO_VERIFIED",
    "NEEDS_USER_ACCEPTANCE",
    "USER_ACCEPTED",
    "BLOCKED",
    "DEFERRED",
}
CURRENT_TASK_STATES = {"IN_PROGRESS", "NEEDS_USER_ACCEPTANCE", "BLOCKED", "DEFERRED"}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def capture(pattern: str, text: str, label: str) -> str:
    match = re.search(pattern, text, re.MULTILINE)
    if not match:
        raise ValueError(f"Missing {label}")
    return match.group(1)


def main() -> int:
    errors: list[str] = []
    for path in REQUIRED:
        if not path.is_file():
            errors.append(f"Missing required file: {path.relative_to(ROOT)}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1

    current = read(DOCS / "CURRENT_TASK.md")
    status = read(DOCS / "PROJECT_STATUS.md")
    roadmap = read(DOCS / "ROADMAP.md")
    acceptance = read(DOCS / "ACCEPTANCE.md")

    try:
        current_id = capture(r"^- ID: `([^`]+)`", current, "current task ID")
        current_state = capture(r"^- State: `([^`]+)`", current, "current task state")
        status_id = capture(r"^- Current task: `([^`]+)`", status, "project status task ID")
        status_state = capture(r"^- Current task state: `([^`]+)`", status, "project status task state")
    except ValueError as error:
        errors.append(str(error))
        current_id = current_state = status_id = status_state = ""

    if current_state not in CURRENT_TASK_STATES:
        errors.append(f"CURRENT_TASK state must be one of {sorted(CURRENT_TASK_STATES)}, got {current_state!r}")
    if current_id != status_id:
        errors.append(f"Current task mismatch: CURRENT_TASK={current_id}, PROJECT_STATUS={status_id}")
    if current_state != status_state:
        errors.append(f"Current state mismatch: CURRENT_TASK={current_state}, PROJECT_STATUS={status_state}")

    roadmap_rows = re.findall(r"^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|", roadmap, re.MULTILINE)
    normalized_rows = [(task_id.strip(), task_state.strip()) for task_id, task_state in roadmap_rows]
    current_rows = [row for row in normalized_rows if row[0] == current_id]
    if current_rows != [(current_id, current_state)]:
        errors.append(
            f"ROADMAP must contain exactly one current row for {current_id} ({current_state}); got {current_rows}"
        )
    in_progress_ids = [task_id for task_id, task_state in normalized_rows if task_state == "IN_PROGRESS"]
    expected_in_progress = [current_id] if current_state == "IN_PROGRESS" else []
    if in_progress_ids != expected_in_progress:
        errors.append(f"ROADMAP IN_PROGRESS rows must be {expected_in_progress}; got {in_progress_ids}")

    for line_number, line in enumerate(acceptance.splitlines(), start=1):
        if not re.match(r"^\|\s*M\d+\s*\|", line):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        state = cells[-1] if cells else ""
        if state not in ALLOWED_ACCEPTANCE_STATES:
            errors.append(f"ACCEPTANCE line {line_number} has invalid state {state!r}")

    if "USER_ACCEPTED" not in acceptance:
        errors.append("ACCEPTANCE must document the USER_ACCEPTED state boundary")
    if "AUTO_VERIFIED" not in acceptance:
        errors.append("ACCEPTANCE must document the AUTO_VERIFIED state boundary")

    if errors:
        print("Project document consistency check failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(f"Project document consistency check passed: current task {current_id} ({current_state})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

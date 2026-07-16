# Completed work archive

## WS-001 - Capture foundation

- Completed: 2026-07-17
- Final state: `ARCHIVED`
- Acceptance: M01 and M02 are `AUTO_VERIFIED`; M03 remains `NEEDS_USER_ACCEPTANCE`

Delivered:

- Codex plugin and `winsight` skill scaffolds
- Top-level window enumeration with HWND, PID, process, title, class, visibility, and bounds
- `PrintWindow(PW_RENDERFULLCONTENT)` capture
- Visible GDI screen-region fallback
- Mean-luminance and color-range black-frame detection
- Windows build diagnosis for WGC API compatibility
- Real-window test script and backend architecture reference

Evidence:

- WeChat DevTools capture: 1618x1075, backend `printwindow`, mean RGB 45.07
- `quick_validate.py`: passed
- `validate_plugin.py`: passed
- Root cause recorded: Windows 10 build 19045 supports `CreateForWindow` but not `GraphicsCaptureSession.IsBorderRequired`

Do not move M03 out of `ACCEPTANCE.md` until the user explicitly accepts the visual result.

## WS-002 - Publication, installation, and anti-drift foundation

- Development completed: 2026-07-17
- Development state: `AUTO_VERIFIED`
- Current acceptance: M04 and M05 remain `NEEDS_USER_ACCEPTANCE`

Delivered:

- File-backed anti-drift contract in `AGENTS.md` and `docs/`
- One-current-task model with separate status, roadmap, acceptance, decision, and completed archives
- Automated project-document consistency gate
- Git repository initialized at `E:\skills\winsight`
- Commit `2b8d53a` pushed to `https://github.com/skills-qweer/winsight`
- Skill installed from GitHub to `D:\CodexHome\skills\winsight`

Evidence:

- Project document consistency check passed
- Skill validation passed
- Plugin validation passed
- Git push to `origin/main` passed
- Skill installer reported successful installation

Keep WS-002 as the current acceptance task until the user completes M04; do not begin WS-003 implicitly.

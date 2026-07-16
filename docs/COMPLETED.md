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

## WS-003 - MCP image and controlled-input foundation

- Development completed: 2026-07-17
- Development state: `AUTO_VERIFIED`
- Acceptance: M06-M08 are `AUTO_VERIFIED`; ordinary safe local input does not require per-action user confirmation

Delivered:

- Dependency-free MCP stdio server with eight window, capture, mapping, input, and emergency-control tools
- Direct PNG image content plus capture/backend/frame-quality metadata
- Window, client, normalized, and logical coordinate spaces with DPI-aware screen mapping
- Short-lived, single-use prepared-input tokens bound to HWND, process, title, bounds, client bounds, DPI, and action
- Revalidation, expiration, replay rejection, emergency stop, and sensitive-surface blocking
- Robust foreground activation followed by bounded click and allowlisted-key input
- Protocol, mapping, guard, and supervised real-input test scripts

Evidence:

- MCP initialize and `tools/list`: passed; server `0.2.0`, eight tools
- WeChat MCP capture: valid PNG signature `89504e470d0a1a0a`, 1618x1075, backend `printwindow`
- Normalized center mapped to capture pixel 809,537 and screen pixel 1683,839 at DPI 96
- Benign WeChat game click executed and the after-capture visibly advanced to Chapter 1
- Emergency-stop rejection and Creator login-surface guard passed
- Skill, plugin, and project-document validators passed

M03-M05 remain in `ACCEPTANCE.md`; their pending state does not reopen WS-003 development.

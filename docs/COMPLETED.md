# Completed work archive

## WS-007 - User-facing README

- Completed: 2026-08-01
- Final state: `ARCHIVED`
- Acceptance: Documentation-only change; no new manual acceptance required

Delivered:

- Reworked the repository README around WinSight's user-facing purpose and suitable scenarios
- Added copyable `$winsight` examples for capture, OCR, observation, coordinate mapping, and controlled local input
- Documented screenshot backends, coordinate types, input handshake, prohibited sensitive surfaces, plugin/source separation, fallback commands, and project-state links
- Preserved the distinction between automated evidence and user acceptance

Evidence:

- README content reconciled with the v0.4 skill contract and MCP capabilities
- `python scripts/check_project_docs.py`: passed
- No runtime implementation or acceptance result changed

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
- Commit `118d34e` pushed to `origin/main`
- Personal plugin `winsight@personal` installed and enabled as `0.2.0+codex.20260716193039`
- Standalone skill refreshed from GitHub at `D:\CodexHome\skills\winsight`; previous v0.1 preserved under `D:\CodexHome\skill-backups`

M03-M05 remain in `ACCEPTANCE.md`; their pending state does not reopen WS-003 development.

## WS-004 - Version-safe WGC and DXGI capture backends

- Development completed: 2026-07-17
- Development state: `AUTO_VERIFIED`
- Acceptance: M09-M10 are `AUTO_VERIFIED`

Delivered:

- Source-included WGC helper using `IGraphicsCaptureItemInterop::CreateForWindow`, a D3D11 device, and a free-threaded capture frame pool
- No access to `GraphicsCaptureSession.IsBorderRequired`, preserving Windows 10 build 19045 compatibility
- Stale first-frame size rejection to prevent black padding and coordinate drift after window resizing
- Pinned Microsoft SDK Contracts 10.0.19041.2 first-use cache with SHA-256 verification when local build metadata is absent
- DXGI Desktop Duplication through FFmpeg `ddagrab`, with owning-monitor window crop and explicit failure categories
- Monitor bounds/device/output-index and minimized-state discovery metadata
- Automatic backend order: WGC, PrintWindow, DXGI, GDI screen crop
- Explicit backend regression script and MCP coverage for WGC and DXGI

Evidence:

- WGC WeChat capture: 1618x1075, mean RGB 44.56, non-black
- WGC Creator capture: 1518x958, mean RGB 49.42, non-black while the window was covered
- DXGI WeChat crop: 1618x1075, `DISPLAY1` output 0, non-black
- `scripts/test_backends.ps1`: WGC, DXGI, and auto passed with exact target dimensions; auto selected WGC
- `scripts/test_mcp.mjs`: server 0.3.0, explicit backends `wgc` and `dxgi`, valid PNG and mapping evidence

## WS-005 - Tracking, change detection, bounded recording, ROI, and OCR

- Development completed: 2026-07-17
- Development state: `AUTO_VERIFIED`
- Acceptance: M11-M14 are `AUTO_VERIFIED`

Delivered:

- Fourteen-tool MCP surface spanning capture, ROI, bounded observation sessions, recording, OCR, coordinate mapping, and controlled input
- Ten-minute/16-session bounded HWND tracking with recreation, process, title, window/client bounds, DPI, visibility, and minimized-state reporting
- Normalized sampled RGB change scoring with per-pixel threshold, changed fraction, dimension-change handling, and material threshold
- Window/client/normalized/logical ROI mapping with round-trip screen and capture-pixel bounds
- Local recordings bounded by duration, frame count, and total bytes, with full JSON manifests and capped MCP response summaries
- Local Windows.Media.Ocr provider with language, text, line, word, and bounding-box results plus explicit absence of confidence data
- Capture-time window metadata reconciliation so observation and input mappings bind to the actual frame rather than stale pre-capture bounds

Evidence:

- Stable ROI poll: score 0 and no continuity changes
- Different same-size game ROI: score 0.059552, above default 0.05 material threshold
- Isolated tracking fixture: moved/resized from 520x360 at (120,120) to 680x460 at (260,210); window and client changes reported
- ROI mapping: normalized source mapped to 453x967 at capture (1133,54) and screen (2032,361), DPI 96
- Windows.Media.Ocr: `zh-Hans-CN`, eight ROI lines with word boxes
- Bounded recording: six-second test retained two frames/82,562 bytes, stopped by duration, manifest readable
- Full real-window suite passed with MCP server 0.4.0 and fourteen tools
- Commit `d80a22b` pushed to `origin/main`
- Personal plugin installed and enabled as `0.4.0+codex.20260716201224`
- Standalone skill refreshed from GitHub at `D:\CodexHome\skills\winsight`; v0.1/v0.2 backups preserved outside the active skills directory

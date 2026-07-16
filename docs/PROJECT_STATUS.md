# Project status

- Project: WinSight
- Phase: v0.3 native multi-backend capture
- Overall: v0.2 MCP and controlled input are `AUTO_VERIFIED`; native WGC/DXGI work is `IN_PROGRESS`
- Current task: `WS-004`
- Current task state: `IN_PROGRESS`
- Last updated: 2026-07-17

## Progress summary

| Area | State | Evidence |
|---|---|---|
| Plugin and skill scaffold | AUTO_VERIFIED | Both validators passed |
| Window discovery | AUTO_VERIFIED | WeChat DevTools HWND and bounds resolved |
| PrintWindow capture | AUTO_VERIFIED | 1618x1075 frame, mean RGB 45.07 |
| Black-frame scoring | AUTO_VERIFIED | Capture result exposes luminance/range classification |
| Anti-drift workflow | AUTO_VERIFIED | Consistency gate passed |
| GitHub publication | AUTO_VERIFIED | Commit `2b8d53a` pushed to `main` |
| Codex skill installation | AUTO_VERIFIED | Installed to `D:\CodexHome\skills\winsight` |
| Direct MCP image tools | AUTO_VERIFIED | Valid 1618x1075 PNG returned through MCP |
| Controlled input handshake | AUTO_VERIFIED | Benign game click visibly advanced to Chapter 1; guards passed |
| DPI/client coordinate mapping | AUTO_VERIFIED | Window/client/normalized/logical mappings tested at DPI 96 |
| WGC and DXGI backends | IN_PROGRESS | `WS-004` |
| Tracking, change detection, recording, OCR | PLANNED | `WS-005` |

## Next action

Inventory local Windows capture runtimes and implement the version-safe native backend helper selected for WS-004.

## User involvement

M03-M05 remain pending explicit acceptance. M06-M08 are automatically verified. Routine safe local app input proceeds without per-action confirmation; sensitive or consequential surfaces remain blocked or require exact authorization.

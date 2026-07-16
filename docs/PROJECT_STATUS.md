# Project status

- Project: WinSight
- Phase: v0.1 new-task acceptance
- Overall: foundation, publication, and installation are `AUTO_VERIFIED`; cross-task use is `NEEDS_USER_ACCEPTANCE`
- Current task: `WS-002`
- Current task state: `NEEDS_USER_ACCEPTANCE`
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
| WGC version-safe backend | PLANNED | `WS-003` |
| DXGI Desktop Duplication | PLANNED | `WS-004` |
| Direct MCP image tools | PLANNED | `WS-005` |

## Next action

Complete M04 from a new Codex task: ask that task to use WinSight to capture a Windows app, then explicitly accept or report the result.

## User involvement

See `docs/ACCEPTANCE.md`. M04 now requires the user because installed skills are picked up at the next task boundary.

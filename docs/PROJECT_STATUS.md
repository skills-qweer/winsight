# Project status

- Project: WinSight
- Phase: v0.1 publish and local installation
- Overall: foundation capture path is `AUTO_VERIFIED`; publication is `IN_PROGRESS`
- Current task: `WS-002`
- Current task state: `IN_PROGRESS`
- Last updated: 2026-07-17

## Progress summary

| Area | State | Evidence |
|---|---|---|
| Plugin and skill scaffold | AUTO_VERIFIED | Both validators passed |
| Window discovery | AUTO_VERIFIED | WeChat DevTools HWND and bounds resolved |
| PrintWindow capture | AUTO_VERIFIED | 1618x1075 frame, mean RGB 45.07 |
| Black-frame scoring | AUTO_VERIFIED | Capture result exposes luminance/range classification |
| Anti-drift workflow | IN_PROGRESS | State files and consistency gate being added |
| GitHub publication | IN_PROGRESS | Empty repository confirmed; initial push pending |
| Codex installation | PLANNED | Install after publication and marketplace wiring |
| WGC version-safe backend | PLANNED | `WS-003` |
| DXGI Desktop Duplication | PLANNED | `WS-004` |
| Direct MCP image tools | PLANNED | `WS-005` |

## Next action

Finish the repository consistency gate, rerun validation, commit and push to `https://github.com/skills-qweer/winsight`, then install WinSight and verify it from a new task.

## User involvement

See `docs/ACCEPTANCE.md`. The next required user-visible checkpoint is `M04`, using WinSight from a new Codex task after installation.

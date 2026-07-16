# Project status

- Project: WinSight
- Phase: v0.4 observation and OCR layer
- Overall: v0.3 native multi-backend capture is `AUTO_VERIFIED`; tracking/change/recording/OCR work is `IN_PROGRESS`
- Current task: `WS-005`
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
| GitHub publication | AUTO_VERIFIED | Latest feature commit `118d34e` pushed to `main` |
| Codex plugin installation | AUTO_VERIFIED | `winsight@personal` enabled as `0.2.0+codex.20260716193039` |
| Codex skill installation | AUTO_VERIFIED | v0.2 refreshed at `D:\CodexHome\skills\winsight` |
| Direct MCP image tools | AUTO_VERIFIED | Valid 1618x1075 PNG returned through MCP |
| Controlled input handshake | AUTO_VERIFIED | Benign game click visibly advanced to Chapter 1; guards passed |
| DPI/client coordinate mapping | AUTO_VERIFIED | Window/client/normalized/logical mappings tested at DPI 96 |
| WGC and DXGI backends | AUTO_VERIFIED | WGC and DXGI returned exact target-sized non-black frames |
| Window tracking | AUTO_VERIFIED | Isolated fixture move/resize and client-bound changes detected |
| Material-change detection | AUTO_VERIFIED | Stable score 0; changed same-size game ROI score 0.059552 |
| ROI and bounded recording | AUTO_VERIFIED | 453x967 mapping plus duration/frame/byte-bounded manifest test passed |
| Local OCR | AUTO_VERIFIED | Windows.Media.Ocr `zh-Hans-CN`, 8 ROI lines and word boxes |
| v0.4 publication and installation | IN_PROGRESS | Final WS-005 step |

## Next action

Run the full v0.4 regression suite, push the release commit, and refresh the personal plugin and standalone skill installations.

## User involvement

M03-M05 remain pending explicit acceptance. M06-M08 are automatically verified. Routine safe local app input proceeds without per-action confirmation; sensitive or consequential surfaces remain blocked or require exact authorization.

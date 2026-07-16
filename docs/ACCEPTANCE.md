# Manual acceptance

Use a new timestamped output name for each capture, for example `winsight-manual-20260717-1.png`, so earlier frames cannot be mistaken for current evidence.

| ID | Operation | Expected result | Automated evidence | User result | State |
|---|---|---|---|---|---|
| M01 | Run WinSight diagnostics | Reports build 19045; `CreateForWindow=true`; `IsBorderRequired=false`; explains safe fallback | Passed 2026-07-17 | Not required | AUTO_VERIFIED |
| M02 | List windows and locate WeChat DevTools | Returns the correct title, process, HWND, and 1618x1075 bounds | Passed 2026-07-17 | Not required | AUTO_VERIFIED |
| M03 | Capture WeChat DevTools while another app is in front | Full editor and simulator are visible; result is not classified as black | Passed: PrintWindow, mean RGB 45.07 | Awaiting explicit visual acceptance | NEEDS_USER_ACCEPTANCE |
| M04 | Start a new Codex task and ask it to use WinSight | The new task discovers the installed skill and captures the requested window without relying on this chat | GitHub push and installation passed; installed at `D:\CodexHome\skills\winsight` | User must perform in a new task | NEEDS_USER_ACCEPTANCE |
| M05 | Capture a second app for which ordinary Computer Use capture fails | Auto backend returns a valid image or clear per-backend failure evidence | Pending | User chooses target app | NEEDS_USER_ACCEPTANCE |
| M06 | Invoke MCP `capture_window` | Tool returns a current PNG plus backend and frame-quality metadata | Passed 2026-07-17: valid PNG signature, 1618x1075, `printwindow` | Not required | AUTO_VERIFIED |
| M07 | Prepare a mapped click without executing it | Preview image and mapped client/screen coordinates match the intended target | Passed 2026-07-17: normalized center and window-pixel mapping matched window/client/screen bounds | Not required | AUTO_VERIFIED |
| M08 | Execute one prepared benign game/menu click | The safe local action executes automatically; stale/reused tokens and blocked surfaces fail | Passed 2026-07-17: WeChat game advanced from main menu to Chapter 1; replay, emergency-stop, and Creator-login guards passed | Not required for routine safe local input | AUTO_VERIFIED |
| M09 | Exercise native WGC on build 19045 | Capture succeeds without calling unsupported `IsBorderRequired` | Passed 2026-07-17: WeChat 1618x1075 and Creator 1518x958, non-black, backend `wgc` | Not required | AUTO_VERIFIED |
| M10 | Exercise DXGI fallback and monitor crop | DXGI returns the visible desktop crop with correct monitor/DPI mapping | Passed 2026-07-17: `DISPLAY1` output 0, 1618x1075 crop; explicit WGC/DXGI/auto backend test passed | Visual occlusion semantics inspected by Codex | AUTO_VERIFIED |
| M11 | Track a moving/resized window | HWND continuity and bounds changes are recorded without confusing another window | Not implemented | Required after WS-005 | PLANNED |
| M12 | Detect a user-visible content change | Material-change score crosses threshold while unchanged frames remain stable | Not implemented | User checks before/after | PLANNED |
| M13 | Record a window for 60 seconds | Bounded frame storage; manifest and optional video are valid; no unbounded memory growth | Not implemented | User reviews recording | PLANNED |
| M14 | OCR a selected region | Recognized text and region coordinates match visible pixels | Not implemented | User checks OCR | PLANNED |

Only the user may change an item to `USER_ACCEPTED`. Automated checks may change it only to `AUTO_VERIFIED` or `NEEDS_USER_ACCEPTANCE`.

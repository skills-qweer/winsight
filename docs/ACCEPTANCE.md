# Manual acceptance

Use a new timestamped output name for each capture, for example `winsight-manual-20260717-1.png`, so earlier frames cannot be mistaken for current evidence.

| ID | Operation | Expected result | Automated evidence | User result | State |
|---|---|---|---|---|---|
| M01 | Run WinSight diagnostics | Reports build 19045; `CreateForWindow=true`; `IsBorderRequired=false`; explains safe fallback | Passed 2026-07-17 | Not required | AUTO_VERIFIED |
| M02 | List windows and locate WeChat DevTools | Returns the correct title, process, HWND, and 1618x1075 bounds | Passed 2026-07-17 | Not required | AUTO_VERIFIED |
| M03 | Capture WeChat DevTools while another app is in front | Full editor and simulator are visible; result is not classified as black | Passed: PrintWindow, mean RGB 45.07 | Awaiting explicit visual acceptance | NEEDS_USER_ACCEPTANCE |
| M04 | Start a new Codex task and ask it to use WinSight | The new task discovers the installed skill and captures the requested window without relying on this chat | GitHub push and installation passed; installed at `D:\CodexHome\skills\winsight` | User must perform in a new task | NEEDS_USER_ACCEPTANCE |
| M05 | Capture a second app for which ordinary Computer Use capture fails | Auto backend returns a valid image or clear per-backend failure evidence | Pending | User chooses target app | NEEDS_USER_ACCEPTANCE |
| M06 | Exercise native WGC on build 19045 | Capture succeeds without calling unsupported `IsBorderRequired` | Not implemented | Required after WS-003 | PLANNED |
| M07 | Force PrintWindow failure/black frame and use DXGI fallback | DXGI returns the visible desktop crop with correct monitor/DPI mapping | Not implemented | Required after WS-004 | PLANNED |
| M08 | Invoke MCP capture tool from a fresh task | Tool returns image plus JSON metadata directly | Not implemented | Required after WS-005 | PLANNED |
| M09 | Capture a moving window continuously for 60 seconds | No unbounded memory growth; stale/device-loss recovery is explicit | Not implemented | Required after WS-006 | PLANNED |
| M10 | Run OCR/region capture on a user-selected window | Region mapping and recognized content match the visible pixels | Not implemented | Required after WS-006 | PLANNED |

Only the user may change an item to `USER_ACCEPTED`. Automated checks may change it only to `AUTO_VERIFIED` or `NEEDS_USER_ACCEPTANCE`.

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

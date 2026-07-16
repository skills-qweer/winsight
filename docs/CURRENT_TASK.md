# Current task

- ID: `WS-004`
- Title: Add version-safe WGC and DXGI capture backends
- State: `IN_PROGRESS`
- Owner: Codex
- Last updated: 2026-07-17

## Goal

Add real native capture alternatives for windows that return black or incomplete PrintWindow frames, while preserving correct monitor, DPI, crop, and recovery behavior on Windows 10 build 19045.

## In scope

- Add a Windows Graphics Capture backend that does not call unsupported optional APIs
- Add a DXGI Desktop Duplication fallback with monitor-aware window cropping
- Handle minimized, occluded, black-frame, device-loss, and window-recreation outcomes explicitly
- Preserve capture metadata and backend-attempt evidence through the MCP response
- Add deterministic backend-selection and real-window validation

## Not in scope

- Continuous tracking, recording, OCR, and material-change scoring (`WS-005`)
- Authentication, protected-content bypass, process injection, or private capture hooks
- Authentication, CAPTCHA, password, permission, payment, or Windows security UI automation

## Done when

- WGC captures a real target on build 19045 without touching `IsBorderRequired`
- DXGI can crop the correct target from the owning monitor when the target is visible
- `auto` records every attempted backend and chooses the first valid non-black frame
- Device loss and unsupported/minimized states return explicit recoverable errors
- MCP, skill, plugin, project-doc, and real-window tests pass

## Next concrete action

Inventory the available Windows SDK/runtime and FFmpeg/DXGI capabilities, then choose the smallest maintainable native helper architecture before editing capture code.

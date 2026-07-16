---
name: winsight
description: Reliable Windows window discovery and screenshot capture with black-frame detection and backend fallback. Use when Codex needs to inspect a native Windows app, Chromium/Electron/Cocos/Qt window, simulator, game editor, or other desktop surface and ordinary Computer Use screenshots fail, return black, report Windows.Graphics.Capture or SetIsBorderRequired errors, or cannot capture an occluded window.
---

# WinSight

Use the bundled PowerShell entrypoint to discover and capture Windows windows without changing system settings. Treat WinSight as an observation tool; keep input, authentication, permissions, uploads, and other consequential actions in the normal approved Computer Use flow.

## Workflow

1. Run diagnostics when the failure mentions WGC, `SetIsBorderRequired`, `E_NOINTERFACE`, or `0x80004002`:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/winsight.ps1 -Action diagnose
   ```

2. List windows when the HWND or exact title is unknown:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/winsight.ps1 -Action list
   ```

3. Capture by title, process, or HWND. Prefer HWND after discovery when titles are ambiguous:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/winsight.ps1 -Action capture -Hwnd 123456 -Backend auto
   ```

4. Parse the JSON result. Require `selected.success=true`, `selected.likelyBlackFrame=false`, and an existing `selected.outputPath` before using the image.

5. Inspect the returned PNG with the local image viewer. Do not claim visual success from exit code alone.

## Backend selection

- Use `auto` by default. It tries off-screen-capable `PrintWindow(PW_RENDERFULLCONTENT)` first and visible-screen GDI capture second.
- Use `printwindow` for Chromium/Electron, Cocos Creator, WeChat DevTools, Qt, and occluded windows.
- Use `gdi-screen` only when the target is visibly unobscured; it captures whatever is physically displayed in the target rectangle.
- Read [references/backends.md](references/backends.md) before adding WGC, DXGI Desktop Duplication, multi-monitor, or continuous-frame support.

## Safety and integrity

- Do not use WinSight to bypass protected-content flags, DRM, authentication dialogs, CAPTCHA, Windows security surfaces, or privacy controls.
- Do not add hidden input injection, process injection, capture hooks, or security-setting changes to the skill.
- Preserve the JSON evidence for backend, frame dimensions, mean RGB, color range, and black-frame classification.
- Stop after repeated black frames; choose another documented backend or ask the user to expose the window.
- Keep temporary captures out of source control unless the user explicitly requests fixtures.

## Validation

Run the bundled real-window test against an already open window:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-winsight.ps1 -Title "FogHarborEchoes"
```

Then run the skill and plugin validators before publishing.

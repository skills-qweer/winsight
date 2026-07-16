---
name: winsight
description: Reliable Windows window discovery, direct image capture, DPI-aware coordinate mapping, and prepared controlled local input with black-frame detection and backend fallback. Use when Codex needs to inspect or operate a native Windows app, Chromium/Electron/Cocos/Qt window, simulator, game editor, or other desktop surface and ordinary Computer Use screenshots fail, return black, report Windows.Graphics.Capture or SetIsBorderRequired errors, or cannot safely map a visible target to input coordinates.
---

# WinSight

Prefer WinSight MCP tools when they are available. They return images directly and connect current window observation to bounded local input. Use the bundled PowerShell scripts only as a capture fallback or for development tests.

## Observe

1. Call `list_windows` and select an exact HWND when title/process matching is ambiguous.
2. Call `capture_window` with `backend=auto`.
3. Require valid PNG content, successful metadata, and `LikelyBlackFrame=false` before reasoning from the image.
4. Use `diagnose_capture` for WGC, `SetIsBorderRequired`, `E_NOINTERFACE`, or `0x80004002` failures.

## Map coordinates

Call `map_coordinates` with one of:

- `window_pixels`: coordinates from the returned full-window PNG.
- `client_pixels`: coordinates within the current client area.
- `normalized`: values from 0 to 1 for resize-tolerant locations.
- `logical`: coordinates in an app/game logical resolution plus `logicalWidth` and `logicalHeight`.

Check the returned screen, capture-pixel, bounds, DPI, and scale metadata. Re-map after a move, resize, DPI change, title change, or window recreation.

## Operate a safe local app

1. Call `prepare_input` with an exact HWND and a click or allowlisted key.
2. Inspect the returned current image and mapping. Preparation does not execute input.
3. Call `execute_prepared_input` with the token. It executes automatically only if the token is unexpired and the HWND identity, title, bounds, client bounds, and DPI are unchanged.
4. Capture again and verify the visible result. Do not treat the input API return value alone as success.

Tokens expire after 30 seconds and are single-use. Use `emergency_stop_input` to cancel all pending input and disable execution; use `resume_input` to resume safe local actions.

## Input boundaries

- Do not use WinSight input for authentication, login, passwords, CAPTCHA, payment, permissions, privacy/security settings, password managers, or Windows security surfaces. The MCP server blocks known cases, but the agent must still respect the visible surface.
- Do not use WinSight to submit uploads, publish releases, send messages, change sharing, install software, or perform other consequential external actions unless the user separately authorized that exact action.
- Do not call `input.ps1` directly during normal use; the MCP prepare/execute handshake provides stale-window and replay protection.
- Safe local game, simulator, editor, menu, navigation, and test interactions may proceed automatically when already authorized by the user.

## Script fallback

Run diagnostics:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/winsight.ps1 -Action diagnose
```

Capture by exact HWND:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/winsight.ps1 -Action capture -Hwnd 123456 -Backend auto
```

Use `auto` by default. It tries off-screen-capable WGC first, then `PrintWindow(PW_RENDERFULLCONTENT)`, monitor-cropped DXGI Desktop Duplication, and finally visible-screen GDI. WGC never calls `IsBorderRequired` on unsupported Windows builds. DXGI captures the rendered desktop and therefore includes occluding windows.

The WGC helper is compiled into the local app-data cache. On machines without SDK contract metadata, first use downloads a pinned Microsoft SDK Contracts package from NuGet, verifies its SHA-256, and caches only the build metadata; later captures run offline. If this fails, the attempt metadata records the reason and `auto` continues to the next backend.

Read [references/backends.md](references/backends.md) before extending continuous capture, recording, or OCR.

## Validation

Run:

```powershell
node scripts/test_mcp.mjs
python scripts/check_project_docs.py
```

For a supervised real-input test, run `scripts/test_mcp_input.mjs` with an explicit window title, pixel coordinate, and `--execute`, then inspect its after-capture PNG.

# WinSight

WinSight is a Windows capture plugin and Codex skill for inspecting native app windows when ordinary screenshots fail, return black frames, or hit an unsupported `Windows.Graphics.Capture` interface.

The first working release provides:

- top-level window discovery with HWND, process, class, and bounds;
- `PrintWindow(PW_RENDERFULLCONTENT)` capture for occluded Chromium/Electron/Cocos/Qt windows;
- visible desktop-region capture as a fallback;
- black-frame detection and JSON evidence;
- diagnosis of Windows build/API compatibility;
- a reusable Codex skill with deterministic scripts.

Version 0.2 adds a local MCP server with:

- direct PNG image responses;
- DPI-aware window/client/normalized/logical coordinate mapping;
- short-lived single-use prepared clicks and allowlisted key presses;
- target identity and bounds revalidation before input;
- emergency stop, replay protection, and blocked sensitive surfaces.

The implementation is independent and uses public Windows APIs. It does not copy proprietary code from streaming applications.

## Quick test

```powershell
& '.\skills\winsight\scripts\winsight.ps1' -Action diagnose
& '.\skills\winsight\scripts\winsight.ps1' -Action list
& '.\skills\winsight\scripts\winsight.ps1' -Action capture -Title 'FogHarborEchoes' -Backend auto
node .\scripts\test_mcp.mjs
```

## Roadmap

- WGC `CreateForWindow` capture that skips unavailable border APIs;
- DXGI Desktop Duplication with multi-monitor cropping;
- continuous D3D11 frame sessions and stale-frame detection;
- DPI-aware coordinate transforms and region-of-interest capture;
- an MCP image tool so captures can be returned directly without temporary-file plumbing;
- OCR and visual-change monitoring as optional higher layers.

WinSight intentionally excludes DRM bypass, authentication automation, security-setting changes, and hidden process injection.

## Project state

Do not infer current work from chat history. Start with [PROJECT_STATUS.md](docs/PROJECT_STATUS.md), then read [CURRENT_TASK.md](docs/CURRENT_TASK.md), [ROADMAP.md](docs/ROADMAP.md), and [ACCEPTANCE.md](docs/ACCEPTANCE.md). Completed evidence is kept separately in [COMPLETED.md](docs/COMPLETED.md).

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

Version 0.3 adds native multi-backend capture:

- Windows Graphics Capture by HWND on Windows 10 build 19045 without touching unsupported border APIs;
- DXGI Desktop Duplication through FFmpeg `ddagrab`, with monitor-aware window cropping;
- explicit minimized, multi-output, dependency, access, session-limit, and device-loss failure categories;
- automatic order: WGC, PrintWindow, DXGI, then visible GDI.

The WGC helper builds into the user's local app-data cache. If Windows SDK contract metadata is absent, first use downloads the pinned Microsoft `Microsoft.Windows.SDK.Contracts` 10.0.19041.2 package from NuGet and verifies its SHA-256 before compiling; later captures run offline.

Version 0.4 adds a bounded observation layer:

- stable HWND/process/title/bounds/client/DPI tracking with recreation, move, resize, visibility, and minimized-state reporting;
- normalized material-change scoring with dimension-change detection and configurable thresholds;
- window/client/normalized/logical region capture with capture-to-screen coordinate metadata;
- time/frame/byte-bounded local frame recording plus JSON manifests and per-frame backend/change evidence;
- local `Windows.Media.Ocr` recognition with language, text, line, word, and bounding-box results;
- 14 MCP tools covering observation, ROI, tracking, recording, OCR, coordinate mapping, and controlled input.

The implementation is independent and uses public Windows APIs. It does not copy proprietary code from streaming applications.

## Quick test

```powershell
& '.\skills\winsight\scripts\winsight.ps1' -Action diagnose
& '.\skills\winsight\scripts\winsight.ps1' -Action list
& '.\skills\winsight\scripts\winsight.ps1' -Action capture -Title 'FogHarborEchoes' -Backend auto
node .\scripts\test_mcp.mjs
```

## Roadmap

- persistent GPU frame sessions for higher-frequency recording;
- rotation-aware, multi-adapter DXGI mapping for windows spanning displays;
- optional OCR-provider plugins with confidence scores;
- long-running monitoring orchestration outside the bounded MCP session.

WinSight intentionally excludes DRM bypass, authentication automation, security-setting changes, and hidden process injection.

## Project state

Do not infer current work from chat history. Start with [PROJECT_STATUS.md](docs/PROJECT_STATUS.md), then read [CURRENT_TASK.md](docs/CURRENT_TASK.md), [ROADMAP.md](docs/ROADMAP.md), and [ACCEPTANCE.md](docs/ACCEPTANCE.md). Completed evidence is kept separately in [COMPLETED.md](docs/COMPLETED.md).

# Project charter

## Objective

Give Codex reliable, evidence-backed visibility into Windows app windows when ordinary screenshot capture fails or returns black frames.

## Product direction

WinSight will provide independent implementations of public Windows capture APIs, automatic backend fallback, frame-quality scoring, and a Codex-facing skill/tool interface.

## In scope

- Window enumeration and stable HWND metadata
- WGC capture with version-safe API use
- PrintWindow and visible GDI capture
- DXGI Desktop Duplication and D3D11 frame processing
- Black/stale-frame detection, DPI mapping, multi-monitor support
- Codex skill and future MCP image tools
- Local diagnostics, tests, documentation, and install workflow

## Out of scope

- Copying proprietary streaming-app code
- DRM or protected-content bypass
- CAPTCHA or authentication automation
- Security/privacy-setting changes
- Hidden process injection or anti-cheat evasion
- Replacing the normal confirmation policy for consequential UI actions

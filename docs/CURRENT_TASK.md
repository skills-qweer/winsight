# Current task

- ID: `WS-005`
- Title: Add tracking, change detection, recording, ROI, and OCR
- State: `IN_PROGRESS`
- Owner: Codex
- Last updated: 2026-07-17

## Goal

Turn one-shot capture into a bounded observation layer that can follow a stable window, detect meaningful visual changes, record evidence without unbounded growth, crop regions reliably, and recognize visible text.

## In scope

- Track HWND identity, process, title, bounds, client bounds, DPI, visibility, and recreation/move/resize events
- Compute stable material-change scores between frames and support region-of-interest comparison
- Record bounded multi-backend frame sequences with a manifest and retention limits
- Crop window/client/normalized/logical regions with reliable source-to-screen metadata
- Add an OCR provider with explicit availability and confidence/region evidence
- Expose the new capabilities as MCP tools and deterministic tests

## Not in scope

- Unbounded background monitoring or hidden persistence
- Authentication, protected-content bypass, process injection, or private capture hooks
- Authentication, CAPTCHA, password, permission, payment, or Windows security UI automation

## Done when

- Tracking reports continuity plus move/resize/DPI/title/window-recreation changes
- Change scores remain low for stable frames and cross a configured threshold for visible changes
- A 60-second-capable recording path enforces frame/count/byte/time bounds and writes a valid manifest
- ROI capture metadata round-trips to current screen coordinates
- OCR returns text and regions or a clear provider-unavailable result
- MCP, skill, plugin, project-doc, and real-window tests pass

## Next concrete action

Inventory built-in OCR options and design one bounded session model shared by tracking, change detection, and recording.

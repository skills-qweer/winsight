# MCP tool contract

## Observation tools

- `diagnose_capture`: report OS/API compatibility.
- `list_windows`: return HWND, PID, process, title, window/client bounds, DPI, and scale.
- `capture_window`: return PNG image content plus backend and frame-quality evidence. Backends are `auto`, `wgc`, `printwindow`, `dxgi`, and `gdi-screen`.
- `map_coordinates`: convert window/client, normalized, or logical coordinates to screen and capture pixels.
- `capture_region`: crop a mapped ROI while preserving source, screen, and capture-pixel bounds.
- `start_observation`: bind a baseline frame and window identity into a ten-minute bounded session.
- `poll_observation`: report HWND/process/title/bounds/client/DPI continuity plus normalized pixel-change evidence.
- `stop_observation`: release one observation session.
- `record_window`: capture a duration/frame/byte-bounded local sequence and JSON manifest with per-frame backend/change evidence.
- `ocr_window`: recognize full-frame or ROI text locally with Windows.Media.Ocr and return line/word bounds.

## Input tools

- `prepare_input`: bind one click or allowlisted key to current HWND identity and a 30-second single-use token; return a current preview image.
- `execute_prepared_input`: revalidate every bound field, then execute once.
- `emergency_stop_input`: disable execution and invalidate tokens.
- `resume_input`: re-enable safe local execution.

## Revalidation fields

An action becomes invalid when any of these change:

- HWND
- process ID or process name
- title
- window bounds
- client bounds
- DPI

The server also rejects expired, replayed, missing, out-of-bounds, and blocked-surface actions.

## Bounded observation defaults

- Observation session expiry: 10 minutes of inactivity
- Maximum active observation sessions: 16
- Material-change threshold: 0.05
- Per-pixel comparison threshold: 16/255
- Recording maximum: 60 seconds, 600 frames, 256 MiB
- OCR output cap: 50,000 text characters and 500 lines per MCP response

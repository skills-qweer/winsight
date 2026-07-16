# MCP tool contract

## Observation tools

- `diagnose_capture`: report OS/API compatibility.
- `list_windows`: return HWND, PID, process, title, window/client bounds, DPI, and scale.
- `capture_window`: return PNG image content plus backend and frame-quality evidence. Backends are `auto`, `wgc`, `printwindow`, `dxgi`, and `gdi-screen`.
- `map_coordinates`: convert window/client, normalized, or logical coordinates to screen and capture pixels.

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

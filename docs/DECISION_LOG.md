# Decision log

## D001 - Product name

- Date: 2026-07-17
- Decision: Use `WinSight` / `winsight`; Chinese working name “窗界之眼”.
- Reason: The product will grow beyond one capture bridge into discovery, diagnostics, frame analysis, OCR, and monitoring.

## D002 - Independent implementation

- Date: 2026-07-17
- Decision: Reimplement equivalent capture capabilities using public Windows APIs; do not copy or depend on proprietary streaming-app code.
- Reason: Maintainability, licensing clarity, security, and portability.

## D003 - Version-safe WGC behavior

- Date: 2026-07-17
- Decision: Treat `IsBorderRequired` as optional and call it only when the OS contract supports it.
- Evidence: Windows 10 build 19045 supports `CreateForWindow` but the border property starts at build 20348.

## D004 - File-backed anti-drift workflow

- Date: 2026-07-17
- Decision: Use repository state files, one active task, a consistency gate, and separate `AUTO_VERIFIED` from `USER_ACCEPTED`.
- Reason: Long chats may lose or distort plans; future tasks must reconstruct state from the repository.

## D005 - Controlled input requires prepared observation

- Date: 2026-07-17
- Decision: Input actions use a two-step prepare/execute flow with a short-lived single-use token bound to HWND, bounds, coordinates, and action.
- Reason: External screenshots must not become blind or stale coordinate clicks. Safe local actions may execute automatically after revalidation; authentication, security, payment, permission, CAPTCHA, and password surfaces remain blocked.

## D006 - Gift-event analogy is not product scope

- Date: 2026-07-17
- Decision: Do not add gift-event rules, Douyin integration, or routine per-click user confirmation. Continue the original window capture, mapping, tracking, OCR, change-detection, recording, and safe local input roadmap.
- Reason: The gift example was only a possible implementation analogy and introduced unrelated scope and unnecessary friction.

## D007 - WGC source helper and DXGI provider

- Date: 2026-07-17
- Decision: Build the source-included WGC helper with the Windows-provided .NET Framework compiler and a pinned, SHA-256-verified Microsoft SDK Contracts cache; use FFmpeg `ddagrab` as the current DXGI Desktop Duplication provider.
- Reason: The machine has the required runtime APIs but no Visual Studio or .NET SDK. This preserves a small install footprint while retaining public-source, independently testable implementations and explicit fallback behavior.

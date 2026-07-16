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

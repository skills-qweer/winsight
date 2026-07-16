# Capture backend architecture

## Current backends

### Windows.Graphics.Capture by HWND

- Creates a `GraphicsCaptureItem` with `IGraphicsCaptureItemInterop::CreateForWindow` and captures through a free-threaded D3D11 frame pool.
- Works for the tested WeChat DevTools and Cocos Creator windows on Windows 10 build 19045, including when another window covers the target.
- Never accesses `GraphicsCaptureSession.IsBorderRequired`; builds that lack that optional interface therefore remain supported.
- Discards stale first frames whose content size does not match the capture item, preventing black padding and capture/screen coordinate drift.
- Builds a small source-included helper in local app data. Missing SDK contract metadata is obtained from a pinned, SHA-256-verified Microsoft NuGet package.

### PrintWindow with PW_RENDERFULLCONTENT

- Captures a specific HWND and can work while another window covers the target.
- Works for the tested WeChat DevTools Chromium window on Windows 10 build 19045.
- Some GPU surfaces, protected content, minimized apps, and unresponsive processes can still return black or stale frames.

### GDI screen-region capture

- Copies pixels from the visible desktop rectangle occupied by the window.
- Works across old Windows versions and graphics stacks.
- Captures occluding windows and cannot read a minimized or fully covered target.

### DXGI Desktop Duplication

Uses FFmpeg's `ddagrab` filter, which is backed by DXGI Desktop Duplication, and crops the owning monitor to the target window bounds. The current implementation supports windows wholly contained on one mapped display and returns explicit errors for minimized or multi-output windows, missing dependencies, access denial, session limits, and device failures. This backend captures the rendered desktop and therefore includes occlusion.

## Planned backend work

### D3D11 frame pipeline

Keep frames in GPU memory for continuous capture, resizing, color conversion, and low-latency previews. Add rotation-aware and multi-adapter DXGI mapping. Copy to CPU only for screenshots or OCR.

## Automatic fallback policy

1. Resolve a stable HWND and current bounds.
2. Try WGC if supported without invoking unavailable interfaces.
3. Try `PrintWindow(PW_RENDERFULLCONTENT)`.
4. Try DXGI Desktop Duplication and crop to window bounds.
5. Try GDI screen-region capture.
6. Score every frame for success, dimensions, luminance, color range, stale-frame repetition, and alpha validity.
7. Return the first valid frame plus all attempt metadata.

Never interpret an all-black frame as success merely because the API call returned successfully.

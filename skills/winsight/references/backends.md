# Capture backend architecture

## Current backends

### PrintWindow with PW_RENDERFULLCONTENT

- Captures a specific HWND and can work while another window covers the target.
- Works for the tested WeChat DevTools Chromium window on Windows 10 build 19045.
- Some GPU surfaces, protected content, minimized apps, and unresponsive processes can still return black or stale frames.

### GDI screen-region capture

- Copies pixels from the visible desktop rectangle occupied by the window.
- Works across old Windows versions and graphics stacks.
- Captures occluding windows and cannot read a minimized or fully covered target.

## Planned backends

### Windows.Graphics.Capture without unconditional border configuration

Create a `GraphicsCaptureItem` with `IGraphicsCaptureItemInterop::CreateForWindow`. Only access `GraphicsCaptureSession.IsBorderRequired` when the OS API contract supports it. On older builds, leave the default border behavior intact instead of failing capture.

### DXGI Desktop Duplication

Use `IDXGIOutput1::DuplicateOutput` and crop the acquired desktop texture to the target window bounds. Support negative coordinates, per-monitor scaling, monitor rotation, device loss, and multi-adapter systems. This backend captures the rendered desktop and therefore includes occlusion.

### D3D11 frame pipeline

Keep frames in GPU memory for continuous capture, resizing, color conversion, and low-latency previews. Copy to CPU only for screenshots or OCR.

## Automatic fallback policy

1. Resolve a stable HWND and current bounds.
2. Try WGC if supported without invoking unavailable interfaces.
3. Try `PrintWindow(PW_RENDERFULLCONTENT)`.
4. Try DXGI Desktop Duplication and crop to window bounds.
5. Try GDI screen-region capture.
6. Score every frame for success, dimensions, luminance, color range, stale-frame repetition, and alpha validity.
7. Return the first valid frame plus all attempt metadata.

Never interpret an all-black frame as success merely because the API call returned successfully.

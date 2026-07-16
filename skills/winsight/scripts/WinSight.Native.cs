using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class WinSightNative
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT
    {
        public int X;
        public int Y;
    }

    public sealed class WindowInfo
    {
        public long Hwnd { get; set; }
        public int ProcessId { get; set; }
        public string Title { get; set; }
        public string ClassName { get; set; }
        public bool Visible { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public int ClientX { get; set; }
        public int ClientY { get; set; }
        public int ClientWidth { get; set; }
        public int ClientHeight { get; set; }
        public int Dpi { get; set; }
    }

    public sealed class CaptureInfo
    {
        public bool Success { get; set; }
        public string Backend { get; set; }
        public string OutputPath { get; set; }
        public string Error { get; set; }
        public int Width { get; set; }
        public int Height { get; set; }
        public double MeanRgb { get; set; }
        public double RangeRgb { get; set; }
        public int SampleCount { get; set; }
        public bool LikelyBlackFrame { get; set; }
    }

    public sealed class InputInfo
    {
        public bool Success { get; set; }
        public string Action { get; set; }
        public long Hwnd { get; set; }
        public int ScreenX { get; set; }
        public int ScreenY { get; set; }
        public int VirtualKey { get; set; }
        public string Error { get; set; }
    }

    private delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hwnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextW(IntPtr hwnd, StringBuilder text, int maxCount);

    [DllImport("user32.dll")]
    private static extern int GetWindowTextLengthW(IntPtr hwnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassNameW(IntPtr hwnd, StringBuilder className, int maxCount);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);

    [DllImport("user32.dll")]
    private static extern bool GetClientRect(IntPtr hwnd, out RECT rect);

    [DllImport("user32.dll")]
    private static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hwnd, int command);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint attachThread, uint attachToThread, bool attach);

    [DllImport("user32.dll")]
    private static extern bool BringWindowToTop(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern IntPtr SetActiveWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern IntPtr SetFocus(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte virtualKey, byte scanCode, uint flags, UIntPtr extraInfo);

    [DllImport("user32.dll")]
    private static extern bool PrintWindow(IntPtr hwnd, IntPtr targetDc, uint flags);

    public static WindowInfo[] ListWindows(bool includeHidden)
    {
        List<WindowInfo> windows = new List<WindowInfo>();
        EnumWindows(delegate(IntPtr hwnd, IntPtr ignored)
        {
            bool visible = IsWindowVisible(hwnd);
            int titleLength = GetWindowTextLengthW(hwnd);
            if ((!visible && !includeHidden) || titleLength <= 0)
            {
                return true;
            }

            StringBuilder title = new StringBuilder(titleLength + 1);
            GetWindowTextW(hwnd, title, title.Capacity);
            StringBuilder className = new StringBuilder(256);
            GetClassNameW(hwnd, className, className.Capacity);
            uint processId;
            GetWindowThreadProcessId(hwnd, out processId);
            RECT rect;
            if (!GetWindowRect(hwnd, out rect))
            {
                return true;
            }

            RECT clientRect;
            POINT clientOrigin = new POINT { X = 0, Y = 0 };
            bool hasClientRect = GetClientRect(hwnd, out clientRect) && ClientToScreen(hwnd, ref clientOrigin);
            int dpi = 96;
            try
            {
                uint windowDpi = GetDpiForWindow(hwnd);
                if (windowDpi > 0) dpi = unchecked((int)windowDpi);
            }
            catch (EntryPointNotFoundException)
            {
                dpi = 96;
            }

            windows.Add(new WindowInfo
            {
                Hwnd = hwnd.ToInt64(),
                ProcessId = unchecked((int)processId),
                Title = title.ToString(),
                ClassName = className.ToString(),
                Visible = visible,
                X = rect.Left,
                Y = rect.Top,
                Width = Math.Max(0, rect.Right - rect.Left),
                Height = Math.Max(0, rect.Bottom - rect.Top),
                ClientX = hasClientRect ? clientOrigin.X : rect.Left,
                ClientY = hasClientRect ? clientOrigin.Y : rect.Top,
                ClientWidth = hasClientRect ? Math.Max(0, clientRect.Right - clientRect.Left) : Math.Max(0, rect.Right - rect.Left),
                ClientHeight = hasClientRect ? Math.Max(0, clientRect.Bottom - clientRect.Top) : Math.Max(0, rect.Bottom - rect.Top),
                Dpi = dpi
            });
            return true;
        }, IntPtr.Zero);
        return windows.ToArray();
    }

    public static CaptureInfo CapturePrintWindow(long hwndValue, string outputPath)
    {
        IntPtr hwnd = new IntPtr(hwndValue);
        RECT rect;
        if (!GetWindowRect(hwnd, out rect))
        {
            return Failure("printwindow", outputPath, "GetWindowRect failed");
        }

        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0)
        {
            return Failure("printwindow", outputPath, "Window has an empty capture rectangle");
        }

        try
        {
            using (Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb))
            {
                bool ok;
                using (Graphics graphics = Graphics.FromImage(bitmap))
                {
                    IntPtr dc = graphics.GetHdc();
                    try
                    {
                        ok = PrintWindow(hwnd, dc, 2u);
                    }
                    finally
                    {
                        graphics.ReleaseHdc(dc);
                    }
                }
                if (!ok)
                {
                    return Failure("printwindow", outputPath, "PrintWindow returned false");
                }
                bitmap.Save(outputPath, ImageFormat.Png);
                return Analyze(bitmap, "printwindow", outputPath);
            }
        }
        catch (Exception exception)
        {
            return Failure("printwindow", outputPath, exception.Message);
        }
    }

    public static CaptureInfo CaptureScreenRegion(long hwndValue, string outputPath)
    {
        IntPtr hwnd = new IntPtr(hwndValue);
        RECT rect;
        if (!GetWindowRect(hwnd, out rect))
        {
            return Failure("gdi-screen", outputPath, "GetWindowRect failed");
        }

        int width = rect.Right - rect.Left;
        int height = rect.Bottom - rect.Top;
        if (width <= 0 || height <= 0)
        {
            return Failure("gdi-screen", outputPath, "Window has an empty capture rectangle");
        }

        try
        {
            using (Bitmap bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb))
            {
                using (Graphics graphics = Graphics.FromImage(bitmap))
                {
                    graphics.CopyFromScreen(rect.Left, rect.Top, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
                }
                bitmap.Save(outputPath, ImageFormat.Png);
                return Analyze(bitmap, "gdi-screen", outputPath);
            }
        }
        catch (Exception exception)
        {
            return Failure("gdi-screen", outputPath, exception.Message);
        }
    }

    public static InputInfo ClickWindow(long hwndValue, int screenX, int screenY)
    {
        IntPtr hwnd = new IntPtr(hwndValue);
        RECT rect;
        if (!IsWindow(hwnd) || !GetWindowRect(hwnd, out rect))
        {
            return InputFailure("click", hwndValue, "Target window is not valid");
        }
        if (screenX < rect.Left || screenX >= rect.Right || screenY < rect.Top || screenY >= rect.Bottom)
        {
            return InputFailure("click", hwndValue, "Screen coordinate is outside the current window bounds");
        }

        try
        {
            if (!ActivateWindow(hwnd))
            {
                return InputFailure("click", hwndValue, "Target window could not be activated");
            }
            if (!SetCursorPos(screenX, screenY))
            {
                return InputFailure("click", hwndValue, "SetCursorPos failed");
            }
            mouse_event(0x0002u, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(35);
            mouse_event(0x0004u, 0, 0, 0, UIntPtr.Zero);
            return new InputInfo
            {
                Success = true,
                Action = "click",
                Hwnd = hwndValue,
                ScreenX = screenX,
                ScreenY = screenY
            };
        }
        catch (Exception exception)
        {
            return InputFailure("click", hwndValue, exception.Message);
        }
    }

    public static InputInfo KeyPressWindow(long hwndValue, int virtualKey)
    {
        IntPtr hwnd = new IntPtr(hwndValue);
        if (!IsWindow(hwnd))
        {
            return InputFailure("key", hwndValue, "Target window is not valid");
        }
        if (virtualKey <= 0 || virtualKey > 255)
        {
            return InputFailure("key", hwndValue, "Virtual key is outside the supported range");
        }

        try
        {
            if (!ActivateWindow(hwnd))
            {
                return InputFailure("key", hwndValue, "Target window could not be activated");
            }
            keybd_event(unchecked((byte)virtualKey), 0, 0, UIntPtr.Zero);
            Thread.Sleep(35);
            keybd_event(unchecked((byte)virtualKey), 0, 0x0002u, UIntPtr.Zero);
            return new InputInfo
            {
                Success = true,
                Action = "key",
                Hwnd = hwndValue,
                VirtualKey = virtualKey
            };
        }
        catch (Exception exception)
        {
            return InputFailure("key", hwndValue, exception.Message);
        }
    }

    private static CaptureInfo Analyze(Bitmap bitmap, string backend, string outputPath)
    {
        int stepX = Math.Max(1, bitmap.Width / 64);
        int stepY = Math.Max(1, bitmap.Height / 64);
        long total = 0;
        int samples = 0;
        int minimum = 255;
        int maximum = 0;

        for (int y = 0; y < bitmap.Height; y += stepY)
        {
            for (int x = 0; x < bitmap.Width; x += stepX)
            {
                Color pixel = bitmap.GetPixel(x, y);
                int channels = pixel.R + pixel.G + pixel.B;
                total += channels;
                samples += 3;
                minimum = Math.Min(minimum, Math.Min(pixel.R, Math.Min(pixel.G, pixel.B)));
                maximum = Math.Max(maximum, Math.Max(pixel.R, Math.Max(pixel.G, pixel.B)));
            }
        }

        double mean = samples == 0 ? 0 : (double)total / samples;
        double range = maximum - minimum;
        return new CaptureInfo
        {
            Success = true,
            Backend = backend,
            OutputPath = outputPath,
            Width = bitmap.Width,
            Height = bitmap.Height,
            MeanRgb = Math.Round(mean, 2),
            RangeRgb = range,
            SampleCount = samples / 3,
            LikelyBlackFrame = mean < 2.0 || range < 3.0
        };
    }

    private static CaptureInfo Failure(string backend, string outputPath, string error)
    {
        return new CaptureInfo
        {
            Success = false,
            Backend = backend,
            OutputPath = outputPath,
            Error = error,
            LikelyBlackFrame = true
        };
    }

    private static InputInfo InputFailure(string action, long hwndValue, string error)
    {
        return new InputInfo
        {
            Success = false,
            Action = action,
            Hwnd = hwndValue,
            Error = error
        };
    }

    private static bool ActivateWindow(IntPtr hwnd)
    {
        ShowWindow(hwnd, 9);
        uint currentThread = GetCurrentThreadId();
        uint ignoredProcess;
        uint targetThread = GetWindowThreadProcessId(hwnd, out ignoredProcess);
        IntPtr foreground = GetForegroundWindow();
        uint foregroundThread = foreground == IntPtr.Zero ? 0 : GetWindowThreadProcessId(foreground, out ignoredProcess);
        bool attachedTarget = false;
        bool attachedForeground = false;

        try
        {
            if (targetThread != 0 && targetThread != currentThread)
            {
                attachedTarget = AttachThreadInput(currentThread, targetThread, true);
            }
            if (foregroundThread != 0 && foregroundThread != currentThread && foregroundThread != targetThread)
            {
                attachedForeground = AttachThreadInput(currentThread, foregroundThread, true);
            }
            BringWindowToTop(hwnd);
            SetForegroundWindow(hwnd);
            SetActiveWindow(hwnd);
            SetFocus(hwnd);
        }
        finally
        {
            if (attachedForeground) AttachThreadInput(currentThread, foregroundThread, false);
            if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
        }

        Thread.Sleep(120);
        return GetForegroundWindow() == hwnd;
    }
}

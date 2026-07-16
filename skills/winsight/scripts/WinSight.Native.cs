using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

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
                Height = Math.Max(0, rect.Bottom - rect.Top)
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
}

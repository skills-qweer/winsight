using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Threading;
using Windows.Foundation;
using Windows.Graphics.Capture;
using Windows.Graphics.DirectX;
using Windows.Graphics.DirectX.Direct3D11;
using Windows.Graphics.Imaging;
using Windows.Storage.Streams;

internal static class WinSightWgc
{
    [ComImport]
    [Guid("3628E81B-3CAC-4C60-B7F4-23CE0E0C3356")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IGraphicsCaptureItemInterop
    {
        [PreserveSig]
        int CreateForWindow(IntPtr window, ref Guid iid, out IntPtr result);

        [PreserveSig]
        int CreateForMonitor(IntPtr monitor, ref Guid iid, out IntPtr result);
    }

    [DllImport("d3d11.dll")]
    private static extern int D3D11CreateDevice(
        IntPtr adapter,
        int driverType,
        IntPtr software,
        uint flags,
        IntPtr featureLevels,
        uint featureLevelCount,
        uint sdkVersion,
        out IntPtr device,
        out int featureLevel,
        out IntPtr immediateContext);

    [DllImport("d3d11.dll")]
    private static extern int CreateDirect3D11DeviceFromDXGIDevice(
        IntPtr dxgiDevice,
        out IntPtr graphicsDevice);

    private static readonly Guid GraphicsCaptureItemInterface = new Guid("79C3F95B-31F7-4EC2-A464-632EF5D30760");
    private static readonly Guid DxgiDeviceInterface = new Guid("54EC77FA-1377-44E6-8C32-88FD5F44C84C");

    private static void ThrowIfFailed(int result, string operation)
    {
        if (result < 0)
        {
            throw new COMException(operation + " failed", result);
        }
    }

    private static GraphicsCaptureItem CreateCaptureItem(IntPtr window)
    {
        object factory = WindowsRuntimeMarshal.GetActivationFactory(typeof(GraphicsCaptureItem));
        IGraphicsCaptureItemInterop interop = (IGraphicsCaptureItemInterop)factory;
        IntPtr itemPointer = IntPtr.Zero;
        try
        {
            Guid iid = GraphicsCaptureItemInterface;
            ThrowIfFailed(interop.CreateForWindow(window, ref iid, out itemPointer), "CreateForWindow");
            return (GraphicsCaptureItem)Marshal.GetObjectForIUnknown(itemPointer);
        }
        finally
        {
            if (itemPointer != IntPtr.Zero) Marshal.Release(itemPointer);
        }
    }

    private static IDirect3DDevice CreateGraphicsDevice()
    {
        IntPtr d3dDevice = IntPtr.Zero;
        IntPtr immediateContext = IntPtr.Zero;
        IntPtr dxgiDevice = IntPtr.Zero;
        IntPtr graphicsDevice = IntPtr.Zero;
        try
        {
            int featureLevel;
            int result = D3D11CreateDevice(
                IntPtr.Zero,
                1,
                IntPtr.Zero,
                0x20u,
                IntPtr.Zero,
                0,
                7,
                out d3dDevice,
                out featureLevel,
                out immediateContext);
            if (result < 0)
            {
                result = D3D11CreateDevice(
                    IntPtr.Zero,
                    5,
                    IntPtr.Zero,
                    0x20u,
                    IntPtr.Zero,
                    0,
                    7,
                    out d3dDevice,
                    out featureLevel,
                    out immediateContext);
            }
            ThrowIfFailed(result, "D3D11CreateDevice");

            Guid iid = DxgiDeviceInterface;
            ThrowIfFailed(Marshal.QueryInterface(d3dDevice, ref iid, out dxgiDevice), "QueryInterface(IDXGIDevice)");
            ThrowIfFailed(CreateDirect3D11DeviceFromDXGIDevice(dxgiDevice, out graphicsDevice), "CreateDirect3D11DeviceFromDXGIDevice");
            return (IDirect3DDevice)Marshal.GetObjectForIUnknown(graphicsDevice);
        }
        finally
        {
            if (graphicsDevice != IntPtr.Zero) Marshal.Release(graphicsDevice);
            if (dxgiDevice != IntPtr.Zero) Marshal.Release(dxgiDevice);
            if (immediateContext != IntPtr.Zero) Marshal.Release(immediateContext);
            if (d3dDevice != IntPtr.Zero) Marshal.Release(d3dDevice);
        }
    }

    private static void SaveSurface(IDirect3DSurface surface, string outputPath)
    {
        using (SoftwareBitmap bitmap = SoftwareBitmap.CreateCopyFromSurfaceAsync(surface).AsTask().GetAwaiter().GetResult())
        using (InMemoryRandomAccessStream stream = new InMemoryRandomAccessStream())
        {
            BitmapEncoder encoder = BitmapEncoder.CreateAsync(BitmapEncoder.PngEncoderId, stream).AsTask().GetAwaiter().GetResult();
            encoder.SetSoftwareBitmap(bitmap);
            encoder.FlushAsync().AsTask().GetAwaiter().GetResult();
            stream.Seek(0);
            uint length = checked((uint)stream.Size);
            using (DataReader reader = new DataReader(stream.GetInputStreamAt(0)))
            {
                reader.LoadAsync(length).AsTask().GetAwaiter().GetResult();
                byte[] bytes = new byte[length];
                reader.ReadBytes(bytes);
                File.WriteAllBytes(outputPath, bytes);
            }
        }
    }

    private static void Capture(long windowValue, string outputPath)
    {
        GraphicsCaptureItem item = CreateCaptureItem(new IntPtr(windowValue));
        IDirect3DDevice device = CreateGraphicsDevice();
        Direct3D11CaptureFramePool framePool = null;
        GraphicsCaptureSession session = null;
        Direct3D11CaptureFrame capturedFrame = null;
        ManualResetEventSlim frameReady = new ManualResetEventSlim(false);
        TypedEventHandler<Direct3D11CaptureFramePool, object> frameArrived = null;
        int mismatchedFrames = 0;
        int lastMismatchWidth = 0;
        int lastMismatchHeight = 0;

        try
        {
            framePool = Direct3D11CaptureFramePool.CreateFreeThreaded(
                device,
                DirectXPixelFormat.B8G8R8A8UIntNormalized,
                2,
                item.Size);
            frameArrived = delegate(Direct3D11CaptureFramePool sender, object ignored)
            {
                Direct3D11CaptureFrame frame = sender.TryGetNextFrame();
                if (frame == null) return;
                if (frame.ContentSize.Width != item.Size.Width || frame.ContentSize.Height != item.Size.Height)
                {
                    lastMismatchWidth = frame.ContentSize.Width;
                    lastMismatchHeight = frame.ContentSize.Height;
                    Interlocked.Increment(ref mismatchedFrames);
                    frame.Dispose();
                    return;
                }
                if (Interlocked.CompareExchange(ref capturedFrame, frame, null) == null)
                {
                    frameReady.Set();
                }
                else
                {
                    frame.Dispose();
                }
            };
            framePool.FrameArrived += frameArrived;
            session = framePool.CreateCaptureSession(item);
            session.StartCapture();
            Stopwatch wait = Stopwatch.StartNew();
            while (!frameReady.Wait(200))
            {
                if (Volatile.Read(ref mismatchedFrames) > 0 && wait.Elapsed >= TimeSpan.FromSeconds(2))
                {
                    throw new InvalidOperationException(
                        "WGC content size " + lastMismatchWidth + "x" + lastMismatchHeight
                        + " did not converge to the window capture size " + item.Size.Width + "x" + item.Size.Height + ".");
                }
                if (wait.Elapsed >= TimeSpan.FromSeconds(8))
                {
                    throw new TimeoutException("WGC did not produce a frame within 8 seconds.");
                }
            }
            SaveSurface(capturedFrame.Surface, outputPath);
        }
        finally
        {
            if (framePool != null && frameArrived != null) framePool.FrameArrived -= frameArrived;
            if (capturedFrame != null) capturedFrame.Dispose();
            if (session != null) session.Dispose();
            if (framePool != null) framePool.Dispose();
            frameReady.Dispose();
            if (item != null && Marshal.IsComObject(item)) Marshal.ReleaseComObject(item);
            if (device != null && Marshal.IsComObject(device)) Marshal.ReleaseComObject(device);
        }
    }

    public static int Main(string[] arguments)
    {
        if (arguments.Length != 2)
        {
            Console.Error.WriteLine("Usage: WinSight.Wgc.exe <hwnd> <output.png>");
            return 2;
        }

        long window;
        if (!long.TryParse(arguments[0], out window) || window == 0)
        {
            Console.Error.WriteLine("Invalid HWND.");
            return 2;
        }

        try
        {
            string outputPath = Path.GetFullPath(arguments[1]);
            Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
            Capture(window, outputPath);
            return 0;
        }
        catch (Exception exception)
        {
            COMException com = exception as COMException;
            if (com != null)
            {
                Console.Error.WriteLine("0x" + com.ErrorCode.ToString("X8") + ": " + com.Message);
            }
            else
            {
                Console.Error.WriteLine(exception.GetType().Name + ": " + exception.Message);
            }
            return 1;
        }
    }
}

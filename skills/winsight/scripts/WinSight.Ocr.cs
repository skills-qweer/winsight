using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices.WindowsRuntime;
using System.Web.Script.Serialization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;
using Windows.Storage.Streams;

internal static class WinSightOcr
{
    private static Dictionary<string, object> Bounds(Windows.Foundation.Rect rect)
    {
        return new Dictionary<string, object>
        {
            { "x", Math.Round(rect.X, 3) },
            { "y", Math.Round(rect.Y, 3) },
            { "width", Math.Round(rect.Width, 3) },
            { "height", Math.Round(rect.Height, 3) }
        };
    }

    private static Dictionary<string, object> Recognize(string inputPath)
    {
        OcrEngine engine = OcrEngine.TryCreateFromUserProfileLanguages();
        if (engine == null)
        {
            throw new InvalidOperationException("Windows.Media.Ocr has no installed user-profile recognition language.");
        }

        StorageFile file = StorageFile.GetFileFromPathAsync(inputPath).AsTask().GetAwaiter().GetResult();
        using (IRandomAccessStream stream = file.OpenAsync(FileAccessMode.Read).AsTask().GetAwaiter().GetResult())
        {
            BitmapDecoder decoder = BitmapDecoder.CreateAsync(stream).AsTask().GetAwaiter().GetResult();
            if (decoder.PixelWidth > OcrEngine.MaxImageDimension || decoder.PixelHeight > OcrEngine.MaxImageDimension)
            {
                throw new InvalidOperationException("Image dimensions exceed Windows.Media.Ocr.MaxImageDimension.");
            }
            using (SoftwareBitmap bitmap = decoder.GetSoftwareBitmapAsync(BitmapPixelFormat.Bgra8, BitmapAlphaMode.Ignore).AsTask().GetAwaiter().GetResult())
            {
                OcrResult result = engine.RecognizeAsync(bitmap).AsTask().GetAwaiter().GetResult();
                List<object> lines = new List<object>();
                foreach (OcrLine line in result.Lines)
                {
                    List<object> words = new List<object>();
                    foreach (OcrWord word in line.Words)
                    {
                        words.Add(new Dictionary<string, object>
                        {
                            { "text", word.Text },
                            { "bounds", Bounds(word.BoundingRect) }
                        });
                    }
                    lines.Add(new Dictionary<string, object>
                    {
                        { "text", line.Text },
                        { "words", words }
                    });
                }

                return new Dictionary<string, object>
                {
                    { "success", true },
                    { "provider", "windows.media.ocr" },
                    { "language", engine.RecognizerLanguage == null ? null : engine.RecognizerLanguage.LanguageTag },
                    { "text", result.Text },
                    { "textAngle", result.TextAngle.HasValue ? (object)Math.Round(result.TextAngle.Value, 4) : null },
                    { "confidenceAvailable", false },
                    { "width", decoder.PixelWidth },
                    { "height", decoder.PixelHeight },
                    { "lines", lines }
                };
            }
        }
    }

    public static int Main(string[] arguments)
    {
        if (arguments.Length != 1)
        {
            Console.Error.WriteLine("Usage: WinSight.Ocr.exe <input.png>");
            return 2;
        }

        try
        {
            Dictionary<string, object> result = Recognize(Path.GetFullPath(arguments[0]));
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            Console.WriteLine(new JavaScriptSerializer().Serialize(result));
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine(exception.GetType().Name + ": " + exception.Message);
            return 1;
        }
    }
}

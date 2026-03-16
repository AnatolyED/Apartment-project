using ApartmentBot.Bot.Services;
using ApartmentBot.Infrastructure.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace ApartmentBot.Tests;

public sealed class TelegramMediaServiceTests
{
    [Fact]
    public void BuildWebPanelFileUrl_StripsApiSuffix()
    {
        var service = CreateService("http://localhost:3000/api");

        var result = service.BuildWebPanelFileUrl("/uploads/apartments/test/photo.png");

        Assert.Equal("http://localhost:3000/uploads/apartments/test/photo.png", result);
    }

    [Fact]
    public void BuildWebPanelFileUrl_UsesBaseUrlAsIs_WhenApiSuffixMissing()
    {
        var service = CreateService("https://panel.example.com");

        var result = service.BuildWebPanelFileUrl("/uploads/districts/test/photo.jpg");

        Assert.Equal("https://panel.example.com/uploads/districts/test/photo.jpg", result);
    }

    [Fact]
    public async Task LoadPhotoAsInputFileAsync_UsesLocalPhotoFromWebPanelPublicUploads()
    {
        var service = CreateService("http://localhost:3000/api");
        var relativePath = $"/uploads/test-media/{Guid.NewGuid():N}/photo.png";
        var repoRoot = Directory.GetCurrentDirectory();
        var localPath = Path.Combine(
            repoRoot,
            "web-panel",
            "public",
            relativePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));

        Directory.CreateDirectory(Path.GetDirectoryName(localPath)!);

        try
        {
            await File.WriteAllBytesAsync(localPath, CreateTinyPngBytes());

            var inputFile = await service.LoadPhotoAsInputFileAsync(
                relativePath,
                "http://localhost:3000/uploads/test-media/photo.png",
                CancellationToken.None);

            Assert.NotNull(inputFile);
            Assert.Equal("InputFileStream", inputFile.GetType().Name);
            var fileName = GetStringProperty(inputFile, "FileName");
            Assert.StartsWith("photo.", fileName);
            Assert.Contains(Path.GetExtension(fileName), new[] { ".jpg", ".png" });
        }
        finally
        {
            if (File.Exists(localPath))
            {
                File.Delete(localPath);
            }

            var directory = Path.GetDirectoryName(localPath);
            while (!string.IsNullOrEmpty(directory)
                   && !string.Equals(directory, Path.Combine(repoRoot, "web-panel", "public"), StringComparison.OrdinalIgnoreCase)
                   && Directory.Exists(directory)
                   && !Directory.EnumerateFileSystemEntries(directory).Any())
            {
                Directory.Delete(directory);
                directory = Path.GetDirectoryName(directory);
            }
        }
    }

    private static TelegramMediaService CreateService(string baseUrl)
    {
        return new TelegramMediaService(
            Options.Create(new WebPanelSettings
            {
                BaseUrl = baseUrl
            }),
            NullLogger<TelegramMediaService>.Instance);
    }

    private static string GetStringProperty(object target, string propertyName)
    {
        return (string)(target.GetType().GetProperty(propertyName)?.GetValue(target)
            ?? throw new InvalidOperationException($"Property {propertyName} not found."));
    }

    private static byte[] CreateTinyPngBytes()
    {
        return Convert.FromBase64String(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XWZ0AAAAASUVORK5CYII=");
    }
}

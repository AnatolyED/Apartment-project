using ApartmentBot.Infrastructure.Configuration;
using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Processing;
using Telegram.Bot.Types;

namespace ApartmentBot.Bot.Services;

public interface ITelegramMediaService
{
    string BuildWebPanelFileUrl(string relativePath);
    Task<InputFile> LoadPhotoAsInputFileAsync(string relativePath, string fullUrl, CancellationToken cancellationToken);
}

public sealed class TelegramMediaService : ITelegramMediaService
{
    private readonly IOptions<WebPanelSettings> _webPanelSettings;
    private readonly ILogger<TelegramMediaService> _logger;

    public TelegramMediaService(
        IOptions<WebPanelSettings> webPanelSettings,
        ILogger<TelegramMediaService> logger)
    {
        _webPanelSettings = webPanelSettings;
        _logger = logger;
    }

    public string BuildWebPanelFileUrl(string relativePath)
    {
        var baseUrl = _webPanelSettings.Value.BaseUrl.TrimEnd('/');
        if (baseUrl.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
        {
            baseUrl = baseUrl[..^4];
        }

        return $"{baseUrl}{relativePath}";
    }

    public async Task<InputFile> LoadPhotoAsInputFileAsync(string relativePath, string fullUrl, CancellationToken cancellationToken)
    {
        var totalStopwatch = Stopwatch.StartNew();
        var preferredRelativePath = GetTelegramReadyRelativePath(relativePath) ?? relativePath;
        var preferredFullUrl = preferredRelativePath == relativePath
            ? fullUrl
            : BuildWebPanelFileUrl(preferredRelativePath);

        var localPath = TryResolveLocalPhotoPath(preferredRelativePath);
        if (!string.IsNullOrEmpty(localPath))
        {
            _logger.LogInformation("Загрузка фото с диска: {Path}", localPath);
            var inputFile = CreateInputFileFromLocalPath(localPath);
            _logger.LogInformation(
                "Медиа-пайплайн: локальное фото подготовлено за {ElapsedMs} мс. Path={Path}",
                totalStopwatch.ElapsedMilliseconds,
                localPath);
            return inputFile;
        }

        var originalLocalPath = preferredRelativePath == relativePath
            ? null
            : TryResolveLocalPhotoPath(relativePath);

        if (!string.IsNullOrEmpty(originalLocalPath))
        {
            _logger.LogInformation("Telegram-ready версия не найдена. Используем исходное фото с диска: {Path}", originalLocalPath);
            var inputFile = CreateInputFileFromLocalPath(originalLocalPath);
            _logger.LogInformation(
                "Медиа-пайплайн: исходное локальное фото подготовлено за {ElapsedMs} мс. Path={Path}",
                totalStopwatch.ElapsedMilliseconds,
                originalLocalPath);
            return inputFile;
        }

        _logger.LogInformation("Локальное фото не найдено. Переходим к HTTP-загрузке: {Url}", preferredFullUrl);
        var downloadedFile = await DownloadPhotoAsInputFileAsync(preferredFullUrl, cancellationToken);
        _logger.LogInformation(
            "Медиа-пайплайн: HTTP-фото подготовлено за {ElapsedMs} мс. Url={Url}",
            totalStopwatch.ElapsedMilliseconds,
            preferredFullUrl);
        return downloadedFile;
    }

    private InputFile CreateInputFileFromLocalPath(string localPath)
    {
        if (localPath.EndsWith("-telegram.jpg", StringComparison.OrdinalIgnoreCase))
        {
            var memoryStream = new MemoryStream(File.ReadAllBytes(localPath));
            memoryStream.Position = 0;

            _logger.LogInformation("Используем готовую Telegram-ready версию без дополнительной конвертации: {Path}", localPath);
            return InputFile.FromStream(memoryStream, Path.GetFileName(localPath));
        }

        var processingStopwatch = Stopwatch.StartNew();
        try
        {
            using var image = Image.Load(localPath);

            image.Mutate(static context => context.Resize(new ResizeOptions
            {
                Mode = ResizeMode.Max,
                Size = new Size(1280, 1280),
            }));

            var memoryStream = new MemoryStream();
            image.Save(memoryStream, new JpegEncoder { Quality = 75 });
            memoryStream.Position = 0;

            var photoSizeKb = Math.Round(memoryStream.Length / 1024d, 1);
            _logger.LogInformation(
                "Подготовлено локальное фото для Telegram: Path={Path}, Width={Width}, Height={Height}, SizeKb={SizeKb}, ElapsedMs={ElapsedMs}",
                localPath,
                image.Width,
                image.Height,
                photoSizeKb,
                processingStopwatch.ElapsedMilliseconds);

            var baseFileName = Path.GetFileNameWithoutExtension(localPath);
            if (string.IsNullOrWhiteSpace(baseFileName))
            {
                baseFileName = "photo";
            }

            return InputFile.FromStream(memoryStream, $"{baseFileName}.jpg");
        }
        catch
        {
            _logger.LogWarning(
                "Не удалось подготовить фото через ImageSharp. Используем исходный файл без конвертации: {Path}",
                localPath);

            var memoryStream = new MemoryStream(File.ReadAllBytes(localPath));
            memoryStream.Position = 0;

            var fileName = Path.GetFileName(localPath);
            if (string.IsNullOrWhiteSpace(fileName))
            {
                fileName = "photo.jpg";
            }

            return InputFile.FromStream(memoryStream, fileName);
        }
    }

    private static string? TryResolveLocalPhotoPath(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return null;
        }

        var normalizedRelativePath = relativePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        var searchRoots = new[]
        {
            "/shared-uploads",
            Directory.GetCurrentDirectory(),
            AppContext.BaseDirectory,
        };

        foreach (var root in searchRoots.Where(static path => !string.IsNullOrWhiteSpace(path)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            var resolvedPath = TryResolveFromRoot(root, normalizedRelativePath);
            if (!string.IsNullOrEmpty(resolvedPath))
            {
                return resolvedPath;
            }
        }

        return null;
    }

    private static string? GetTelegramReadyRelativePath(string relativePath)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return null;
        }

        var extensionIndex = relativePath.LastIndexOf('.');
        if (extensionIndex <= 0)
        {
            return null;
        }

        return $"{relativePath[..extensionIndex]}-telegram.jpg";
    }

    private static string? TryResolveFromRoot(string rootPath, string normalizedRelativePath)
    {
        var rootCandidate = Path.Combine(rootPath, normalizedRelativePath);
        if (File.Exists(rootCandidate))
        {
            return rootCandidate;
        }

        var uploadsRelativePath = normalizedRelativePath.StartsWith($"uploads{Path.DirectorySeparatorChar}", StringComparison.OrdinalIgnoreCase)
            ? normalizedRelativePath[("uploads" + Path.DirectorySeparatorChar).Length..]
            : null;

        if (!string.IsNullOrEmpty(uploadsRelativePath))
        {
            var sharedUploadsCandidate = Path.Combine(rootPath, uploadsRelativePath);
            if (File.Exists(sharedUploadsCandidate))
            {
                return sharedUploadsCandidate;
            }
        }

        var directory = new DirectoryInfo(Path.GetFullPath(rootPath));

        while (directory is not null)
        {
            var directCandidate = Path.Combine(directory.FullName, "web-panel", "public", normalizedRelativePath);
            if (File.Exists(directCandidate))
            {
                return directCandidate;
            }

            var nestedCandidate = Path.Combine(directory.FullName, "Apartment project", "web-panel", "public", normalizedRelativePath);
            if (File.Exists(nestedCandidate))
            {
                return nestedCandidate;
            }

            directory = directory.Parent;
        }

        return null;
    }

    private static async Task<InputFile> DownloadPhotoAsInputFileAsync(string fullUrl, CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();
        using var httpClient = new HttpClient();
        using var photoStream = await httpClient.GetStreamAsync(fullUrl, cancellationToken);
        var memoryStream = new MemoryStream();
        await photoStream.CopyToAsync(memoryStream, cancellationToken);
        memoryStream.Position = 0;

        var fileName = Path.GetFileName(new Uri(fullUrl).AbsolutePath);
        if (string.IsNullOrWhiteSpace(fileName))
        {
            fileName = "photo.jpg";
        }

        stopwatch.Stop();
        return InputFile.FromStream(memoryStream, fileName);
    }
}

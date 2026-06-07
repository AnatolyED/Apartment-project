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
    private const long MaxTelegramPhotoBytes = 10 * 1024 * 1024;
    private const int TelegramMaxDimension = 2048;
    private const int TelegramJpegQuality = 92;

    private readonly IOptions<WebPanelSettings> _webPanelSettings;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<TelegramMediaService> _logger;

    public TelegramMediaService(
        IOptions<WebPanelSettings> webPanelSettings,
        IHttpClientFactory httpClientFactory,
        ILogger<TelegramMediaService> logger)
    {
        _webPanelSettings = webPanelSettings;
        _httpClientFactory = httpClientFactory;
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
        var telegramReadyRelativePath = GetTelegramReadyRelativePath(relativePath);

        var localPath = TryResolveLocalPhotoPath(relativePath);
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

        var telegramReadyLocalPath = telegramReadyRelativePath is null
            ? null
            : TryResolveLocalPhotoPath(telegramReadyRelativePath);

        if (!string.IsNullOrEmpty(telegramReadyLocalPath))
        {
            _logger.LogInformation("Используем Telegram-ready фото с диска: {Path}", telegramReadyLocalPath);
            var inputFile = CreateInputFileFromLocalPath(telegramReadyLocalPath);
            _logger.LogInformation(
                "Медиа-пайплайн: локальное фото подготовлено за {ElapsedMs} мс. Path={Path}",
                totalStopwatch.ElapsedMilliseconds,
                telegramReadyLocalPath);
            return inputFile;
        }

        _logger.LogInformation("Локальное фото не найдено. Переходим к HTTP-загрузке: {Url}", fullUrl);
        var downloadedFile = await DownloadPhotoAsInputFileAsync(fullUrl, cancellationToken);
        _logger.LogInformation(
            "Медиа-пайплайн: HTTP-фото подготовлено за {ElapsedMs} мс. Url={Url}",
            totalStopwatch.ElapsedMilliseconds,
            fullUrl);
        return downloadedFile;
    }

    private InputFile CreateInputFileFromLocalPath(string localPath)
    {
        if (CanSendOriginalPhoto(localPath))
        {
            var memoryStream = new MemoryStream(File.ReadAllBytes(localPath));
            memoryStream.Position = 0;

            _logger.LogInformation("Используем локальное фото без дополнительной конвертации: {Path}", localPath);
            return InputFile.FromStream(memoryStream, Path.GetFileName(localPath));
        }

        var processingStopwatch = Stopwatch.StartNew();
        try
        {
            using var image = Image.Load(localPath);

            image.Mutate(static context => context.Resize(new ResizeOptions
            {
                Mode = ResizeMode.Max,
                Size = new Size(TelegramMaxDimension, TelegramMaxDimension),
            }));

            var memoryStream = new MemoryStream();
            image.Save(memoryStream, new JpegEncoder { Quality = TelegramJpegQuality });
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

    private static bool CanSendOriginalPhoto(string localPath)
    {
        var extension = Path.GetExtension(localPath);
        return (
            string.Equals(extension, ".jpg", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(extension, ".jpeg", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(extension, ".png", StringComparison.OrdinalIgnoreCase)
        ) && new FileInfo(localPath).Length <= MaxTelegramPhotoBytes;
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

    private async Task<InputFile> DownloadPhotoAsInputFileAsync(string fullUrl, CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();
        var httpClient = _httpClientFactory.CreateClient("telegram-media");
        using var response = await httpClient.GetAsync(
            fullUrl,
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);

        response.EnsureSuccessStatusCode();

        if (response.Content.Headers.ContentLength is > MaxTelegramPhotoBytes)
        {
            throw new InvalidOperationException("HTTP photo is larger than the configured limit.");
        }

        using var photoStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var memoryStream = new MemoryStream();
        await CopyToLimitedMemoryStreamAsync(photoStream, memoryStream, MaxTelegramPhotoBytes, cancellationToken);
        memoryStream.Position = 0;

        var fileName = Path.GetFileName(new Uri(fullUrl).AbsolutePath);
        if (string.IsNullOrWhiteSpace(fileName))
        {
            fileName = "photo.jpg";
        }

        stopwatch.Stop();
        return InputFile.FromStream(memoryStream, fileName);
    }

    private static async Task CopyToLimitedMemoryStreamAsync(
        Stream source,
        MemoryStream destination,
        long maxBytes,
        CancellationToken cancellationToken)
    {
        var buffer = new byte[81920];
        long totalBytes = 0;

        while (true)
        {
            var bytesRead = await source.ReadAsync(buffer, cancellationToken);
            if (bytesRead == 0)
            {
                return;
            }

            totalBytes += bytesRead;
            if (totalBytes > maxBytes)
            {
                throw new InvalidOperationException("HTTP photo is larger than the configured limit.");
            }

            await destination.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken);
        }
    }
}

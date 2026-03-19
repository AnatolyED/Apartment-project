namespace ApartmentBot.Infrastructure.Configuration;

public sealed class WebPanelSettings
{
    public const string SectionName = "WebPanel";
    public string BaseUrl { get; init; } = "http://localhost:3000/api";
}

public sealed class TelegramSettings
{
    public const string SectionName = "Telegram";
    public string BotToken { get; init; } = string.Empty;
    public long? ManagerChatId { get; init; }
}

public sealed class MaxSettings
{
    public const string SectionName = "Max";
    public string BotToken { get; init; } = string.Empty;
    public string ReceiveMode { get; init; } = "Polling";
    public string? WebhookUrl { get; init; }
    public string? WebhookSecret { get; init; }
    public int HttpTimeoutSeconds { get; init; } = 15;
}

public sealed class RedisSettings
{
    public const string SectionName = "Redis";
    public string ConnectionString { get; init; } = "localhost:6379";
    public int UserStateTtlMinutes { get; init; } = 30;
}
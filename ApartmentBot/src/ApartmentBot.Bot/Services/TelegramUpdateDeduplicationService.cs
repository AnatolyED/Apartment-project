using StackExchange.Redis;
using Telegram.Bot.Types;

namespace ApartmentBot.Bot.Services;

public interface ITelegramUpdateDeduplicationService
{
    Task<bool> IsDuplicateAsync(Update update, CancellationToken cancellationToken = default);
}

public sealed class TelegramUpdateDeduplicationService : ITelegramUpdateDeduplicationService
{
    private static readonly TimeSpan DuplicateTtl = TimeSpan.FromSeconds(30);
    private const string Prefix = "telegram:update-dedupe";

    private readonly IConnectionMultiplexer _redis;

    public TelegramUpdateDeduplicationService(IConnectionMultiplexer redis)
    {
        _redis = redis;
    }

    public async Task<bool> IsDuplicateAsync(Update update, CancellationToken cancellationToken = default)
    {
        var key = BuildKey(update);
        if (string.IsNullOrEmpty(key))
        {
            return false;
        }

        var db = _redis.GetDatabase();
        var wasStored = await db.StringSetAsync(
            key,
            "1",
            DuplicateTtl,
            when: When.NotExists);

        return !wasStored;
    }

    public static string? BuildKey(Update update)
    {
        if (update.CallbackQuery is not null && !string.IsNullOrWhiteSpace(update.CallbackQuery.Id))
        {
            return $"{Prefix}:callback:{update.CallbackQuery.Id}";
        }

        if (update.Id != 0)
        {
            return $"{Prefix}:update:{update.Id}";
        }

        return null;
    }
}

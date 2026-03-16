using System.Text.Json;
using ApartmentBot.Domain.Interfaces;
using ApartmentBot.Infrastructure.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace ApartmentBot.Infrastructure.State;

public sealed class RedisUserStateRepository : IUserStateRepository
{
    private readonly IConnectionMultiplexer _redis;
    private readonly ILogger<RedisUserStateRepository> _logger;
    private readonly JsonSerializerOptions _jsonOptions;
    private readonly TimeSpan _userStateTtl;
    private const string KeyPrefix = "user:state:";

    public RedisUserStateRepository(
        IConnectionMultiplexer redis,
        IOptions<RedisSettings> redisSettings,
        ILogger<RedisUserStateRepository> logger)
    {
        _redis = redis;
        _logger = logger;
        var ttlMinutes = Math.Max(1, redisSettings.Value.UserStateTtlMinutes);
        _userStateTtl = TimeSpan.FromMinutes(ttlMinutes);
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
        };
    }

    public async Task<UserState?> GetAsync(long userId, CancellationToken cancellationToken = default)
    {
        try
        {
            var db = _redis.GetDatabase();
            var key = $"{KeyPrefix}{userId}";
            var value = await db.StringGetAsync(key);

            if (value.IsNullOrEmpty)
                return null;

            return JsonSerializer.Deserialize<UserState>(value.ToString()!, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при получении состояния пользователя {UserId}", userId);
            return null;
        }
    }

    public async Task SetAsync(long userId, UserState state, CancellationToken cancellationToken = default)
    {
        try
        {
            var db = _redis.GetDatabase();
            var key = $"{KeyPrefix}{userId}";
            var serializedValue = JsonSerializer.Serialize(state, _jsonOptions);
            await db.StringSetAsync(key, serializedValue, _userStateTtl);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при сохранении состояния пользователя {UserId}", userId);
        }
    }

    public async Task RemoveAsync(long userId, CancellationToken cancellationToken = default)
    {
        try
        {
            var db = _redis.GetDatabase();
            var key = $"{KeyPrefix}{userId}";
            await db.KeyDeleteAsync(key);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при удалении состояния пользователя {UserId}", userId);
        }
    }
}

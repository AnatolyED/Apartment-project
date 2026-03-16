using System.Text.Json;
using ApartmentBot.Domain.Interfaces;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace ApartmentBot.Infrastructure.Caching;

public sealed class RedisCacheService : ICacheService
{
    private readonly IConnectionMultiplexer _redis;
    private readonly ILogger<RedisCacheService> _logger;
    private readonly JsonSerializerOptions _jsonOptions;

    public RedisCacheService(IConnectionMultiplexer redis, ILogger<RedisCacheService> logger)
    {
        _redis = redis;
        _logger = logger;
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };
    }

    public async Task<T?> GetAsync<T>(string key, CancellationToken cancellationToken = default) where T : class
    {
        try
        {
            var db = _redis.GetDatabase();
            var value = await db.StringGetAsync(key);

            if (value.IsNullOrEmpty)
            {
                _logger.LogDebug("Промах кеша Redis: {Key}", key);
                return null;
            }

            _logger.LogDebug("Попадание в кеш Redis: {Key}", key);
            return JsonSerializer.Deserialize<T>(value.ToString()!, _jsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при получении данных из Redis по ключу {Key}", key);
            return null;
        }
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? expiration = null, CancellationToken cancellationToken = default) where T : class
    {
        try
        {
            var db = _redis.GetDatabase();
            var serializedValue = JsonSerializer.Serialize(value, _jsonOptions);
            if (expiration.HasValue)
            {
                await db.StringSetAsync(key, serializedValue, TimeSpan.FromSeconds(expiration.Value.TotalSeconds));
                _logger.LogDebug("Запись в Redis: {Key}, TTL: {Seconds}s", key, expiration.Value.TotalSeconds);
            }
            else
            {
                await db.StringSetAsync(key, serializedValue);
                _logger.LogDebug("Запись в Redis: {Key}", key);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при записи данных в Redis по ключу {Key}", key);
        }
    }

    public async Task RemoveAsync(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            var db = _redis.GetDatabase();
            await db.KeyDeleteAsync(key);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при удалении данных из Redis по ключу {Key}", key);
        }
    }
}

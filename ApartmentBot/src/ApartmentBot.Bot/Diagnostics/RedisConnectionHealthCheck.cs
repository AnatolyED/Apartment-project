using Microsoft.Extensions.Diagnostics.HealthChecks;
using StackExchange.Redis;

namespace ApartmentBot.Bot.Diagnostics;

public sealed class RedisConnectionHealthCheck : IHealthCheck
{
    private readonly IConnectionMultiplexer _redis;

    public RedisConnectionHealthCheck(IConnectionMultiplexer redis)
    {
        _redis = redis;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var database = _redis.GetDatabase();
            var ping = await database.PingAsync();

            return HealthCheckResult.Healthy(
                "Redis доступен.",
                new Dictionary<string, object>
                {
                    ["isConnected"] = _redis.IsConnected,
                    ["latencyMs"] = ping.TotalMilliseconds
                });
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy(
                "Redis недоступен.",
                ex,
                new Dictionary<string, object>
                {
                    ["isConnected"] = _redis.IsConnected
                });
        }
    }
}

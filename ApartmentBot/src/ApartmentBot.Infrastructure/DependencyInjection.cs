using ApartmentBot.Domain.Interfaces;
using ApartmentBot.Infrastructure.ApiClient;
using ApartmentBot.Infrastructure.Caching;
using ApartmentBot.Infrastructure.Configuration;
using ApartmentBot.Infrastructure.Repositories;
using ApartmentBot.Infrastructure.State;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Polly;
using Polly.Extensions.Http;
using StackExchange.Redis;

namespace ApartmentBot.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<WebPanelSettings>(configuration.GetSection(WebPanelSettings.SectionName));
        services.Configure<TelegramSettings>(configuration.GetSection(TelegramSettings.SectionName));
        services.Configure<MaxSettings>(configuration.GetSection(MaxSettings.SectionName));
        services.Configure<RedisSettings>(configuration.GetSection(RedisSettings.SectionName));

        var redisSettings = configuration.GetSection(RedisSettings.SectionName).Get<RedisSettings>() ?? new RedisSettings();
        ConfigureRedis(services, redisSettings);

        services.AddHttpClient<IWebPanelApiClient, WebPanelApiClient>((sp, client) =>
        {
            var config = sp.GetRequiredService<IConfiguration>();
            var baseUrl = config["WebPanel:BaseUrl"] ?? "http://localhost:3000/api";
            client.BaseAddress = new Uri(baseUrl);
            client.DefaultRequestHeaders.Add("Accept", "application/json");
        })
        .AddTransientHttpErrorPolicy(policy => policy.WaitAndRetryAsync(3, _ => TimeSpan.FromMilliseconds(500)))
        .AddTransientHttpErrorPolicy(policy => policy.CircuitBreakerAsync(5, TimeSpan.FromSeconds(30)));

        services.AddSingleton<ICityRepository, WebPanelCityRepository>();
        services.AddSingleton<IDistrictRepository, WebPanelDistrictRepository>();
        services.AddSingleton<IApartmentRepository, WebPanelApartmentRepository>();

        return services;
    }

    private static void ConfigureRedis(IServiceCollection services, RedisSettings redisSettings)
    {
        var connectionString = redisSettings.ConnectionString ?? "localhost:6379";
        services.AddSingleton<IConnectionMultiplexer>(sp =>
        {
            var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("RedisStartup");

            var redisOptions = ConfigurationOptions.Parse(connectionString);
            redisOptions.AbortOnConnectFail = false;
            redisOptions.ConnectRetry = Math.Max(redisOptions.ConnectRetry, 2);

            var redisConnection = ConnectionMultiplexer.Connect(redisOptions);
            if (!redisConnection.IsConnected)
            {
                throw new InvalidOperationException($"Redis connection was created but is not connected. ConnectionString={connectionString}");
            }

            logger.LogInformation("Redis connected: {ConnectionString}", connectionString);
            return redisConnection;
        });

        services.AddSingleton<ICacheService, RedisCacheService>();
        services.AddSingleton<IUserStateRepository, RedisUserStateRepository>();
    }
}

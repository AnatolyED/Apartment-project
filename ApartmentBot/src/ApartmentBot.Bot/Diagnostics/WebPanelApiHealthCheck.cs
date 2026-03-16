using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using System.Net.Http.Json;
using ApartmentBot.Infrastructure.Configuration;

namespace ApartmentBot.Bot.Diagnostics;

public sealed class WebPanelApiHealthCheck : IHealthCheck
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IOptions<WebPanelSettings> _settings;

    public WebPanelApiHealthCheck(
        IHttpClientFactory httpClientFactory,
        IOptions<WebPanelSettings> settings)
    {
        _httpClientFactory = httpClientFactory;
        _settings = settings;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var client = _httpClientFactory.CreateClient();
            var baseUrl = (_settings.Value.BaseUrl ?? "http://localhost:3000/api").TrimEnd('/');
            var response = await client.GetAsync($"{baseUrl}/health", cancellationToken);
            response.EnsureSuccessStatusCode();

            var payload = await response.Content.ReadFromJsonAsync<WebPanelHealthResponse>(cancellationToken);

            return HealthCheckResult.Healthy(
                "Web-panel API доступен.",
                new Dictionary<string, object>
                {
                    ["url"] = $"{baseUrl}/health",
                    ["status"] = payload?.Status ?? "ok"
                });
        }
        catch (Exception ex)
        {
            return HealthCheckResult.Unhealthy(
                "Web-panel API недоступен.",
                ex,
                new Dictionary<string, object>
                {
                    ["url"] = $"{(_settings.Value.BaseUrl ?? "http://localhost:3000/api").TrimEnd('/')}/health"
                });
        }
    }

    private sealed record WebPanelHealthResponse(string Status, DateTimeOffset TimestampUtc);
}

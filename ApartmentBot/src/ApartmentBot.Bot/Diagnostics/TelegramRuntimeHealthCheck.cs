using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace ApartmentBot.Bot.Diagnostics;

public sealed class TelegramRuntimeHealthCheck : IHealthCheck
{
    private readonly ITelegramRuntimeStatusTracker _tracker;

    public TelegramRuntimeHealthCheck(ITelegramRuntimeStatusTracker tracker)
    {
        _tracker = tracker;
    }

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        var snapshot = _tracker.GetSnapshot();
        var data = new Dictionary<string, object>
        {
            ["state"] = snapshot.State.ToString(),
            ["updatedAtUtc"] = snapshot.UpdatedAtUtc.ToString("O"),
            ["lastSuccessfulStartAtUtc"] = snapshot.LastSuccessfulStartAtUtc?.ToString("O") ?? string.Empty,
            ["lastFailureAtUtc"] = snapshot.LastFailureAtUtc?.ToString("O") ?? string.Empty,
            ["lastFailureReason"] = snapshot.LastFailureReason ?? string.Empty,
            ["botUsername"] = snapshot.BotUsername ?? string.Empty,
            ["lastUpdateId"] = snapshot.LastUpdateId?.ToString() ?? string.Empty,
            ["lastUpdateHandledAtUtc"] = snapshot.LastUpdateHandledAtUtc?.ToString("O") ?? string.Empty
        };

        return Task.FromResult(snapshot.State switch
        {
            TelegramRuntimeState.Running => HealthCheckResult.Healthy(
                "Telegram runtime работает.",
                data),
            TelegramRuntimeState.Starting => HealthCheckResult.Degraded(
                "Telegram runtime запускается.",
                null,
                data),
            TelegramRuntimeState.Faulted => HealthCheckResult.Unhealthy(
                "Telegram runtime находится в ошибочном состоянии.",
                null,
                data),
            _ => HealthCheckResult.Unhealthy(
                "Telegram runtime остановлен.",
                null,
                data)
        });
    }
}

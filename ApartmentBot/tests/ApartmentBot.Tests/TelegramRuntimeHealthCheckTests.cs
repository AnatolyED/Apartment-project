using ApartmentBot.Bot.Diagnostics;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace ApartmentBot.Tests;

public sealed class TelegramRuntimeHealthCheckTests
{
    [Fact]
    public async Task CheckHealthAsync_ReturnsHealthy_WhenRuntimeIsRunning()
    {
        var tracker = new TelegramRuntimeStatusTracker();
        tracker.MarkStarting();
        tracker.MarkStarted(new Telegram.Bot.Types.User { Id = 7, Username = "health_bot", FirstName = "Health" });

        var healthCheck = new TelegramRuntimeHealthCheck(tracker);

        var result = await healthCheck.CheckHealthAsync(new HealthCheckContext());

        Assert.Equal(HealthStatus.Healthy, result.Status);
    }

    [Fact]
    public async Task CheckHealthAsync_ReturnsUnhealthy_WhenRuntimeFailed()
    {
        var tracker = new TelegramRuntimeStatusTracker();
        tracker.MarkFailure("ssl eof");

        var healthCheck = new TelegramRuntimeHealthCheck(tracker);

        var result = await healthCheck.CheckHealthAsync(new HealthCheckContext());

        Assert.Equal(HealthStatus.Unhealthy, result.Status);
        Assert.Equal("ssl eof", result.Data["lastFailureReason"]);
    }
}

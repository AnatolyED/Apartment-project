using ApartmentBot.Bot.Diagnostics;
using Telegram.Bot.Types;

namespace ApartmentBot.Tests;

public sealed class TelegramRuntimeStatusTrackerTests
{
    [Fact]
    public void Tracker_UpdatesSnapshotAcrossLifecycle()
    {
        var tracker = new TelegramRuntimeStatusTracker();

        tracker.MarkStarting();
        tracker.MarkStarted(new User { Id = 42, Username = "bot_name", FirstName = "Bot" });
        tracker.MarkUpdateHandled(1001);
        tracker.MarkFailure("temporary telegram error");

        var snapshot = tracker.GetSnapshot();

        Assert.Equal(TelegramRuntimeState.Faulted, snapshot.State);
        Assert.Equal("bot_name", snapshot.BotUsername);
        Assert.Equal(42, snapshot.BotId);
        Assert.Equal(1001, snapshot.LastUpdateId);
        Assert.Equal("temporary telegram error", snapshot.LastFailureReason);
        Assert.NotNull(snapshot.LastSuccessfulStartAtUtc);
        Assert.NotNull(snapshot.LastUpdateHandledAtUtc);
        Assert.NotNull(snapshot.LastFailureAtUtc);
    }
}

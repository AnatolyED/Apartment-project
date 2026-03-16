using Telegram.Bot.Types;

namespace ApartmentBot.Bot.Diagnostics;

public enum TelegramRuntimeState
{
    Starting,
    Running,
    Faulted,
    Stopped
}

public sealed record TelegramRuntimeSnapshot(
    TelegramRuntimeState State,
    DateTimeOffset UpdatedAtUtc,
    DateTimeOffset? LastSuccessfulStartAtUtc,
    DateTimeOffset? LastFailureAtUtc,
    string? LastFailureReason,
    string? BotUsername,
    long? BotId,
    int? LastUpdateId,
    DateTimeOffset? LastUpdateHandledAtUtc);

public interface ITelegramRuntimeStatusTracker
{
    TelegramRuntimeSnapshot GetSnapshot();

    void MarkStarting();

    void MarkStarted(User botInfo);

    void MarkUpdateHandled(int updateId);

    void MarkFailure(string reason);

    void MarkStopped();
}

public sealed class TelegramRuntimeStatusTracker : ITelegramRuntimeStatusTracker
{
    private readonly Lock _syncRoot = new();
    private TelegramRuntimeSnapshot _snapshot = new(
        State: TelegramRuntimeState.Stopped,
        UpdatedAtUtc: DateTimeOffset.UtcNow,
        LastSuccessfulStartAtUtc: null,
        LastFailureAtUtc: null,
        LastFailureReason: null,
        BotUsername: null,
        BotId: null,
        LastUpdateId: null,
        LastUpdateHandledAtUtc: null);

    public TelegramRuntimeSnapshot GetSnapshot()
    {
        lock (_syncRoot)
        {
            return _snapshot;
        }
    }

    public void MarkStarting()
    {
        lock (_syncRoot)
        {
            _snapshot = _snapshot with
            {
                State = TelegramRuntimeState.Starting,
                UpdatedAtUtc = DateTimeOffset.UtcNow,
                LastFailureReason = null
            };
        }
    }

    public void MarkStarted(User botInfo)
    {
        lock (_syncRoot)
        {
            _snapshot = _snapshot with
            {
                State = TelegramRuntimeState.Running,
                UpdatedAtUtc = DateTimeOffset.UtcNow,
                LastSuccessfulStartAtUtc = DateTimeOffset.UtcNow,
                LastFailureReason = null,
                BotUsername = botInfo.Username,
                BotId = botInfo.Id
            };
        }
    }

    public void MarkUpdateHandled(int updateId)
    {
        lock (_syncRoot)
        {
            _snapshot = _snapshot with
            {
                UpdatedAtUtc = DateTimeOffset.UtcNow,
                LastUpdateId = updateId,
                LastUpdateHandledAtUtc = DateTimeOffset.UtcNow
            };
        }
    }

    public void MarkFailure(string reason)
    {
        lock (_syncRoot)
        {
            _snapshot = _snapshot with
            {
                State = TelegramRuntimeState.Faulted,
                UpdatedAtUtc = DateTimeOffset.UtcNow,
                LastFailureAtUtc = DateTimeOffset.UtcNow,
                LastFailureReason = reason
            };
        }
    }

    public void MarkStopped()
    {
        lock (_syncRoot)
        {
            _snapshot = _snapshot with
            {
                State = TelegramRuntimeState.Stopped,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            };
        }
    }
}

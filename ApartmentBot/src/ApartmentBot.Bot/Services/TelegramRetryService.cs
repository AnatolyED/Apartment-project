using Microsoft.Extensions.Logging;

namespace ApartmentBot.Bot.Services;

public interface ITelegramRetryService
{
    Task ExecuteAsync(
        string operationName,
        Func<CancellationToken, Task> operation,
        CancellationToken cancellationToken = default);

    Task<T> ExecuteAsync<T>(
        string operationName,
        Func<CancellationToken, Task<T>> operation,
        CancellationToken cancellationToken = default);
}

public sealed class TelegramRetryService : ITelegramRetryService
{
    private static readonly TimeSpan[] RetryDelays =
    [
        TimeSpan.FromMilliseconds(250),
        TimeSpan.FromMilliseconds(750)
    ];

    private readonly ILogger<TelegramRetryService> _logger;

    public TelegramRetryService(ILogger<TelegramRetryService> logger)
    {
        _logger = logger;
    }

    public Task ExecuteAsync(
        string operationName,
        Func<CancellationToken, Task> operation,
        CancellationToken cancellationToken = default)
    {
        return ExecuteAsync<object?>(
            operationName,
            async ct =>
            {
                await operation(ct);
                return null;
            },
            cancellationToken);
    }

    public async Task<T> ExecuteAsync<T>(
        string operationName,
        Func<CancellationToken, Task<T>> operation,
        CancellationToken cancellationToken = default)
    {
        var canRetry = IsRetrySafeOperation(operationName);

        for (var attempt = 0; ; attempt++)
        {
            try
            {
                return await operation(cancellationToken);
            }
            catch (Exception ex) when (
                !cancellationToken.IsCancellationRequested &&
                canRetry &&
                TelegramErrorClassification.Classify(ex) == TelegramErrorKind.TransientNetwork &&
                attempt < RetryDelays.Length)
            {
                var delay = RetryDelays[attempt];
                _logger.LogWarning(
                    ex,
                    "Операция Telegram \"{OperationName}\" завершилась временным сетевым сбоем. Повторная попытка {Attempt} из {MaxAttempts} через {DelayMs} мс.",
                    operationName,
                    attempt + 2,
                    RetryDelays.Length + 1,
                    delay.TotalMilliseconds);

                await Task.Delay(delay, cancellationToken);
            }
        }
    }

    private static bool IsRetrySafeOperation(string operationName)
    {
        return !operationName.StartsWith("SendPhoto:", StringComparison.Ordinal) &&
               !operationName.StartsWith("SendMediaGroup:", StringComparison.Ordinal);
    }
}

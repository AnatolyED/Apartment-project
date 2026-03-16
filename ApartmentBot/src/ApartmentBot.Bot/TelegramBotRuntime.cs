using ApartmentBot.Bot.Diagnostics;
using ApartmentBot.Bot.Handlers;
using Telegram.Bot;
using Telegram.Bot.Polling;
using Telegram.Bot.Types;

namespace ApartmentBot.Bot;

public sealed class TelegramBotRuntime : ITelegramBotRuntime
{
    private readonly ITelegramBotClient _botClient;
    private readonly IBotHandler _botHandler;
    private readonly ITelegramRuntimeStatusTracker _statusTracker;
    private readonly ILogger<TelegramBotRuntime> _logger;

    public TelegramBotRuntime(
        ITelegramBotClient botClient,
        IBotHandler botHandler,
        ITelegramRuntimeStatusTracker statusTracker,
        ILogger<TelegramBotRuntime> logger)
    {
        _botClient = botClient;
        _botHandler = botHandler;
        _statusTracker = statusTracker;
        _logger = logger;
    }

    public Task<User> GetMeAsync(CancellationToken cancellationToken)
    {
        return _botClient.GetMe(cancellationToken);
    }

    public Task StartReceivingAsync(CancellationToken cancellationToken)
    {
        var receiverOptions = new ReceiverOptions
        {
            AllowedUpdates = [],
            DropPendingUpdates = true
        };

        return _botClient.ReceiveAsync(
            updateHandler: async (botClient, update, ct) =>
            {
                try
                {
                    await _botHandler.HandleUpdateAsync(botClient, update, ct);
                    _statusTracker.MarkUpdateHandled(update.Id);
                }
                catch (Exception ex) when (!ct.IsCancellationRequested)
                {
                    LogRuntimeException(
                        ex,
                        "Необработанная ошибка внутри update handler была перехвачена runtime-слоем.");
                }
            },
            errorHandler: async (botClient, exception, ct) =>
            {
                try
                {
                    await _botHandler.HandleErrorAsync(botClient, exception, ct);
                }
                catch (Exception ex) when (!ct.IsCancellationRequested)
                {
                    LogRuntimeException(
                        ex,
                        "Необработанная ошибка внутри error handler была перехвачена runtime-слоем.");
                }
            },
            receiverOptions: receiverOptions,
            cancellationToken: cancellationToken);
    }

    private void LogRuntimeException(Exception exception, string message)
    {
        switch (TelegramErrorClassification.Classify(exception))
        {
            case TelegramErrorKind.Cancellation:
                _logger.LogInformation(
                    "{Message} Причина: {Reason}",
                    message,
                    TelegramErrorClassification.Describe(exception));
                break;

            case TelegramErrorKind.TransientNetwork:
            case TelegramErrorKind.TelegramApi:
                _logger.LogWarning(
                    exception,
                    "{Message} Причина: {Reason}",
                    message,
                    TelegramErrorClassification.Describe(exception));
                break;

            default:
                _logger.LogError(
                    exception,
                    "{Message} Причина: {Reason}",
                    message,
                    TelegramErrorClassification.Describe(exception));
                break;
        }
    }
}

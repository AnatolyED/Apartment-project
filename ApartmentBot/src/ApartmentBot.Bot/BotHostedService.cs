using ApartmentBot.Bot.Diagnostics;
using Microsoft.Extensions.Hosting;
using Telegram.Bot.Types;

namespace ApartmentBot.Bot;

public interface ITelegramBotRuntime
{
    Task<User> GetMeAsync(CancellationToken cancellationToken);

    Task StartReceivingAsync(CancellationToken cancellationToken);
}

public class BotHostedService : BackgroundService
{
    private readonly ITelegramBotRuntime _telegramBotRuntime;
    private readonly ITelegramRuntimeStatusTracker _statusTracker;
    private readonly ILogger<BotHostedService> _logger;
    private readonly TimeSpan _restartDelay;

    public BotHostedService(
        ITelegramBotRuntime telegramBotRuntime,
        ITelegramRuntimeStatusTracker statusTracker,
        ILogger<BotHostedService> logger,
        TimeSpan? restartDelay = null)
    {
        _telegramBotRuntime = telegramBotRuntime;
        _statusTracker = statusTracker;
        _logger = logger;
        _restartDelay = restartDelay ?? TimeSpan.FromSeconds(5);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Запуск Telegram-бота...");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                _statusTracker.MarkStarting();

                var botInfo = await _telegramBotRuntime.GetMeAsync(stoppingToken);
                _statusTracker.MarkStarted(botInfo);

                _logger.LogInformation("Бот запущен: @{BotInfo}", botInfo);

                await _telegramBotRuntime.StartReceivingAsync(stoppingToken);

                if (!stoppingToken.IsCancellationRequested)
                {
                    _statusTracker.MarkFailure("Polling завершился без сигнала остановки.");

                    _logger.LogWarning(
                        "Telegram polling завершился без сигнала остановки. Через {DelaySeconds} сек. будет выполнен повторный запуск.",
                        _restartDelay.TotalSeconds);

                    await Task.Delay(_restartDelay, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                var reason = TelegramErrorClassification.Describe(ex);
                _statusTracker.MarkFailure(reason);

                switch (TelegramErrorClassification.Classify(ex))
                {
                    case TelegramErrorKind.Cancellation:
                        _logger.LogInformation(
                            "Telegram runtime был остановлен. Причина: {Reason}",
                            reason);
                        break;

                    case TelegramErrorKind.TransientNetwork:
                    case TelegramErrorKind.TelegramApi:
                        _logger.LogWarning(
                            ex,
                            "Telegram runtime завершился с временным сбоем. Причина: {Reason}. Повторная попытка запуска через {DelaySeconds} сек.",
                            reason,
                            _restartDelay.TotalSeconds);
                        break;

                    default:
                        _logger.LogError(
                            ex,
                            "Telegram runtime завершился с неожиданной ошибкой. Причина: {Reason}. Повторная попытка запуска через {DelaySeconds} сек.",
                            reason,
                            _restartDelay.TotalSeconds);
                        break;
                }

                try
                {
                    await Task.Delay(_restartDelay, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
            }
        }

        _statusTracker.MarkStopped();
        _logger.LogInformation("Telegram-бот остановлен.");
    }
}

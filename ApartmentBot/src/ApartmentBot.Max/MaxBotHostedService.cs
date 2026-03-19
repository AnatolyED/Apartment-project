using Max.Bot.Types;

namespace ApartmentBot.Max;

public interface IMaxBotRuntime
{
    Task<User> GetMeAsync(CancellationToken cancellationToken);
    Task StartReceivingAsync(CancellationToken cancellationToken);
}

public sealed class MaxBotHostedService : BackgroundService
{
    private readonly IMaxBotRuntime _maxBotRuntime;
    private readonly ILogger<MaxBotHostedService> _logger;
    private readonly TimeSpan _restartDelay;

    public MaxBotHostedService(
        IMaxBotRuntime maxBotRuntime,
        ILogger<MaxBotHostedService> logger,
        TimeSpan? restartDelay = null)
    {
        _maxBotRuntime = maxBotRuntime;
        _logger = logger;
        _restartDelay = restartDelay ?? TimeSpan.FromSeconds(5);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Starting MAX bot...");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var botInfo = await _maxBotRuntime.GetMeAsync(stoppingToken);
                _logger.LogInformation("MAX bot started: @{Username} ({FirstName})", botInfo.Username, botInfo.FirstName);

                await _maxBotRuntime.StartReceivingAsync(stoppingToken);

                if (!stoppingToken.IsCancellationRequested)
                {
                    _logger.LogWarning(
                        "MAX polling stopped without shutdown signal. Restarting in {DelaySeconds} sec.",
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
                _logger.LogError(
                    ex,
                    "MAX runtime stopped with an error. Restarting in {DelaySeconds} sec.",
                    _restartDelay.TotalSeconds);

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

        _logger.LogInformation("MAX bot stopped.");
    }
}

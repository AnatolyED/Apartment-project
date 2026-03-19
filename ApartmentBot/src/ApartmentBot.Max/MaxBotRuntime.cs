using Max.Bot;
using Max.Bot.Polling;
using Max.Bot.Types;

namespace ApartmentBot.Max;

public sealed class MaxBotRuntime : IMaxBotRuntime
{
    private readonly MaxClient _maxClient;
    private readonly IUpdateHandler _updateHandler;
    private readonly IServiceProvider _serviceProvider;

    public MaxBotRuntime(
        MaxClient maxClient,
        IUpdateHandler updateHandler,
        IServiceProvider serviceProvider)
    {
        _maxClient = maxClient;
        _updateHandler = updateHandler;
        _serviceProvider = serviceProvider;
    }

    public Task<User> GetMeAsync(CancellationToken cancellationToken)
    {
        return _maxClient.Bot.GetMeAsync(cancellationToken);
    }

    public Task StartReceivingAsync(CancellationToken cancellationToken)
    {
        return _maxClient.StartPollingAsync(_updateHandler, _serviceProvider, cancellationToken);
    }
}

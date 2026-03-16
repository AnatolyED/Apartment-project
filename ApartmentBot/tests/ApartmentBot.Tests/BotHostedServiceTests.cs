using ApartmentBot.Bot;
using ApartmentBot.Bot.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Telegram.Bot.Types;

namespace ApartmentBot.Tests;

public sealed class BotHostedServiceTests
{
    [Fact]
    public async Task ExecuteAsync_RetriesAfterTransientStartupFailure()
    {
        var runtime = new Mock<ITelegramBotRuntime>();
        var tracker = new TelegramRuntimeStatusTracker();
        var user = new User { Id = 1, Username = "test_bot", FirstName = "Test" };
        var cts = new CancellationTokenSource();
        var getMeCallCount = 0;

        runtime.Setup(x => x.GetMeAsync(It.IsAny<CancellationToken>()))
            .Returns<CancellationToken>(_ =>
            {
                getMeCallCount++;
                if (getMeCallCount == 1)
                {
                    throw new HttpRequestException("temporary network failure");
                }

                return Task.FromResult(user);
            });

        runtime.Setup(x => x.StartReceivingAsync(It.IsAny<CancellationToken>()))
            .Returns<CancellationToken>(ct =>
            {
                cts.Cancel();
                return Task.FromCanceled(ct);
            });

        var service = new TestableBotHostedService(runtime.Object, tracker, TimeSpan.Zero);

        await service.RunAsync(cts.Token);

        runtime.Verify(x => x.GetMeAsync(It.IsAny<CancellationToken>()), Times.Exactly(2));
        runtime.Verify(x => x.StartReceivingAsync(It.IsAny<CancellationToken>()), Times.Once);
        Assert.Equal(TelegramRuntimeState.Stopped, tracker.GetSnapshot().State);
    }

    [Fact]
    public async Task ExecuteAsync_StopsGracefullyWhenCancellationRequested()
    {
        var runtime = new Mock<ITelegramBotRuntime>(MockBehavior.Strict);
        var tracker = new TelegramRuntimeStatusTracker();
        var service = new TestableBotHostedService(runtime.Object, tracker, TimeSpan.Zero);
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await service.RunAsync(cts.Token);

        runtime.Verify(x => x.GetMeAsync(It.IsAny<CancellationToken>()), Times.Never);
        runtime.Verify(x => x.StartReceivingAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    private sealed class TestableBotHostedService : BotHostedService
    {
        public TestableBotHostedService(
            ITelegramBotRuntime telegramBotRuntime,
            ITelegramRuntimeStatusTracker tracker,
            TimeSpan restartDelay)
            : base(telegramBotRuntime, tracker, NullLogger<BotHostedService>.Instance, restartDelay)
        {
        }

        public Task RunAsync(CancellationToken cancellationToken)
        {
            return ExecuteAsync(cancellationToken);
        }
    }
}

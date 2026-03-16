using ApartmentBot.Bot.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace ApartmentBot.Tests;

public sealed class TelegramRetryServiceTests
{
    [Fact]
    public async Task ExecuteAsync_RetriesTransientNetworkFailure_AndEventuallySucceeds()
    {
        var service = new TelegramRetryService(NullLogger<TelegramRetryService>.Instance);
        var callCount = 0;

        await service.ExecuteAsync(
            "SendMessage:Test",
            _ =>
            {
                callCount++;
                if (callCount < 3)
                {
                    throw new HttpRequestException("temporary network failure");
                }

                return Task.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(3, callCount);
    }

    [Fact]
    public async Task ExecuteAsync_DoesNotRetryUnexpectedError()
    {
        var service = new TelegramRetryService(NullLogger<TelegramRetryService>.Instance);
        var callCount = 0;

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.ExecuteAsync(
            "SendMessage:Test",
            _ =>
            {
                callCount++;
                throw new InvalidOperationException("unexpected");
            },
            CancellationToken.None));

        Assert.Equal(1, callCount);
    }

    [Fact]
    public async Task ExecuteAsync_DoesNotRetryStreamBasedMediaOperations()
    {
        var service = new TelegramRetryService(NullLogger<TelegramRetryService>.Instance);
        var callCount = 0;

        await Assert.ThrowsAsync<HttpRequestException>(() => service.ExecuteAsync(
            "SendPhoto:district",
            _ =>
            {
                callCount++;
                throw new HttpRequestException("broken pipe");
            },
            CancellationToken.None));

        Assert.Equal(1, callCount);
    }
}

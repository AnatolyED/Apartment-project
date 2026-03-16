using System.Net.Sockets;
using ApartmentBot.Bot;
using Telegram.Bot.Exceptions;

namespace ApartmentBot.Tests;

public sealed class TelegramErrorClassificationTests
{
    [Fact]
    public void Classify_HttpRequestException_ReturnsTransientNetwork()
    {
        var exception = new HttpRequestException("temporary network failure");

        var result = TelegramErrorClassification.Classify(exception);

        Assert.Equal(TelegramErrorKind.TransientNetwork, result);
        Assert.Equal(
            "Произошел временный сетевой сбой при работе с Telegram API.",
            TelegramErrorClassification.Describe(exception));
    }

    [Fact]
    public void Classify_IOExceptionWithSocketInnerException_ReturnsTransientNetwork()
    {
        var exception = new IOException("ssl eof", new SocketException((int)SocketError.ConnectionReset));

        var result = TelegramErrorClassification.Classify(exception);

        Assert.Equal(TelegramErrorKind.TransientNetwork, result);
    }

    [Fact]
    public void Classify_RequestException_ReturnsTelegramApi()
    {
        var exception = new RequestException("telegram api error");

        var result = TelegramErrorClassification.Classify(exception);

        Assert.Equal(TelegramErrorKind.TelegramApi, result);
        Assert.Equal(
            "Telegram API вернул прикладную ошибку.",
            TelegramErrorClassification.Describe(exception));
    }
}

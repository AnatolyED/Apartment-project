using System.Net.Sockets;
using Telegram.Bot.Exceptions;

namespace ApartmentBot.Bot;

public enum TelegramErrorKind
{
    Cancellation,
    TransientNetwork,
    TelegramApi,
    Unexpected
}

public static class TelegramErrorClassification
{
    public static TelegramErrorKind Classify(Exception exception)
    {
        if (exception is OperationCanceledException)
        {
            return TelegramErrorKind.Cancellation;
        }

        if (IsTransientNetworkException(exception))
        {
            return TelegramErrorKind.TransientNetwork;
        }

        if (exception is RequestException)
        {
            return TelegramErrorKind.TelegramApi;
        }

        return TelegramErrorKind.Unexpected;
    }

    public static string Describe(Exception exception)
    {
        return Classify(exception) switch
        {
            TelegramErrorKind.Cancellation => "Операция Telegram была остановлена по запросу отмены.",
            TelegramErrorKind.TransientNetwork => "Произошел временный сетевой сбой при работе с Telegram API.",
            TelegramErrorKind.TelegramApi => "Telegram API вернул прикладную ошибку.",
            _ => "Произошла неожиданная ошибка в Telegram-сценарии."
        };
    }

    private static bool IsTransientNetworkException(Exception exception)
    {
        if (exception is HttpRequestException or IOException or SocketException)
        {
            return true;
        }

        var current = exception.InnerException;
        while (current is not null)
        {
            if (current is HttpRequestException or IOException or SocketException)
            {
                return true;
            }

            current = current.InnerException;
        }

        return false;
    }
}

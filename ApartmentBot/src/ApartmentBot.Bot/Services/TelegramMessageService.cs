using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;

namespace ApartmentBot.Bot.Services;

public interface ITelegramMessageService
{
    Task<Message> SendMessageAndReturnAsync(
        ITelegramBotClient botClient,
        ChatId chatId,
        string text,
        ParseMode parseMode = ParseMode.None,
        ReplyMarkup? replyMarkup = null,
        CancellationToken cancellationToken = default);

    Task SendMessageAsync(
        ITelegramBotClient botClient,
        ChatId chatId,
        string text,
        ParseMode parseMode = ParseMode.None,
        ReplyMarkup? replyMarkup = null,
        CancellationToken cancellationToken = default);
}

public sealed class TelegramMessageService : ITelegramMessageService
{
    private readonly ITelegramRetryService _telegramRetryService;

    public TelegramMessageService(ITelegramRetryService telegramRetryService)
    {
        _telegramRetryService = telegramRetryService;
    }

    public async Task SendMessageAsync(
        ITelegramBotClient botClient,
        ChatId chatId,
        string text,
        ParseMode parseMode = ParseMode.None,
        ReplyMarkup? replyMarkup = null,
        CancellationToken cancellationToken = default)
    {
        await SendMessageAndReturnAsync(
            botClient,
            chatId,
            text,
            parseMode,
            replyMarkup,
            cancellationToken);
    }

    public Task<Message> SendMessageAndReturnAsync(
        ITelegramBotClient botClient,
        ChatId chatId,
        string text,
        ParseMode parseMode = ParseMode.None,
        ReplyMarkup? replyMarkup = null,
        CancellationToken cancellationToken = default)
    {
        return _telegramRetryService.ExecuteAsync(
            "SendMessage",
            ct => botClient.SendMessage(
                chatId,
                text,
                parseMode: parseMode,
                replyMarkup: replyMarkup,
                cancellationToken: ct),
            cancellationToken);
    }
}

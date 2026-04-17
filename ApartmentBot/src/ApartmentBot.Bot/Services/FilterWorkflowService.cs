using System.Globalization;
using System.Text.RegularExpressions;
using ApartmentBot.Application.Services;
using ApartmentBot.Bot.CallbackData;
using ApartmentBot.Bot.Keyboards;
using ApartmentBot.Domain.Entities;
using ApartmentBot.Domain.Interfaces;
using Microsoft.Extensions.Logging;
using Telegram.Bot;
using Telegram.Bot.Types.ReplyMarkups;

namespace ApartmentBot.Bot.Services;

public interface IFilterWorkflowService
{
    Task HandleFilterCallbackAsync(
        ITelegramBotClient botClient,
        long userId,
        string data,
        UserState state,
        int messageId,
        Func<Task> showApartmentListAsync,
        Func<InlineKeyboardMarkup> createStartKeyboard,
        CancellationToken cancellationToken);

    Task HandlePriceMinInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken);

    Task HandlePriceMaxInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken);

    Task HandleAreaMinInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken);

    Task HandleAreaMaxInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken);
}

public sealed class FilterWorkflowService : IFilterWorkflowService
{
    private static readonly Regex IntegerRegex = new(@"^\d+$", RegexOptions.Compiled);
    private static readonly Regex DecimalRegex = new(@"^\d+(?:[.,]\d{1,2})?$", RegexOptions.Compiled);

    private readonly IUserStateService _userStateService;
    private readonly ITelegramRetryService _telegramRetryService;
    private readonly ILogger<FilterWorkflowService> _logger;

    public FilterWorkflowService(
        IUserStateService userStateService,
        ITelegramRetryService telegramRetryService,
        ILogger<FilterWorkflowService> logger)
    {
        _userStateService = userStateService;
        _telegramRetryService = telegramRetryService;
        _logger = logger;
    }

    public async Task HandleFilterCallbackAsync(
        ITelegramBotClient botClient,
        long userId,
        string data,
        UserState state,
        int messageId,
        Func<Task> showApartmentListAsync,
        Func<InlineKeyboardMarkup> createStartKeyboard,
        CancellationToken cancellationToken)
    {
        var (filterType, value) = FilterCallbackData.Parse(data);

        switch (filterType)
        {
            case "menu":
                await SendFilterMenuAsync(botClient, userId, messageId, state.CurrentFilters, cancellationToken);
                break;

            case "finishing":
                await HandleFinishingFilterAsync(botClient, userId, state, messageId, value, cancellationToken);
                break;

            case "rooms":
                await HandleRoomsFilterAsync(botClient, userId, state, messageId, value, cancellationToken);
                break;

            case "price":
                state.CurrentStep = BotStep.FilterPriceMin;
                state.PendingInput = "price_min";
                await _userStateService.SetStateAsync(userId, state, cancellationToken);

                await SendMessageAsync(
                    botClient,
                    userId,
                    "Введите минимальную цену или отправьте /skip для пропуска:",
                    KeyboardFactory.CreateCancelKeyboard(),
                    cancellationToken);
                break;

            case "area":
                state.CurrentStep = BotStep.FilterAreaMin;
                state.PendingInput = "area_min";
                await _userStateService.SetStateAsync(userId, state, cancellationToken);

                await SendMessageAsync(
                    botClient,
                    userId,
                    "Введите минимальную площадь или отправьте /skip для пропуска:",
                    KeyboardFactory.CreateCancelKeyboard(),
                    cancellationToken);
                break;

            case "back":
                if (HasApartmentSearchContext(state))
                {
                    await showApartmentListAsync();
                }
                else
                {
                    await SendOrEditTextAsync(
                        botClient,
                        userId,
                        messageId,
                        "🏙 Выберите город:",
                        createStartKeyboard(),
                        cancellationToken);
                }
                break;

            case "reset":
                state.CurrentFilters.Reset();
                state.CurrentPage = 1;
                await _userStateService.SetStateAsync(userId, state, cancellationToken);

                if (HasApartmentSearchContext(state))
                {
                    await showApartmentListAsync();
                }
                else
                {
                    await SendOrEditTextAsync(
                        botClient,
                        userId,
                        messageId,
                        "🔄 Фильтры сброшены. Выберите город:",
                        createStartKeyboard(),
                        cancellationToken);
                }
                break;

            default:
                _logger.LogWarning("Неизвестный тип фильтра: {FilterType}", filterType);
                break;
        }
    }

    public async Task HandlePriceMinInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken)
    {
        if (text == "/skip")
        {
            state.CurrentStep = BotStep.FilterPriceMax;
            state.PendingInput = "price_max";
            await _userStateService.SetStateAsync(userId, state, cancellationToken);

            await SendMessageAsync(
                botClient,
                userId,
                "Введите максимальную цену или отправьте /skip для пропуска:",
                KeyboardFactory.CreateCancelKeyboard(),
                cancellationToken);
            return;
        }

        if (TryParsePrice(text, out var price) && price <= 1_000_000_000)
        {
            state.CurrentFilters.PriceMin = price;
            state.CurrentStep = BotStep.FilterPriceMax;
            state.PendingInput = "price_max";
            await _userStateService.SetStateAsync(userId, state, cancellationToken);

            await SendMessageAsync(
                botClient,
                userId,
                "Введите максимальную цену или отправьте /skip для пропуска:",
                KeyboardFactory.CreateCancelKeyboard(),
                cancellationToken);
            return;
        }

        await SendMessageAsync(
            botClient,
            userId,
            "Некорректное значение. Введите целое число от 0 до 1 000 000 000:",
            KeyboardFactory.CreateCancelKeyboard(),
            cancellationToken);
    }

    public async Task HandlePriceMaxInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken)
    {
        state.PendingInput = null;
        state.CurrentStep = BotStep.ViewApartments;

        if (text != "/skip" && TryParsePrice(text, out var price) && price <= 1_000_000_000)
        {
            state.CurrentFilters.PriceMax = price;
        }

        await _userStateService.SetStateAsync(userId, state, cancellationToken);
        await SendFilterMenuAsync(botClient, userId, 0, state.CurrentFilters, cancellationToken);
    }

    public async Task HandleAreaMinInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken)
    {
        if (text == "/skip")
        {
            state.CurrentStep = BotStep.FilterAreaMax;
            state.PendingInput = "area_max";
            await _userStateService.SetStateAsync(userId, state, cancellationToken);

            await SendMessageAsync(
                botClient,
                userId,
                "Введите максимальную площадь или отправьте /skip для пропуска:",
                KeyboardFactory.CreateCancelKeyboard(),
                cancellationToken);
            return;
        }

        if (TryParseArea(text, out var area) && area <= 1000)
        {
            state.CurrentFilters.AreaMin = area;
            state.CurrentStep = BotStep.FilterAreaMax;
            state.PendingInput = "area_max";
            await _userStateService.SetStateAsync(userId, state, cancellationToken);

            await SendMessageAsync(
                botClient,
                userId,
                "Введите максимальную площадь или отправьте /skip для пропуска:",
                KeyboardFactory.CreateCancelKeyboard(),
                cancellationToken);
            return;
        }

        await SendMessageAsync(
            botClient,
            userId,
            "Некорректное значение. Введите число от 0 до 1000. Дробную часть можно указать через точку или запятую:",
            KeyboardFactory.CreateCancelKeyboard(),
            cancellationToken);
    }

    public async Task HandleAreaMaxInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken)
    {
        state.PendingInput = null;
        state.CurrentStep = BotStep.ViewApartments;

        if (text != "/skip" && TryParseArea(text, out var area) && area <= 1000)
        {
            state.CurrentFilters.AreaMax = area;
        }

        await _userStateService.SetStateAsync(userId, state, cancellationToken);
        await SendFilterMenuAsync(botClient, userId, 0, state.CurrentFilters, cancellationToken);
    }

    private async Task HandleFinishingFilterAsync(
        ITelegramBotClient botClient,
        long userId,
        UserState state,
        int messageId,
        string? value,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(value) || value == "Любая")
        {
            if (string.IsNullOrEmpty(value))
            {
                await SendOrEditTextAsync(
                    botClient,
                    userId,
                    messageId,
                    "Выберите тип отделки:",
                    KeyboardFactory.CreateFinishingKeyboard(),
                    cancellationToken);
                return;
            }

            state.CurrentFilters.Finishing = null;
            await _userStateService.SetStateAsync(userId, state, cancellationToken);
            await SendFilterMenuAsync(botClient, userId, messageId, state.CurrentFilters, cancellationToken);
            return;
        }

        if (value == "Подчистовая")
        {
            value = "Вайт бокс";
        }

        state.CurrentFilters.Finishing = value switch
        {
            "Чистовая" => FinishingType.Чистовая,
            "Вайт бокс" => FinishingType.ВайтБокс,
            "Без отделки" => FinishingType.БезОтделки,
            _ => null
        };

        await _userStateService.SetStateAsync(userId, state, cancellationToken);
        await SendFilterMenuAsync(botClient, userId, messageId, state.CurrentFilters, cancellationToken);
    }

    private async Task HandleRoomsFilterAsync(
        ITelegramBotClient botClient,
        long userId,
        UserState state,
        int messageId,
        string? value,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(value))
        {
            await SendOrEditTextAsync(
                botClient,
                userId,
                messageId,
                "Выберите количество комнат:",
                KeyboardFactory.CreateRoomsKeyboard(),
                cancellationToken);
            return;
        }

        state.CurrentFilters.Rooms = value;
        await _userStateService.SetStateAsync(userId, state, cancellationToken);
        await SendFilterMenuAsync(botClient, userId, messageId, state.CurrentFilters, cancellationToken);
    }

    private Task SendFilterMenuAsync(
        ITelegramBotClient botClient,
        long userId,
        int messageId,
        ApartmentFilters filters,
        CancellationToken cancellationToken)
    {
        return SendOrEditTextAsync(
            botClient,
            userId,
            messageId,
            "🔍 Выберите фильтр:",
            KeyboardFactory.CreateFilterKeyboard(filters),
            cancellationToken);
    }

    private Task SendMessageAsync(
        ITelegramBotClient botClient,
        long userId,
        string message,
        ReplyKeyboardMarkup replyMarkup,
        CancellationToken cancellationToken)
    {
        return _telegramRetryService.ExecuteAsync(
            "SendMessage:FilterWorkflow",
            ct => botClient.SendMessage(
                userId,
                message,
                replyMarkup: replyMarkup,
                cancellationToken: ct),
            cancellationToken);
    }

    private async Task SendOrEditTextAsync(
        ITelegramBotClient botClient,
        long userId,
        int messageId,
        string message,
        InlineKeyboardMarkup replyMarkup,
        CancellationToken cancellationToken)
    {
        if (messageId != 0)
        {
            try
            {
                await _telegramRetryService.ExecuteAsync(
                    "EditMessageText:FilterWorkflow",
                    ct => botClient.EditMessageText(
                        userId,
                        messageId,
                        message,
                        replyMarkup: replyMarkup,
                        cancellationToken: ct),
                    cancellationToken);
                return;
            }
            catch
            {
            }
        }

        await _telegramRetryService.ExecuteAsync(
            "SendMessage:FilterWorkflowFallback",
            ct => botClient.SendMessage(
                userId,
                message,
                replyMarkup: replyMarkup,
                cancellationToken: ct),
            cancellationToken);
    }

    private static bool TryParsePrice(string text, out decimal price)
    {
        price = 0;
        var normalized = NormalizeNumericInput(text);
        return IntegerRegex.IsMatch(normalized) &&
               decimal.TryParse(normalized, NumberStyles.Number, CultureInfo.InvariantCulture, out price) &&
               price >= 0;
    }

    private static bool TryParseArea(string text, out decimal area)
    {
        area = 0;
        var normalized = NormalizeNumericInput(text);
        if (!DecimalRegex.IsMatch(normalized))
        {
            return false;
        }

        normalized = normalized.Replace(',', '.');
        return decimal.TryParse(normalized, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out area) &&
               area >= 0;
    }

    private static string NormalizeNumericInput(string text)
    {
        return text
            .Trim()
            .Replace(" ", string.Empty)
            .Replace("\u00A0", string.Empty)
            .Replace("\u202F", string.Empty);
    }

    private static bool HasApartmentSearchContext(UserState state)
    {
        return state.SelectedCityId.HasValue &&
               (state.SearchMode == ApartmentSearchMode.ByCity || state.SelectedDistrictId.HasValue);
    }
}

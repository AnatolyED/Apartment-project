using ApartmentBot.Application.DTOs;
using ApartmentBot.Application.Services;
using ApartmentBot.Bot.CallbackData;
using ApartmentBot.Bot.Keyboards;
using ApartmentBot.Domain.Interfaces;
using Microsoft.Extensions.Logging;
using Telegram.Bot;
using Telegram.Bot.Types.ReplyMarkups;

namespace ApartmentBot.Bot.Services;

public interface IApartmentNavigationService
{
    Task HandleApartmentSelectionAsync(
        ITelegramBotClient botClient,
        long userId,
        string data,
        UserState state,
        Func<ApartmentDto, Task> showApartmentDetailsAsync,
        CancellationToken cancellationToken);

    Task HandleApartmentActionAsync(
        ITelegramBotClient botClient,
        long userId,
        UserState state,
        Func<string, string, Task> handleApartmentAsync,
        CancellationToken cancellationToken);

    Task HandleSelectedApartmentAsync(
        ITelegramBotClient botClient,
        long userId,
        UserState state,
        Func<ApartmentDto, Task> handleApartmentAsync,
        CancellationToken cancellationToken);

    Task HandleNavigationCallbackAsync(
        ITelegramBotClient botClient,
        long userId,
        string data,
        UserState state,
        int messageId,
        Func<Task> showApartmentListAsync,
        Func<InlineKeyboardMarkup> createStartKeyboard,
        CancellationToken cancellationToken);
}

public sealed class ApartmentNavigationService : IApartmentNavigationService
{
    private readonly IUserStateService _userStateService;
    private readonly IApartmentService _apartmentService;
    private readonly ICityService _cityService;
    private readonly IDistrictService _districtService;
    private readonly IApartmentMessageFormatter _apartmentMessageFormatter;
    private readonly ITelegramRetryService _telegramRetryService;
    private readonly ILogger<ApartmentNavigationService> _logger;

    public ApartmentNavigationService(
        IUserStateService userStateService,
        IApartmentService apartmentService,
        ICityService cityService,
        IDistrictService districtService,
        IApartmentMessageFormatter apartmentMessageFormatter,
        ITelegramRetryService telegramRetryService,
        ILogger<ApartmentNavigationService> logger)
    {
        _userStateService = userStateService;
        _apartmentService = apartmentService;
        _cityService = cityService;
        _districtService = districtService;
        _apartmentMessageFormatter = apartmentMessageFormatter;
        _telegramRetryService = telegramRetryService;
        _logger = logger;
    }

    public async Task HandleApartmentSelectionAsync(
        ITelegramBotClient botClient,
        long userId,
        string data,
        UserState state,
        Func<ApartmentDto, Task> showApartmentDetailsAsync,
        CancellationToken cancellationToken)
    {
        Guid apartmentId;

        try
        {
            apartmentId = ApartmentCallbackData.Parse(data);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Неверный формат callback-данных квартиры: {Data}", data);
            await SendMessageAsync(botClient, userId, "❌ Ошибка загрузки квартиры.", cancellationToken);
            return;
        }

        _logger.LogInformation("Выбор квартиры: Data={Data}, ApartmentId={ApartmentId}", data, apartmentId);

        var apartment = await _apartmentService.GetApartmentByIdAsync(apartmentId, cancellationToken);
        if (apartment is null)
        {
            _logger.LogWarning("Квартира не найдена по Id: {ApartmentId}", apartmentId);
            await SendMessageAsync(botClient, userId, "❌ Квартира не найдена. Попробуйте выбрать другую.", cancellationToken);
            return;
        }

        state.SelectedApartmentId = apartmentId;
        state.RequestedApartmentName = apartment.Name;
        state.SelectedApartmentSummary = _apartmentMessageFormatter.FormatApartmentMessage(apartment);
        await _userStateService.SetStateAsync(userId, state, cancellationToken);

        await showApartmentDetailsAsync(apartment);
    }

    public async Task HandleApartmentActionAsync(
        ITelegramBotClient botClient,
        long userId,
        UserState state,
        Func<string, string, Task> handleApartmentAsync,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(state.RequestedApartmentName) &&
            !string.IsNullOrWhiteSpace(state.SelectedApartmentSummary))
        {
            await handleApartmentAsync(state.RequestedApartmentName, state.SelectedApartmentSummary);
            return;
        }

        if (!state.SelectedApartmentId.HasValue)
        {
            await SendMessageAsync(botClient, userId, "❌ Ошибка загрузки квартиры. Попробуйте выбрать другую.", cancellationToken);
            return;
        }

        var apartment = await _apartmentService.GetApartmentByIdAsync(state.SelectedApartmentId.Value, cancellationToken);
        if (apartment is null)
        {
            await SendMessageAsync(botClient, userId, "❌ Ошибка загрузки квартиры. Попробуйте выбрать другую.", cancellationToken);
            return;
        }

        var apartmentInfo = _apartmentMessageFormatter.FormatApartmentMessage(apartment);
        state.RequestedApartmentName = apartment.Name;
        state.SelectedApartmentSummary = apartmentInfo;
        await _userStateService.SetStateAsync(userId, state, cancellationToken);

        await handleApartmentAsync(apartment.Name, apartmentInfo);
    }

    public async Task HandleSelectedApartmentAsync(
        ITelegramBotClient botClient,
        long userId,
        UserState state,
        Func<ApartmentDto, Task> handleApartmentAsync,
        CancellationToken cancellationToken)
    {
        if (!state.SelectedApartmentId.HasValue)
        {
            await SendMessageAsync(botClient, userId, "❌ Квартира не выбрана. Откройте карточку квартиры заново.", cancellationToken);
            return;
        }

        var apartment = await _apartmentService.GetApartmentByIdAsync(state.SelectedApartmentId.Value, cancellationToken);
        if (apartment is null)
        {
            await SendMessageAsync(botClient, userId, "❌ Квартира не найдена. Попробуйте выбрать её из списка заново.", cancellationToken);
            return;
        }

        await handleApartmentAsync(apartment);
    }

    public async Task HandleNavigationCallbackAsync(
        ITelegramBotClient botClient,
        long userId,
        string data,
        UserState state,
        int messageId,
        Func<Task> showApartmentListAsync,
        Func<InlineKeyboardMarkup> createStartKeyboard,
        CancellationToken cancellationToken)
    {
        var action = NavigationCallbackData.Parse(data);

        switch (action)
        {
            case "refresh":
            case "apply_filters":
                if (state.SelectedDistrictId.HasValue)
                {
                    state.CurrentPage = 1;
                    await _userStateService.SetStateAsync(userId, state, cancellationToken);
                    await showApartmentListAsync();
                }
                break;

            case "back_to_apartments":
                if (state.SelectedDistrictId.HasValue)
                {
                    state.SelectedApartmentId = null;
                    state.SelectedApartmentSummary = null;
                    state.RequestedApartmentName = null;
                    await _userStateService.SetStateAsync(userId, state, cancellationToken);
                    await showApartmentListAsync();
                }
                break;

            case "back_to_start":
                state.DistrictPhotoShownForDistrictId = null;
                state.DistrictPhotoShownForPhotoUrl = null;
                state.ApartmentPhotoShownForApartmentId = null;
                state.ApartmentPhotoShownForPhotoUrl = null;
                await _userStateService.SetStateAsync(userId, state, cancellationToken);

                await _telegramRetryService.ExecuteAsync(
                    "EditMessageText:BackToStart",
                    ct => botClient.EditMessageText(
                        userId,
                        messageId,
                        "🏠 Добро пожаловать в бот по поиску недвижимости!\n\nВыберите действие:",
                        replyMarkup: createStartKeyboard(),
                        cancellationToken: ct),
                    cancellationToken);
                break;

            case var x when x.StartsWith("back_to_cities:"):
                var cities = await _cityService.GetAllCitiesAsync(cancellationToken);
                await _telegramRetryService.ExecuteAsync(
                    "EditMessageText:BackToCities",
                    ct => botClient.EditMessageText(
                        userId,
                        messageId,
                        "🏙 Выберите город:",
                        replyMarkup: KeyboardFactory.CreateCityKeyboard(cities),
                        cancellationToken: ct),
                    cancellationToken);
                break;

            case "back_to_districts":
                if (state.SelectedCityId.HasValue)
                {
                    state.DistrictPhotoShownForDistrictId = null;
                    state.DistrictPhotoShownForPhotoUrl = null;
                    state.ApartmentPhotoShownForApartmentId = null;
                    state.ApartmentPhotoShownForPhotoUrl = null;
                    await _userStateService.SetStateAsync(userId, state, cancellationToken);

                    var districts = await _districtService.GetDistrictsByCityIdAsync(state.SelectedCityId.Value, cancellationToken);
                    await SendOrEditNavigationMessageAsync(
                        botClient,
                        userId,
                        messageId,
                        "📍 Выберите район:",
                        KeyboardFactory.CreateDistrictKeyboard(districts, state.SelectedCityId.Value),
                        cancellationToken);
                }
                break;
        }
    }

    private async Task SendOrEditNavigationMessageAsync(
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
                    "EditMessageText:Navigation",
                    ct => botClient.EditMessageText(
                        userId,
                        messageId,
                        message,
                        replyMarkup: replyMarkup,
                        cancellationToken: ct),
                    cancellationToken);
                return;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Не удалось обновить текущее навигационное сообщение. Отправляем новое.");
            }
        }

        await SendMessageAsync(botClient, userId, message, replyMarkup, cancellationToken);
    }

    private Task SendMessageAsync(
        ITelegramBotClient botClient,
        long userId,
        string message,
        CancellationToken cancellationToken)
    {
        return _telegramRetryService.ExecuteAsync(
            "SendMessage:Navigation",
            ct => botClient.SendMessage(userId, message, cancellationToken: ct),
            cancellationToken);
    }

    private Task SendMessageAsync(
        ITelegramBotClient botClient,
        long userId,
        string message,
        InlineKeyboardMarkup replyMarkup,
        CancellationToken cancellationToken)
    {
        return _telegramRetryService.ExecuteAsync(
            "SendMessage:NavigationWithKeyboard",
            ct => botClient.SendMessage(userId, message, replyMarkup: replyMarkup, cancellationToken: ct),
            cancellationToken);
    }
}

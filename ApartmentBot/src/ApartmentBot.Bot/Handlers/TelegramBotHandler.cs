using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ApartmentBot.Application.Services;
using ApartmentBot.Application.DTOs;
using ApartmentBot.Domain.Entities;
using ApartmentBot.Domain.Interfaces;
using ApartmentBot.Bot.Keyboards;
using ApartmentBot.Bot.CallbackData;
using ApartmentBot.Bot.Services;

namespace ApartmentBot.Bot.Handlers;

public interface IBotHandler
{
    Task HandleUpdateAsync(ITelegramBotClient botClient, Update update, CancellationToken cancellationToken = default);
    Task HandleErrorAsync(ITelegramBotClient botClient, Exception exception, CancellationToken cancellationToken = default);
}

public sealed class TelegramBotHandler : IBotHandler
{
    private readonly ICityService _cityService;
    private readonly IDistrictService _districtService;
    private readonly IUserStateService _userStateService;
    private readonly ILeadRequestService _leadRequestService;
    private readonly IFilterWorkflowService _filterWorkflowService;
    private readonly IApartmentNavigationService _apartmentNavigationService;
    private readonly IApartmentPresentationService _apartmentPresentationService;
    private readonly ITelegramRetryService _telegramRetryService;
    private readonly ITelegramUpdateDeduplicationService _telegramUpdateDeduplicationService;
    private readonly ILogger<TelegramBotHandler> _logger;

    public TelegramBotHandler(
        ICityService cityService,
        IDistrictService districtService,
        IUserStateService userStateService,
        ILeadRequestService leadRequestService,
        IFilterWorkflowService filterWorkflowService,
        IApartmentNavigationService apartmentNavigationService,
        IApartmentPresentationService apartmentPresentationService,
        ITelegramRetryService telegramRetryService,
        ITelegramUpdateDeduplicationService telegramUpdateDeduplicationService,
        ILogger<TelegramBotHandler> logger)
    {
        _cityService = cityService;
        _districtService = districtService;
        _userStateService = userStateService;
        _leadRequestService = leadRequestService;
        _filterWorkflowService = filterWorkflowService;
        _apartmentNavigationService = apartmentNavigationService;
        _apartmentPresentationService = apartmentPresentationService;
        _telegramRetryService = telegramRetryService;
        _telegramUpdateDeduplicationService = telegramUpdateDeduplicationService;
        _logger = logger;
    }

    public async Task HandleUpdateAsync(ITelegramBotClient botClient, Update update, CancellationToken cancellationToken = default)
    {
        try
        {
            if (await _telegramUpdateDeduplicationService.IsDuplicateAsync(update, cancellationToken))
            {
                _logger.LogInformation("Пропускаем дублирующийся Telegram update. UpdateId={UpdateId}", update.Id);
                return;
            }

            var userId = update.Message?.From?.Id ?? update.CallbackQuery?.From.Id;
            if (!userId.HasValue) return;

            var state = await _userStateService.GetStateAsync(userId.Value, cancellationToken);

            // Автосброс фильтров через 10 минут бездействия
            if (state.CurrentFilters.HasActiveFilters &&
                DateTime.UtcNow - state.LastActivityTime > TimeSpan.FromMinutes(10))
            {
                state.CurrentFilters.Reset();
                state.CurrentPage = 1;
                _logger.LogInformation("Автосброс фильтров для пользователя {UserId} после 10 минут бездействия", userId.Value);
            }

            // Обновляем время последней активности
            state.LastActivityTime = DateTime.UtcNow;
            await _userStateService.SetStateAsync(userId.Value, state, cancellationToken);

            switch (update.Type)
            {
                case UpdateType.Message:
                    await HandleMessageAsync(botClient, update.Message!, cancellationToken);
                    break;
                case UpdateType.CallbackQuery:
                    await HandleCallbackQueryAsync(botClient, update.CallbackQuery!, cancellationToken);
                    break;
            }
        }
        catch (Exception ex)
        {
            var userId = update.Message?.From?.Id ?? update.CallbackQuery?.From.Id;
            _logger.LogError(ex, "Ошибка при обработке обновления от пользователя {UserId}", userId);

            if (userId.HasValue)
            {
                try
                {
                    await SendMessageAsync(
                        botClient,
                        userId.Value,
                        "Произошла ошибка при обработке запроса. Пожалуйста, попробуйте позже.",
                        cancellationToken: cancellationToken);
                }
                catch (Exception sendEx)
                {
                    _logger.LogWarning(
                        sendEx,
                        "Не удалось отправить пользователю сообщение об ошибке после сбоя обработки обновления. UserId={UserId}",
                        userId.Value);
                }
            }
        }
    }

    public Task HandleErrorAsync(ITelegramBotClient botClient, Exception exception, CancellationToken cancellationToken = default)
    {
        var reason = TelegramErrorClassification.Describe(exception);

        switch (TelegramErrorClassification.Classify(exception))
        {
            case TelegramErrorKind.Cancellation:
                _logger.LogInformation("Telegram polling был остановлен. Причина: {Reason}", reason);
                break;

            case TelegramErrorKind.TransientNetwork:
                _logger.LogWarning(exception, "Временный сетевой сбой Telegram API. Причина: {Reason}", reason);
                break;

            case TelegramErrorKind.TelegramApi:
                _logger.LogWarning(exception, "Telegram API вернул ошибку во время polling. Причина: {Reason}", reason);
                break;

            default:
                _logger.LogError(exception, "Глобальная ошибка бота. Причина: {Reason}", reason);
                break;
        }

        return Task.CompletedTask;
    }

    private async Task HandleMessageAsync(ITelegramBotClient botClient, Message message, CancellationToken cancellationToken)
    {
        var userId = message.From!.Id;
        var text = message.Text?.Trim();
        var state = await _userStateService.GetStateAsync(userId, cancellationToken);

        // Обработка контакта (когда пользователь делится контактом через кнопку)
        if (message.Contact != null)
        {
            await HandleContactResponseAsync(botClient, userId, message, state, cancellationToken);
            return;
        }

        if (string.IsNullOrEmpty(text)) return;

        // Обработка команды /start в любом состоянии
        if (text == "/start")
        {
            ResetStateToStart(state);
            await _userStateService.SetStateAsync(userId, state, cancellationToken);
            
            await SendMessageAsync(
                botClient,
                userId,
                "🏠 Добро пожаловать в бот по поиску недвижимости!\n\nВыберите действие:",
                replyMarkup: CreateStartKeyboard(),
                cancellationToken: cancellationToken);
            return;
        }
        
        // Обработка команды /id (для получения ChatId)
        if (text == "/id")
        {
            await SendMessageAsync(
                botClient,
                userId,
                $"🔹 Ваш ChatId: `{userId}`\n\n" +
                $"Добавьте это значение в `appsettings.json`:\n" +
                $"```\n\"ManagerChatId\": {userId}\n```",
                parseMode: Telegram.Bot.Types.Enums.ParseMode.Markdown,
                cancellationToken: cancellationToken);
            return;
        }

        // Обработка команды отмены
        if (text == "❌ Отмена" || text == "/cancel")
        {
            // Если мы в процессе ввода фильтра — возвращаемся в меню фильтров
            if (state.CurrentStep is BotStep.FilterPriceMin or BotStep.FilterPriceMax or BotStep.FilterAreaMin or BotStep.FilterAreaMax)
            {
                state.CurrentStep = BotStep.ViewApartments;
                state.PendingInput = null;
                await _userStateService.SetStateAsync(userId, state, cancellationToken);

                await SendMessageAsync(
                    botClient,
                    userId,
                    "🔍 Выберите фильтр:",
                    replyMarkup: KeyboardFactory.CreateFilterKeyboard(state.CurrentFilters),
                    cancellationToken: cancellationToken);
            }
            // Если мы в процессе заполнения формы консультации
            else if (state.CurrentStep is BotStep.ConsultationName or BotStep.ConsultationPhone or BotStep.ContactManager)
            {
                state.CurrentStep = BotStep.ViewApartments;
                state.PendingInput = null;
                state.RequestedApartmentName = null;
                state.ConsultationClientName = null;
                await _userStateService.SetStateAsync(userId, state, cancellationToken);

                try
                {
                    await botClient.DeleteMessage(userId, message.MessageId, cancellationToken);
                }
                catch
                {
                    // Игнорируем ошибки удаления пользовательского сообщения
                }

                try
                {
                    await botClient.DeleteMessage(userId, message.MessageId - 1, cancellationToken);
                }
                catch
                {
                    // Игнорируем ошибки удаления предыдущего сообщения формы
                }

                await SendMessageAsync(
                    botClient,
                    userId,
                    "Заявка отменена.",
                    replyMarkup: new ReplyKeyboardRemove(),
                    cancellationToken: cancellationToken);
            }
            else
            {
                // Иначе сбрасываем всё и возвращаемся к началу
                ResetStateToStart(state);
                await _userStateService.SetStateAsync(userId, state, cancellationToken);

                await SendMessageAsync(
                    botClient,
                    userId,
                    "Действие отменено. Выберите город:",
                    replyMarkup: CreateStartKeyboard(),
                    cancellationToken: cancellationToken);
            }
            return;
        }

        switch (state.CurrentStep)
        {
            case BotStep.Start:
                await HandleStartCommandAsync(botClient, userId, text, cancellationToken);
                break;

            case BotStep.FilterPriceMin:
                await _filterWorkflowService.HandlePriceMinInputAsync(
                    botClient,
                    userId,
                    text,
                    state,
                    cancellationToken);
                break;

            case BotStep.FilterPriceMax:
                await _filterWorkflowService.HandlePriceMaxInputAsync(
                    botClient,
                    userId,
                    text,
                    state,
                    cancellationToken);
                break;

            case BotStep.FilterAreaMin:
                await _filterWorkflowService.HandleAreaMinInputAsync(
                    botClient,
                    userId,
                    text,
                    state,
                    cancellationToken);
                break;

            case BotStep.FilterAreaMax:
                await _filterWorkflowService.HandleAreaMaxInputAsync(
                    botClient,
                    userId,
                    text,
                    state,
                    cancellationToken);
                break;

            case BotStep.ContactManager:
                await HandleContactResponseAsync(botClient, userId, message, state, cancellationToken);
                break;

            case BotStep.ConsultationName:
                await HandleConsultationNameInputAsync(botClient, userId, text, state, cancellationToken);
                break;

            case BotStep.ConsultationPhone:
                await HandleConsultationPhoneInputAsync(botClient, userId, text, state, cancellationToken);
                break;
        }
    }

    private async Task HandleStartCommandAsync(ITelegramBotClient botClient, long userId, string text, CancellationToken cancellationToken)
    {
        if (text == "🏙 Выбрать город")
        {
            var cities = await _cityService.GetAllCitiesAsync(cancellationToken);

            if (cities.Count == 0)
            {
                await SendMessageAsync(botClient, userId, "Города пока не добавлены.", cancellationToken: cancellationToken);
                return;
            }

            await SendMessageAsync(
                botClient,
                userId,
                "🏙 Выберите город:",
                replyMarkup: KeyboardFactory.CreateCityKeyboard(cities),
                cancellationToken: cancellationToken);
        }
        else if (text == "📊 Мои фильтры")
        {
            var state = await _userStateService.GetStateAsync(userId, cancellationToken);
            var filters = state.CurrentFilters;

            var filterText = filters.HasActiveFilters
                ? $"📊 Активные фильтры:\n" +
                  $"• Отделка: {FormatFinishing(filters.Finishing)}\n" +
                  $"• Комнаты: {filters.Rooms ?? "Любые"}\n" +
                  $"• Цена: {filters.PriceMin?.ToString() ?? "0"} - {filters.PriceMax?.ToString() ?? "∞"}\n" +
                  $"• Площадь: {filters.AreaMin?.ToString() ?? "0"} - {filters.AreaMax?.ToString() ?? "∞"}"
                : "📊 Фильтры не установлены";

            var keyboard = new InlineKeyboardMarkup(new[]
            {
                new[]
                {
                    InlineKeyboardButton.WithCallbackData("🔍 Настроить фильтры", "filter:menu"),
                    InlineKeyboardButton.WithCallbackData("❌ Сбросить", "filter:reset")
                },
                new[]
                {
                    InlineKeyboardButton.WithCallbackData("🔙 Назад", "nav:back_to_start")
                }
            });

            await SendMessageAsync(botClient, userId, filterText, replyMarkup: keyboard, cancellationToken: cancellationToken);
        }
    }

    private async Task HandleCallbackQueryAsync(ITelegramBotClient botClient, CallbackQuery callbackQuery, CancellationToken cancellationToken)
    {
        var userId = callbackQuery.From.Id;
        var data = callbackQuery.Data;

        if (string.IsNullOrEmpty(data) || data == "ignore")
        {
            await AnswerCallbackQueryAsync(botClient, callbackQuery.Id, cancellationToken: cancellationToken);
            return;
        }

        try
        {
            var state = await _userStateService.GetStateAsync(userId, cancellationToken);
            var callbackAnswered = false;

            async Task AnswerCallbackOnceAsync(string? text = null)
            {
                if (callbackAnswered)
                {
                    return;
                }

                try
                {
                    await AnswerCallbackQueryAsync(botClient, callbackQuery.Id, text, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(
                        ex,
                        "Не удалось подтвердить callback query пользователю {UserId}. Продолжаем основной сценарий. CallbackId={CallbackId}",
                        userId,
                        callbackQuery.Id);
                }
                finally
                {
                    callbackAnswered = true;
                }
            }

            // Обработка кнопки "Выбрать город"
            if (data == "start_city")
            {
                var cities = await _cityService.GetAllCitiesAsync(cancellationToken);
                
                if (cities.Count == 0)
                {
                    await AnswerCallbackOnceAsync("Города пока не добавлены.");
                    return;
                }

                // Просто показываем список городов
                await SendMessageAsync(
                    botClient,
                    userId,
                    "🏙 Выберите город:",
                    replyMarkup: KeyboardFactory.CreateCityKeyboard(cities),
                    cancellationToken: cancellationToken);
                
                await AnswerCallbackOnceAsync();
                return;
            }

            // Обработка выбора города
            if (data.StartsWith(CityCallbackData.Prefix))
            {
                var cityId = CityCallbackData.Parse(data);
                state.SelectedCityId = cityId;
                state.SelectedCityName = null;
                state.SelectedDistrictId = null;
                state.SelectedDistrictName = null;
                state.SelectedDistrictPhotoUrl = null;
                state.SelectedApartmentId = null;
                state.SelectedApartmentSummary = null;
                state.RequestedApartmentName = null;
                state.CurrentStep = BotStep.SelectDistrict;

                var city = await _cityService.GetCityByIdAsync(cityId, cancellationToken);
                var districts = await _districtService.GetDistrictsByCityIdAsync(cityId, cancellationToken);
                state.SelectedCityName = city?.Name;
                await _userStateService.SetStateAsync(userId, state, cancellationToken);
                
                if (districts.Count == 0)
                {
                    await SendMessageAsync(botClient, userId, "В этом городе пока нет районов.", cancellationToken: cancellationToken);
                    await AnswerCallbackOnceAsync();
                    return;
                }

                // Отправляем фото города (если есть) и список районов
                await AnswerCallbackOnceAsync();
                await _apartmentPresentationService.ShowDistrictListAsync(
                    botClient,
                    userId,
                    city,
                    districts,
                    callbackQuery.Message!.MessageId,
                    cancellationToken);
                return;
            }

            // Обработка выбора района - показываем список квартир
            if (data.StartsWith(DistrictCallbackData.Prefix))
            {
                var districtId = DistrictCallbackData.Parse(data);
                DistrictDto? selectedDistrict = null;
                if (state.SelectedCityId.HasValue)
                {
                    var districts = await _districtService.GetDistrictsByCityIdAsync(state.SelectedCityId.Value, cancellationToken);
                    selectedDistrict = districts.FirstOrDefault(d => d.Id == districtId);
                }

                state.SelectedDistrictId = districtId;
                state.SelectedDistrictName = selectedDistrict?.Name;
                state.SelectedDistrictPhotoUrl = selectedDistrict?.Photos?.FirstOrDefault();
                state.DistrictPhotoShownForDistrictId = null;
                state.DistrictPhotoShownForPhotoUrl = null;
                state.ApartmentPhotoShownForApartmentId = null;
                state.ApartmentPhotoShownForPhotoUrl = null;
                state.SelectedApartmentId = null;
                state.SelectedApartmentSummary = null;
                state.RequestedApartmentName = null;
                state.CurrentStep = BotStep.ViewApartments;
                state.CurrentPage = 1;
                await _userStateService.SetStateAsync(userId, state, cancellationToken);

                await AnswerCallbackOnceAsync();
                await _apartmentPresentationService.ShowApartmentListAsync(
                    botClient,
                    userId,
                    state,
                    callbackQuery.Message!.MessageId,
                    cancellationToken);
                return;
            }

            // Обработка кнопки "Связаться с менеджером"
            if (data == "apt:contact")
            {
                await _apartmentNavigationService.HandleApartmentActionAsync(
                    botClient,
                    userId,
                    state,
                    (apartmentName, apartmentInfo) => HandleContactManagerAsync(botClient, userId, apartmentName, apartmentInfo, cancellationToken),
                    cancellationToken);
                await AnswerCallbackOnceAsync();
                return;
            }

            // Обработка кнопки "Получить консультацию"
            if (data == "apt:consultation")
            {
                await _apartmentNavigationService.HandleApartmentActionAsync(
                    botClient,
                    userId,
                    state,
                    (apartmentName, apartmentInfo) => HandleConsultationRequestAsync(botClient, userId, apartmentName, apartmentInfo, cancellationToken),
                    cancellationToken);
                await AnswerCallbackOnceAsync();
                return;
            }

            if (data == "apt:gallery")
            {
                await AnswerCallbackOnceAsync();
                await _apartmentNavigationService.HandleSelectedApartmentAsync(
                    botClient,
                    userId,
                    state,
                    apartment => _apartmentPresentationService.ShowApartmentGalleryAsync(
                        botClient,
                        userId,
                        apartment,
                        cancellationToken),
                    cancellationToken);
                return;
            }

            // Обработка выбора квартиры
            if (data.StartsWith(ApartmentCallbackData.Prefix))
            {
                await AnswerCallbackOnceAsync();
                await _apartmentNavigationService.HandleApartmentSelectionAsync(
                    botClient,
                    userId,
                    data,
                    state,
                    apartment => _apartmentPresentationService.ShowApartmentDetailsAsync(
                        botClient,
                        userId,
                        apartment,
                        callbackQuery.Message!.MessageId,
                        cancellationToken),
                    cancellationToken);
                return;
            }

            // Обработка пагинации
            if (data.StartsWith(PageCallbackData.Prefix))
            {
                var page = PageCallbackData.Parse(data);
                state.CurrentPage = page;
                await _userStateService.SetStateAsync(userId, state, cancellationToken);

                await AnswerCallbackOnceAsync();
                await _apartmentPresentationService.ShowApartmentListAsync(
                    botClient,
                    userId,
                    state,
                    callbackQuery.Message!.MessageId,
                    cancellationToken);
                return;
            }

            // Обработка фильтров (только из квартир)
            if (data.StartsWith(FilterCallbackData.Prefix) || data.StartsWith("apartments_filter:"))
            {
                var filterData = data.StartsWith("apartments_filter:")
                    ? data.Replace("apartments_filter:", "filter:")
                    : data;

                await _filterWorkflowService.HandleFilterCallbackAsync(
                    botClient,
                    userId,
                    filterData,
                    state,
                    callbackQuery.Message!.MessageId,
                    () => _apartmentPresentationService.ShowApartmentListAsync(
                        botClient,
                        userId,
                        state,
                        callbackQuery.Message!.MessageId,
                        cancellationToken),
                    CreateStartKeyboard,
                    cancellationToken);
                await AnswerCallbackOnceAsync();
                return;
            }

            // Обработка навигации
            if (data.StartsWith(NavigationCallbackData.Prefix))
            {
                await _apartmentNavigationService.HandleNavigationCallbackAsync(
                    botClient,
                    userId,
                    data,
                    state,
                    callbackQuery.Message!.MessageId,
                    () => _apartmentPresentationService.ShowApartmentListAsync(
                        botClient,
                        userId,
                        state,
                        callbackQuery.Message!.MessageId,
                        cancellationToken),
                    CreateStartKeyboard,
                    cancellationToken);
                await AnswerCallbackOnceAsync();
                return;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при обработке callback query от пользователя {UserId}", userId);
            try
            {
                await AnswerCallbackQueryAsync(botClient, callbackQuery.Id, "Произошла ошибка. Попробуйте позже.", cancellationToken);
            }
            catch
            {
                // Игнорируем ошибку повторного/просроченного callback query
            }
        }
    }

    private async Task HandleContactManagerAsync(
        ITelegramBotClient botClient,
        long userId,
        string apartmentName,
        string apartmentInfo,
        CancellationToken cancellationToken)
    {
        await _leadRequestService.BeginManagerContactAsync(
            botClient,
            userId,
            apartmentName,
            apartmentInfo,
            cancellationToken);
    }

    private async Task HandleConsultationRequestAsync(
        ITelegramBotClient botClient,
        long userId,
        string apartmentName,
        string apartmentInfo,
        CancellationToken cancellationToken)
    {
        await _leadRequestService.BeginConsultationAsync(
            botClient,
            userId,
            apartmentName,
            apartmentInfo,
            cancellationToken);
    }

    private async Task HandleContactResponseAsync(
        ITelegramBotClient botClient,
        long userId,
        Message message,
        UserState state,
        CancellationToken cancellationToken)
    {
        await _leadRequestService.HandleContactResponseAsync(
            botClient,
            userId,
            message,
            state,
            cancellationToken);
    }

    private async Task HandleConsultationNameInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken)
    {
        await _leadRequestService.HandleConsultationNameInputAsync(
            botClient,
            userId,
            text,
            state,
            cancellationToken);
    }

    private async Task HandleConsultationPhoneInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken)
    {
        await _leadRequestService.HandleConsultationPhoneInputAsync(
            botClient,
            userId,
            text,
            state,
            cancellationToken);
    }

    private static InlineKeyboardMarkup CreateStartKeyboard()
    {
        return new InlineKeyboardMarkup(new[]
        {
            new[] { InlineKeyboardButton.WithCallbackData("🏙 Выбрать город", "start_city") }
        });
    }

    private static void ResetStateToStart(UserState state)
    {
        state.CurrentStep = BotStep.Start;
        state.SelectedCityId = null;
        state.SelectedCityName = null;
        state.SelectedDistrictId = null;
        state.SelectedDistrictName = null;
        state.SelectedDistrictPhotoUrl = null;
        state.DistrictPhotoShownForDistrictId = null;
        state.DistrictPhotoShownForPhotoUrl = null;
        state.ApartmentPhotoShownForApartmentId = null;
        state.ApartmentPhotoShownForPhotoUrl = null;
        state.SelectedApartmentId = null;
        state.SelectedApartmentSummary = null;
        state.RequestedApartmentName = null;
        state.ConsultationClientName = null;
        state.PendingInput = null;
        state.CurrentPage = 1;
        state.CurrentFilters.Reset();
    }

    private static string FormatFinishing(FinishingType? finishing) => finishing switch
    {
        FinishingType.Чистовая => "Чистовая",
        FinishingType.ВайтБокс => "Вайт бокс",
        FinishingType.БезОтделки => "Без отделки",
        _ => "Любая"
    };

    private Task SendMessageAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        ParseMode parseMode = ParseMode.None,
        ReplyMarkup? replyMarkup = null,
        CancellationToken cancellationToken = default)
    {
        return _telegramRetryService.ExecuteAsync(
            "SendMessage:Handler",
            ct => botClient.SendMessage(
                userId,
                text,
                parseMode: parseMode,
                replyMarkup: replyMarkup,
                cancellationToken: ct),
            cancellationToken);
    }

    private Task AnswerCallbackQueryAsync(
        ITelegramBotClient botClient,
        string callbackQueryId,
        string? text = null,
        CancellationToken cancellationToken = default)
    {
        return _telegramRetryService.ExecuteAsync(
            "AnswerCallbackQuery:Handler",
            ct => botClient.AnswerCallbackQuery(callbackQueryId, text, cancellationToken: ct),
            cancellationToken);
    }
}

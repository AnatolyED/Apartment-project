using System.Diagnostics;
using ApartmentBot.Application.DTOs;
using ApartmentBot.Application.Services;
using ApartmentBot.Bot.CallbackData;
using ApartmentBot.Bot.Keyboards;
using ApartmentBot.Domain.Interfaces;
using ApartmentBot.Infrastructure.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.ReplyMarkups;

namespace ApartmentBot.Bot.Services;

public interface IApartmentPresentationService
{
    Task ShowApartmentListAsync(
        ITelegramBotClient botClient,
        long userId,
        UserState state,
        int messageId,
        CancellationToken cancellationToken);

    Task ShowDistrictListAsync(
        ITelegramBotClient botClient,
        long userId,
        CityDto? city,
        IReadOnlyList<DistrictDto> districts,
        int messageId,
        CancellationToken cancellationToken);

    Task ShowCitySearchModeAsync(
        ITelegramBotClient botClient,
        long userId,
        CityDto city,
        int messageId,
        CancellationToken cancellationToken);

    Task ShowApartmentDetailsAsync(
        ITelegramBotClient botClient,
        long userId,
        ApartmentDto apartment,
        int messageId,
        CancellationToken cancellationToken);

    Task ShowApartmentGalleryAsync(
        ITelegramBotClient botClient,
        long userId,
        ApartmentDto apartment,
        CancellationToken cancellationToken);
}

public sealed class ApartmentPresentationService : IApartmentPresentationService
{
    private readonly IApartmentService _apartmentService;
    private readonly IDistrictService _districtService;
    private readonly IUserStateService _userStateService;
    private readonly IApartmentMessageFormatter _apartmentMessageFormatter;
    private readonly ITelegramMediaService _telegramMediaService;
    private readonly ITelegramRetryService _telegramRetryService;
    private readonly IOptions<TelegramSettings> _telegramSettings;
    private readonly ILogger<ApartmentPresentationService> _logger;

    public ApartmentPresentationService(
        IApartmentService apartmentService,
        IDistrictService districtService,
        IUserStateService userStateService,
        IApartmentMessageFormatter apartmentMessageFormatter,
        ITelegramMediaService telegramMediaService,
        ITelegramRetryService telegramRetryService,
        IOptions<TelegramSettings> telegramSettings,
        ILogger<ApartmentPresentationService> logger)
    {
        _apartmentService = apartmentService;
        _districtService = districtService;
        _userStateService = userStateService;
        _apartmentMessageFormatter = apartmentMessageFormatter;
        _telegramMediaService = telegramMediaService;
        _telegramRetryService = telegramRetryService;
        _telegramSettings = telegramSettings;
        _logger = logger;
    }

    public async Task ShowApartmentListAsync(
        ITelegramBotClient botClient,
        long userId,
        UserState state,
        int messageId,
        CancellationToken cancellationToken)
    {
        if (!state.SelectedCityId.HasValue)
        {
            return;
        }

        var isCitySearch = state.SearchMode == ApartmentSearchMode.ByCity;
        if (!isCitySearch && !state.SelectedDistrictId.HasValue)
        {
            return;
        }

        IReadOnlyDictionary<Guid, string> districtNames = new Dictionary<Guid, string>();
        if (state.SelectedCityId.HasValue)
        {
            var cityDistricts = await _districtService.GetDistrictsByCityIdAsync(state.SelectedCityId.Value, cancellationToken);
            districtNames = cityDistricts.ToDictionary(d => d.Id, d => d.Name);
        }

        if (!isCitySearch && state.SelectedDistrictId.HasValue)
        {
            var currentDistrict = await _districtService.GetDistrictByIdAsync(state.SelectedDistrictId.Value, cancellationToken);
            state.SelectedDistrictName = currentDistrict?.Name ?? state.SelectedDistrictName;
            state.SelectedDistrictPhotoUrl = currentDistrict?.Photos?.FirstOrDefault();
            await _userStateService.SetStateAsync(userId, state, cancellationToken);
        }

        var currentFilters = state.GetCurrentFilters();
        var apartments = await _apartmentService.GetApartmentsAsync(
            districtId: isCitySearch ? null : state.SelectedDistrictId,
            cityId: isCitySearch ? state.SelectedCityId : null,
            filters: currentFilters.HasActiveFilters ? currentFilters : null,
            page: state.CurrentPage,
            limit: 20,
            cancellationToken: cancellationToken);

        var navigationKeyboard = KeyboardFactory.CreateApartmentListNavigationKeyboard(
            state.CurrentPage,
            apartments.TotalPages,
            currentFilters.HasActiveFilters,
            state.SearchMode);

        if (apartments.Apartments.Count == 0)
        {
            var emptyMessage = isCitySearch
                ? "🏠 В выбранном городе квартиры по этим параметрам не найдены.\n\nПопробуйте изменить фильтры."
                : "🏠 Квартиры не найдены.\n\nПопробуйте изменить фильтры или выбрать другой район.";

            await SendOrEditTextMessageAsync(
                botClient,
                userId,
                messageId,
                emptyMessage,
                navigationKeyboard,
                cancellationToken);
            return;
        }

        var keyboard = new List<List<InlineKeyboardButton>>();
        foreach (var apartment in apartments.Apartments)
        {
            var districtLabel = isCitySearch && districtNames.TryGetValue(apartment.DistrictId, out var districtName)
                ? $"{districtName} | "
                : string.Empty;
            var buttonText = $"{districtLabel}{apartment.Name} | {ApartmentMessageFormatter.FormatArea(apartment.Area)}";
            keyboard.Add(
            [
                InlineKeyboardButton.WithCallbackData(
                    buttonText,
                    new ApartmentCallbackData { ApartmentId = apartment.Id }.ToCallbackData())
            ]);
        }

        foreach (var row in navigationKeyboard.InlineKeyboard)
        {
            keyboard.Add(row.ToList());
        }

        var listTitle = isCitySearch
            ? $"🏙 {state.SelectedCityName}\n\nНайдено квартир: {apartments.Total}\nВыберите квартиру:"
            : $"📍 {state.SelectedDistrictName}\n\nНайдено квартир: {apartments.Total}\nВыберите квартиру:";

        if (!isCitySearch && !string.IsNullOrEmpty(state.SelectedDistrictPhotoUrl))
        {
            var photoUrl = state.SelectedDistrictPhotoUrl;
            var shouldSendDistrictPhoto =
                state.DistrictPhotoShownForDistrictId != state.SelectedDistrictId ||
                !string.Equals(state.DistrictPhotoShownForPhotoUrl, photoUrl, StringComparison.Ordinal);

            if (shouldSendDistrictPhoto)
            {
                var fullUrl = _telegramMediaService.BuildWebPanelFileUrl(photoUrl);

                try
                {
                    await SendPhotoWithMetricsAsync(
                        botClient,
                        userId,
                        photoUrl,
                        fullUrl,
                        listTitle,
                        new InlineKeyboardMarkup(keyboard),
                        "district",
                        cancellationToken);

                    state.DistrictPhotoShownForDistrictId = state.SelectedDistrictId;
                    state.DistrictPhotoShownForPhotoUrl = photoUrl;
                    await _userStateService.SetStateAsync(userId, state, cancellationToken);

                    if (messageId != 0)
                    {
                        try
                        {
                            await _telegramRetryService.ExecuteAsync(
                                "DeleteMessage:ApartmentListSource",
                                ct => botClient.DeleteMessage(userId, messageId, ct),
                                cancellationToken);
                        }
                        catch
                        {
                        }
                    }

                    return;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Не удалось отправить фото района, продолжаем текстовой выдачей.");
                }
            }
        }

        await SendOrEditTextMessageAsync(
            botClient,
            userId,
            messageId,
            listTitle,
            new InlineKeyboardMarkup(keyboard),
            cancellationToken);
    }

    public async Task ShowDistrictListAsync(
        ITelegramBotClient botClient,
        long userId,
        CityDto? city,
        IReadOnlyList<DistrictDto> districts,
        int messageId,
        CancellationToken cancellationToken)
    {
        var keyboard = KeyboardFactory.CreateDistrictKeyboard(districts, city?.Id, backToCityMode: true);
        var message = city != null
            ? $"🏙 {city.Name}\n\n📍 Выберите район:"
            : "📍 Выберите район:";

        await SendOrEditTextMessageAsync(botClient, userId, messageId, message, keyboard, cancellationToken);
    }

    public async Task ShowCitySearchModeAsync(
        ITelegramBotClient botClient,
        long userId,
        CityDto city,
        int messageId,
        CancellationToken cancellationToken)
    {
        var state = await _userStateService.GetStateAsync(userId, cancellationToken);
        var cityFiltersNote = state.CityFilters.HasActiveFilters
            ? "\n\nНастроены фильтры по городу."
            : string.Empty;
        var message = $"🏙 {city.Name}\n\nЧто удобнее?{cityFiltersNote}";
        var keyboard = KeyboardFactory.CreateCitySearchModeKeyboard(city.Id);
        await SendOrEditTextMessageAsync(botClient, userId, messageId, message, keyboard, cancellationToken);
    }

    public async Task ShowApartmentDetailsAsync(
        ITelegramBotClient botClient,
        long userId,
        ApartmentDto apartment,
        int messageId,
        CancellationToken cancellationToken)
    {
        if (apartment is null)
        {
            await _telegramRetryService.ExecuteAsync(
                "SendMessage:ApartmentNotFound",
                ct => botClient.SendMessage(userId, "❌ Квартира не найдена.", cancellationToken: ct),
                cancellationToken);
            return;
        }

        var state = await _userStateService.GetStateAsync(userId, cancellationToken);
        var districtName = state.SearchMode == ApartmentSearchMode.ByCity
            ? (await _districtService.GetDistrictByIdAsync(apartment.DistrictId, cancellationToken))?.Name
            : null;

        var message = _apartmentMessageFormatter.FormatApartmentMessage(apartment, districtName);
        var replyMarkup = KeyboardFactory.CreateApartmentDetailsKeyboard(
            _telegramSettings.Value.ManagerChatId,
            apartment.Photos.Count > 1);
        var photoUrl = apartment.Photos.FirstOrDefault();

        if (!string.IsNullOrEmpty(photoUrl))
        {
            var shouldSendApartmentPhoto =
                state.ApartmentPhotoShownForApartmentId != apartment.Id ||
                !string.Equals(state.ApartmentPhotoShownForPhotoUrl, photoUrl, StringComparison.Ordinal);

            if (!shouldSendApartmentPhoto)
            {
                await SendOrEditTextMessageAsync(
                    botClient,
                    userId,
                    messageId,
                    "Фото этой квартиры уже показано выше.\n\n" + message,
                    replyMarkup,
                    cancellationToken);
                return;
            }

            var fullUrl = _telegramMediaService.BuildWebPanelFileUrl(photoUrl);

            try
            {
                await SendPhotoWithMetricsAsync(
                    botClient,
                    userId,
                    photoUrl,
                    fullUrl,
                    message,
                    replyMarkup,
                    "apartment",
                    cancellationToken);

                state.ApartmentPhotoShownForApartmentId = apartment.Id;
                state.ApartmentPhotoShownForPhotoUrl = photoUrl;
                state.SelectedApartmentSummary = message;
                await _userStateService.SetStateAsync(userId, state, cancellationToken);
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Не удалось отправить фото квартиры, продолжаем текстовой карточкой.");
            }
        }

        state.SelectedApartmentSummary = message;
        await _userStateService.SetStateAsync(userId, state, cancellationToken);

        await _telegramRetryService.ExecuteAsync(
            "SendMessage:ApartmentDetailsFallback",
            ct => botClient.SendMessage(userId, message, replyMarkup: replyMarkup, cancellationToken: ct),
            cancellationToken);
    }

    public async Task ShowApartmentGalleryAsync(
        ITelegramBotClient botClient,
        long userId,
        ApartmentDto apartment,
        CancellationToken cancellationToken)
    {
        var galleryPhotos = apartment.Photos.Skip(1).Take(9).ToList();
        if (galleryPhotos.Count == 0)
        {
            await _telegramRetryService.ExecuteAsync(
                "SendMessage:ApartmentGalleryEmpty",
                ct => botClient.SendMessage(userId, "У этой квартиры пока нет дополнительных фото.", cancellationToken: ct),
                cancellationToken);
            return;
        }

        var media = new List<InputMediaPhoto>();
        foreach (var photoUrl in galleryPhotos)
        {
            var fullUrl = _telegramMediaService.BuildWebPanelFileUrl(photoUrl);
            var inputFile = await _telegramMediaService.LoadPhotoAsInputFileAsync(photoUrl, fullUrl, cancellationToken);
            media.Add(new InputMediaPhoto(inputFile));
        }

        media[0].Caption = $"📷 Дополнительные фото квартиры: {apartment.Name}";
        await _telegramRetryService.ExecuteAsync(
            "SendMediaGroup:ApartmentGallery",
            ct => botClient.SendMediaGroup(userId, media, cancellationToken: ct),
            cancellationToken);
    }

    private async Task SendPhotoWithMetricsAsync(
        ITelegramBotClient botClient,
        long userId,
        string relativePhotoUrl,
        string fullPhotoUrl,
        string caption,
        InlineKeyboardMarkup replyMarkup,
        string entityType,
        CancellationToken cancellationToken)
    {
        var loadStopwatch = Stopwatch.StartNew();
        var inputFile = await _telegramMediaService.LoadPhotoAsInputFileAsync(relativePhotoUrl, fullPhotoUrl, cancellationToken);
        loadStopwatch.Stop();

        _logger.LogInformation(
            "Подготовка фото для {EntityType} завершена за {ElapsedMs} мс",
            entityType,
            loadStopwatch.ElapsedMilliseconds);

        var sendStopwatch = Stopwatch.StartNew();
        await _telegramRetryService.ExecuteAsync(
            $"SendPhoto:{entityType}",
            ct => botClient.SendPhoto(userId, inputFile, caption, replyMarkup: replyMarkup, cancellationToken: ct),
            cancellationToken);
        sendStopwatch.Stop();

        _logger.LogInformation(
            "Отправка фото для {EntityType} в Telegram заняла {ElapsedMs} мс",
            entityType,
            sendStopwatch.ElapsedMilliseconds);
    }

    private async Task SendOrEditTextMessageAsync(
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
                    "EditMessageText:Presentation",
                    ct => botClient.EditMessageText(userId, messageId, message, replyMarkup: replyMarkup, cancellationToken: ct),
                    cancellationToken);
                return;
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "Не удалось обновить текущее сообщение, отправляем новое.");
            }
        }

        await _telegramRetryService.ExecuteAsync(
            "SendMessage:PresentationFallback",
            ct => botClient.SendMessage(userId, message, replyMarkup: replyMarkup, cancellationToken: ct),
            cancellationToken);
    }
}

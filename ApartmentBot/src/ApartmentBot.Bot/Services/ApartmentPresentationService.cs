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
        if (!state.SelectedDistrictId.HasValue)
        {
            return;
        }

        var currentDistrict = await _districtService.GetDistrictByIdAsync(
            state.SelectedDistrictId.Value,
            cancellationToken);

        state.SelectedDistrictName = currentDistrict?.Name ?? state.SelectedDistrictName;
        state.SelectedDistrictPhotoUrl = currentDistrict?.Photos?.FirstOrDefault();
        await _userStateService.SetStateAsync(userId, state, cancellationToken);

        var apartments = await _apartmentService.GetApartmentsAsync(
            districtId: state.SelectedDistrictId.Value,
            filters: state.CurrentFilters.HasActiveFilters ? state.CurrentFilters : null,
            page: state.CurrentPage,
            limit: 20,
            cancellationToken: cancellationToken);

        if (apartments.Apartments.Count == 0)
        {
            await SendOrEditApartmentListMessageAsync(
                botClient,
                userId,
                messageId,
                "🏠 Квартиры не найдены.\n\nПопробуйте изменить фильтры или выбрать другой район.",
                KeyboardFactory.CreateApartmentListNavigationKeyboard(
                    state.CurrentPage,
                    apartments.TotalPages,
                    state.CurrentFilters.HasActiveFilters),
                cancellationToken);
            return;
        }

        var keyboard = new List<List<InlineKeyboardButton>>();
        foreach (var apartment in apartments.Apartments)
        {
            var buttonText = $"{apartment.Name} | {ApartmentMessageFormatter.FormatArea(apartment.Area)}";
            keyboard.Add(
            [
                InlineKeyboardButton.WithCallbackData(
                    buttonText,
                    new ApartmentCallbackData { ApartmentId = apartment.Id }.ToCallbackData())
            ]);
        }

        foreach (var row in KeyboardFactory.CreateApartmentListNavigationKeyboard(
                     state.CurrentPage,
                     apartments.TotalPages,
                     state.CurrentFilters.HasActiveFilters).InlineKeyboard)
        {
            keyboard.Add(row.ToList());
        }

        var message = $"🏠 Доступно квартир: {apartments.Total}\n\nВыберите квартиру:";
        var photoUrl = state.SelectedDistrictPhotoUrl;

        if (!string.IsNullOrEmpty(photoUrl))
        {
            var shouldSendDistrictPhoto =
                state.DistrictPhotoShownForDistrictId != state.SelectedDistrictId ||
                !string.Equals(state.DistrictPhotoShownForPhotoUrl, photoUrl, StringComparison.Ordinal);

            if (shouldSendDistrictPhoto)
            {
                var fullUrl = _telegramMediaService.BuildWebPanelFileUrl(photoUrl);
                _logger.LogInformation("Загрузка фото района: {Url}", fullUrl);

                try
                {
                    await SendPhotoWithMetricsAsync(
                        botClient,
                        userId,
                        photoUrl,
                        fullUrl,
                        message,
                        new InlineKeyboardMarkup(keyboard),
                        "район",
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

                    _logger.LogInformation("Фото района успешно отправлено");
                    return;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Не удалось загрузить фото района. Отправляем текст.");
                    await SendOrEditApartmentListMessageAsync(
                        botClient,
                        userId,
                        messageId,
                        "Фото района временно недоступно, поэтому показываю список квартир без изображения.\n\n" + message,
                        new InlineKeyboardMarkup(keyboard),
                        cancellationToken);
                    return;
                }
            }
        }

        await SendOrEditApartmentListMessageAsync(
            botClient,
            userId,
            messageId,
            message,
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
        var keyboard = KeyboardFactory.CreateDistrictKeyboard(districts, city?.Id);
        var message = city != null
            ? $"🏙 {city.Name}\n\n📍 Выберите район:"
            : "📍 Выберите район:";

        try
        {
            await _telegramRetryService.ExecuteAsync(
                "EditMessageText:DistrictList",
                ct => botClient.EditMessageText(
                    userId,
                    messageId,
                    message,
                    replyMarkup: keyboard,
                    cancellationToken: ct),
                cancellationToken);
        }
        catch (Exception ex) when (ex.Message.Contains("not modified", StringComparison.OrdinalIgnoreCase))
        {
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Не удалось обновить сообщение со списком районов. Отправляем новое сообщение. UserId={UserId}, MessageId={MessageId}",
                userId,
                messageId);

            await _telegramRetryService.ExecuteAsync(
                "SendMessage:DistrictListFallback",
                ct => botClient.SendMessage(
                    userId,
                    message,
                    replyMarkup: keyboard,
                    cancellationToken: ct),
                cancellationToken);
        }
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
                ct => botClient.SendMessage(
                    userId,
                    "❌ Квартира не найдена.",
                    cancellationToken: ct),
                cancellationToken);
            return;
        }

        var message = _apartmentMessageFormatter.FormatApartmentMessage(apartment);
        var replyMarkup = KeyboardFactory.CreateApartmentDetailsKeyboard(
            _telegramSettings.Value.ManagerChatId,
            apartment.Photos.Count > 1);
        var photoUrl = apartment.Photos.FirstOrDefault();
        var state = await _userStateService.GetStateAsync(userId, cancellationToken);

        _logger.LogInformation(
            "Показ квартиры: Id={Id}, Name={Name}, Photos={PhotosCount}, FirstPhoto={PhotoUrl}",
            apartment.Id,
            apartment.Name,
            apartment.Photos.Count,
            photoUrl);

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
            _logger.LogInformation("Загрузка фото: {Url}", fullUrl);

            try
            {
                await SendPhotoWithMetricsAsync(
                    botClient,
                    userId,
                    photoUrl,
                    fullUrl,
                    message,
                    replyMarkup,
                    "квартира",
                    cancellationToken);

                state.ApartmentPhotoShownForApartmentId = apartment.Id;
                state.ApartmentPhotoShownForPhotoUrl = photoUrl;
                await _userStateService.SetStateAsync(userId, state, cancellationToken);

                _logger.LogInformation("Фото успешно отправлено");
                return;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Не удалось загрузить фото. Отправляем только текст. URL: {Url}", fullUrl);
            }
        }
        else
        {
            _logger.LogInformation("Фото не найдено");
        }

        await _telegramRetryService.ExecuteAsync(
            "SendMessage:ApartmentDetailsFallback",
            ct => botClient.SendMessage(
                userId,
                (string.IsNullOrEmpty(photoUrl) ? string.Empty : "Фото временно недоступно, поэтому показываю описание.\n\n") + message,
                replyMarkup: replyMarkup,
                cancellationToken: ct),
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
                ct => botClient.SendMessage(
                    userId,
                    "У этой квартиры пока нет дополнительных фото.",
                    cancellationToken: ct),
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
            "Медиа-пайплайн: {EntityType} — подготовка фото завершена за {ElapsedMs} мс",
            entityType,
            loadStopwatch.ElapsedMilliseconds);

        var sendStopwatch = Stopwatch.StartNew();
        await _telegramRetryService.ExecuteAsync(
            $"SendPhoto:{entityType}",
            ct => botClient.SendPhoto(
                userId,
                inputFile,
                caption,
                replyMarkup: replyMarkup,
                cancellationToken: ct),
            cancellationToken);
        sendStopwatch.Stop();

        _logger.LogInformation(
            "Медиа-пайплайн: {EntityType} — отправка фото в Telegram заняла {ElapsedMs} мс",
            entityType,
            sendStopwatch.ElapsedMilliseconds);
    }

    private async Task SendOrEditApartmentListMessageAsync(
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
                    "EditMessageText:ApartmentList",
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
                _logger.LogDebug(
                    ex,
                    "Не удалось обновить текущее сообщение со списком квартир. Отправляем новое сообщение.");
            }
        }

        await _telegramRetryService.ExecuteAsync(
            "SendMessage:ApartmentList",
            ct => botClient.SendMessage(
                userId,
                message,
                replyMarkup: replyMarkup,
                cancellationToken: ct),
            cancellationToken);
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
                    "EditMessageText:TextFallback",
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
                _logger.LogDebug(
                    ex,
                    "Не удалось обновить текущее текстовое сообщение. Отправляем новое сообщение.");
            }
        }

        await _telegramRetryService.ExecuteAsync(
            "SendMessage:TextFallback",
            ct => botClient.SendMessage(
                userId,
                message,
                replyMarkup: replyMarkup,
                cancellationToken: ct),
            cancellationToken);
    }
}

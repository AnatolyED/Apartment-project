using ApartmentBot.Application.Services;
using ApartmentBot.Domain.Interfaces;
using ApartmentBot.Max.CallbackData;
using ApartmentBot.Max.Keyboards;
using Max.Bot.Polling;
using Max.Bot.Types.Enums;
using Max.Bot.Types.Requests;

namespace ApartmentBot.Max;

public interface IMaxBotHandler : IUpdateHandler
{
}

public sealed class MaxBotHandler : IMaxBotHandler
{
    private const string StartMessage =
        "Добро пожаловать в каталог недвижимости.\n\nВыберите город, чтобы продолжить:";

    private readonly ILogger<MaxBotHandler> _logger;
    private readonly ICityService _cityService;
    private readonly IDistrictService _districtService;
    private readonly IUserStateService _userStateService;

    public MaxBotHandler(
        ILogger<MaxBotHandler> logger,
        ICityService cityService,
        IDistrictService districtService,
        IUserStateService userStateService)
    {
        _logger = logger;
        _cityService = cityService;
        _districtService = districtService;
        _userStateService = userStateService;
    }

    public async Task HandleUpdateAsync(UpdateContext context, CancellationToken cancellationToken)
    {
        switch (context.Update.Type)
        {
            case UpdateType.MessageCreated:
                await HandleMessageAsync(context, cancellationToken);
                break;

            case UpdateType.MessageCallback:
                await HandleCallbackQueryAsync(context, cancellationToken);
                break;

            default:
                await HandleUnknownUpdateAsync(context, cancellationToken);
                break;
        }
    }

    public async Task HandleMessageAsync(UpdateContext context, CancellationToken cancellationToken)
    {
        var message = context.Update.Message ?? context.Update.MessageUpdate?.Message;
        var chatId = context.Update.ChatId;
        var text = message?.Text?.Trim();

        _logger.LogInformation(
            "MAX message update received. UpdateId={UpdateId}, ChatId={ChatId}, Text={Text}",
            context.Update.UpdateId,
            chatId,
            text);

        if (chatId is null || string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        if (text.Equals("/start", StringComparison.OrdinalIgnoreCase) ||
            text.Equals("Выбрать город", StringComparison.OrdinalIgnoreCase))
        {
            await ShowCitiesAsync(context, chatId.Value, cancellationToken);
        }
    }

    public async Task HandleCallbackQueryAsync(UpdateContext context, CancellationToken cancellationToken)
    {
        var callback = context.Update.Callback;
        var chatId = context.Update.ChatId;
        var payload = callback?.Payload;

        _logger.LogInformation(
            "MAX callback received. UpdateId={UpdateId}, CallbackId={CallbackId}, Payload={Payload}",
            context.Update.UpdateId,
            callback?.CallbackId,
            payload);

        if (chatId is null || string.IsNullOrWhiteSpace(payload))
        {
            return;
        }

        if (payload == MaxNavigationCallbacks.ShowCities || payload == MaxNavigationCallbacks.BackToCities)
        {
            await AnswerCallbackAsync(context, callback?.CallbackId, cancellationToken);
            await ShowCitiesAsync(context, chatId.Value, cancellationToken);
            return;
        }

        if (MaxCityCallbackData.TryParse(payload, out var cityId))
        {
            await AnswerCallbackAsync(context, callback?.CallbackId, cancellationToken);
            await ShowDistrictsAsync(context, chatId.Value, cityId, cancellationToken);
            return;
        }

        if (MaxDistrictCallbackData.TryParse(payload, out var districtId))
        {
            await AnswerCallbackAsync(context, callback?.CallbackId, cancellationToken);
            await HandleDistrictSelectionAsync(context, chatId.Value, districtId, cancellationToken);
        }
    }

    public Task HandleUnknownUpdateAsync(UpdateContext context, CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "MAX unknown update received. UpdateId={UpdateId}, Type={Type}",
            context.Update.UpdateId,
            context.Update.Type);

        return Task.CompletedTask;
    }

    private async Task ShowCitiesAsync(UpdateContext context, long chatId, CancellationToken cancellationToken)
    {
        var cities = await _cityService.GetAllCitiesAsync(cancellationToken);

        if (cities.Count == 0)
        {
            await context.Api.Messages.SendMessageAsync(
                chatId,
                "Города пока не добавлены.",
                cancellationToken);
            return;
        }

        var state = await _userStateService.GetStateAsync(chatId, cancellationToken);
        state.SelectedCityId = null;
        state.SelectedCityName = null;
        state.SelectedDistrictId = null;
        state.SelectedDistrictName = null;
        state.CurrentStep = BotStep.SelectCity;
        await _userStateService.SetStateAsync(chatId, state, cancellationToken);

        await context.Api.Messages.SendMessageAsync(
            chatId,
            StartMessage,
            MaxKeyboardFactory.CreateCityKeyboard(cities),
            cancellationToken: cancellationToken);
    }

    private async Task ShowDistrictsAsync(UpdateContext context, long chatId, Guid cityId, CancellationToken cancellationToken)
    {
        var city = await _cityService.GetCityByIdAsync(cityId, cancellationToken);
        var districts = await _districtService.GetDistrictsByCityIdAsync(cityId, cancellationToken);

        var state = await _userStateService.GetStateAsync(chatId, cancellationToken);
        state.SelectedCityId = cityId;
        state.SelectedCityName = city?.Name;
        state.SelectedDistrictId = null;
        state.SelectedDistrictName = null;
        state.CurrentStep = BotStep.SelectDistrict;
        await _userStateService.SetStateAsync(chatId, state, cancellationToken);

        if (districts.Count == 0)
        {
            await context.Api.Messages.SendMessageAsync(
                chatId,
                city is null
                    ? "В этом городе пока нет районов."
                    : $"В городе {city.Name} пока нет районов.",
                cancellationToken);
            return;
        }

        var message = city is null
            ? "Выберите район:"
            : $"Город: {city.Name}\n\nВыберите район:";

        await context.Api.Messages.SendMessageAsync(
            chatId,
            message,
            MaxKeyboardFactory.CreateDistrictKeyboard(districts),
            cancellationToken: cancellationToken);
    }

    private async Task HandleDistrictSelectionAsync(
        UpdateContext context,
        long chatId,
        Guid districtId,
        CancellationToken cancellationToken)
    {
        var state = await _userStateService.GetStateAsync(chatId, cancellationToken);
        if (!state.SelectedCityId.HasValue)
        {
            await ShowCitiesAsync(context, chatId, cancellationToken);
            return;
        }

        var districts = await _districtService.GetDistrictsByCityIdAsync(state.SelectedCityId.Value, cancellationToken);
        var district = districts.FirstOrDefault(item => item.Id == districtId);

        state.SelectedDistrictId = districtId;
        state.SelectedDistrictName = district?.Name;
        state.CurrentStep = BotStep.ViewApartments;
        await _userStateService.SetStateAsync(chatId, state, cancellationToken);

        await context.Api.Messages.SendMessageAsync(
            chatId,
            district is null
                ? "Район выбран. Следующий этап — перенос списка квартир."
                : $"Район выбран: {district.Name}\n\nСледующий этап — перенос списка квартир и карточек объектов.",
            cancellationToken);
    }

    private async Task AnswerCallbackAsync(UpdateContext context, string? callbackId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(callbackId))
        {
            return;
        }

        try
        {
            await context.Api.Messages.AnswerCallbackQueryAsync(
                callbackId,
                new AnswerCallbackQueryRequest(),
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Не удалось подтвердить MAX callback. CallbackId={CallbackId}",
                callbackId);
        }
    }
}

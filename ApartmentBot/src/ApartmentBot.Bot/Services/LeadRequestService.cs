using System.Text.RegularExpressions;
using ApartmentBot.Application.Services;
using ApartmentBot.Bot.CallbackData;
using ApartmentBot.Bot.Keyboards;
using ApartmentBot.Domain.Interfaces;
using ApartmentBot.Infrastructure.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;

namespace ApartmentBot.Bot.Services;

public interface ILeadRequestService
{
    Task BeginManagerContactAsync(
        ITelegramBotClient botClient,
        long userId,
        string apartmentName,
        string apartmentInfo,
        CancellationToken cancellationToken);

    Task BeginConsultationAsync(
        ITelegramBotClient botClient,
        long userId,
        string apartmentName,
        string apartmentInfo,
        CancellationToken cancellationToken);

    Task HandleContactResponseAsync(
        ITelegramBotClient botClient,
        long userId,
        Message message,
        UserState state,
        CancellationToken cancellationToken);

    Task HandleConsultationNameInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken);

    Task HandleConsultationPhoneInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken);
}

public sealed class LeadRequestService : ILeadRequestService
{
    private static readonly Regex NonDigitRegex = new("[^0-9]", RegexOptions.Compiled);

    private readonly IUserStateService _userStateService;
    private readonly ITelegramMessageService _telegramMessageService;
    private readonly IOptions<TelegramSettings> _telegramSettings;
    private readonly ILogger<LeadRequestService> _logger;

    public LeadRequestService(
        IUserStateService userStateService,
        ITelegramMessageService telegramMessageService,
        IOptions<TelegramSettings> telegramSettings,
        ILogger<LeadRequestService> logger)
    {
        _userStateService = userStateService;
        _telegramMessageService = telegramMessageService;
        _telegramSettings = telegramSettings;
        _logger = logger;
    }

    public async Task BeginManagerContactAsync(
        ITelegramBotClient botClient,
        long userId,
        string apartmentName,
        string apartmentInfo,
        CancellationToken cancellationToken)
    {
        await _telegramMessageService.SendMessageAsync(
            botClient,
            userId,
            "📞 **Связь с менеджером**\n\n" +
            "Вас заинтересовал объект:\n" +
            $"```\n{apartmentInfo}\n```\n\n" +
            "Пожалуйста, поделитесь своим контактом, чтобы менеджер мог связаться с вами.\n\n" +
            "Нажмите кнопку ниже 👇",
            ParseMode.Markdown,
            CreateContactKeyboard("📱 Поделиться контактом"),
            cancellationToken);

        var state = await _userStateService.GetStateAsync(userId, cancellationToken);
        state.CurrentStep = BotStep.ContactManager;
        state.RequestedApartmentName = apartmentName;
        state.ConsultationClientName = null;
        await _userStateService.SetStateAsync(userId, state, cancellationToken);
    }

    public async Task BeginConsultationAsync(
        ITelegramBotClient botClient,
        long userId,
        string apartmentName,
        string apartmentInfo,
        CancellationToken cancellationToken)
    {
        await _telegramMessageService.SendMessageAsync(
            botClient,
            userId,
            "📝 **Заявка на консультацию**\n\n" +
            "Вас заинтересовал объект:\n" +
            $"```\n{apartmentInfo}\n```\n\n" +
            "Пожалуйста, введите ваше **имя**:",
            ParseMode.Markdown,
            KeyboardFactory.CreateCancelKeyboard(),
            cancellationToken);

        var state = await _userStateService.GetStateAsync(userId, cancellationToken);
        state.CurrentStep = BotStep.ConsultationName;
        state.RequestedApartmentName = apartmentName;
        state.ConsultationClientName = null;
        await _userStateService.SetStateAsync(userId, state, cancellationToken);
    }

    public async Task HandleContactResponseAsync(
        ITelegramBotClient botClient,
        long userId,
        Message message,
        UserState state,
        CancellationToken cancellationToken)
    {
        if (message.Contact is null)
        {
            await _telegramMessageService.SendMessageAsync(
                botClient,
                userId,
                "❌ Пожалуйста, поделитесь контактом через кнопку ниже:",
                ParseMode.None,
                CreateContactKeyboard("📱 Поделиться контактом"),
                cancellationToken);
            return;
        }

        if (!TryNormalizePhone(message.Contact.PhoneNumber, out var normalizedPhone))
        {
            await _telegramMessageService.SendMessageAsync(
                botClient,
                userId,
                "❌ Не удалось распознать номер телефона из контакта.\n\n" +
                "Пожалуйста, отправьте контакт ещё раз через кнопку ниже.",
                ParseMode.None,
                CreateContactKeyboard("📱 Поделиться контактом"),
                cancellationToken);
            return;
        }

        var firstName = message.Contact.FirstName;
        var apartmentName = state.RequestedApartmentName ?? "Неизвестно";

        _logger.LogInformation(
            "Заявка на связь: User={UserId}, Name={Name}, Phone={Phone}, Apartment={ApartmentName}",
            userId,
            firstName,
            normalizedPhone,
            apartmentName);

        await NotifyManagerAsync(
            botClient,
            title: "📞 **Новая заявка: связь с менеджером**",
            clientName: firstName,
            phone: normalizedPhone,
            apartmentName: apartmentName,
            clientId: userId,
            clientUsername: message.From?.Username,
            cancellationToken: cancellationToken);

        await SendCompletionMessagesAsync(
            botClient,
            userId,
            "✅ **Спасибо!**\n\n" +
            "Менеджер свяжется с вами в ближайшее время.\n\n" +
            $"📱 Телефон: `{normalizedPhone}`\n" +
            $"👤 Имя: {firstName}\n" +
            $"🏠 Объект: {apartmentName}",
            cancellationToken);

        state.CurrentStep = BotStep.ViewApartments;
        state.PendingInput = null;
        state.RequestedApartmentName = null;
        state.ConsultationClientName = null;
        await _userStateService.SetStateAsync(userId, state, cancellationToken);
    }

    public async Task HandleConsultationNameInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken)
    {
        state.ConsultationClientName = text;
        state.CurrentStep = BotStep.ConsultationPhone;
        await _userStateService.SetStateAsync(userId, state, cancellationToken);

        await _telegramMessageService.SendMessageAsync(
            botClient,
            userId,
            "📝 **Заявка на консультацию**\n\n" +
            $"Спасибо, {text}! Теперь введите ваш **номер телефона**.\n\n" +
            "Можно ввести номер вручную в формате `+79991234567`, `7-999-123-45-67`, `7 999 123 45 67` или нажать кнопку ниже 👇",
            ParseMode.Markdown,
            CreateContactKeyboard("📱 Поделиться телефоном"),
            cancellationToken);
    }

    public async Task HandleConsultationPhoneInputAsync(
        ITelegramBotClient botClient,
        long userId,
        string text,
        UserState state,
        CancellationToken cancellationToken)
    {
        if (!TryNormalizePhone(text, out var normalizedPhone))
        {
            await _telegramMessageService.SendMessageAsync(
                botClient,
                userId,
                "❌ Некорректный номер телефона.\n\n" +
                "Введите номер в формате `+79991234567`, `89991234567`, `7-999-123-45-67` или отправьте контакт кнопкой ниже.",
                ParseMode.Markdown,
                CreateContactKeyboard("📱 Поделиться телефоном"),
                cancellationToken);
            return;
        }

        var apartmentName = state.RequestedApartmentName ?? "Неизвестно";
        var clientName = state.ConsultationClientName ?? "Не указано";

        _logger.LogInformation(
            "Заявка на консультацию: User={UserId}, Name={Name}, Phone={Phone}, Apartment={ApartmentName}",
            userId,
            clientName,
            normalizedPhone,
            apartmentName);

        await NotifyManagerAsync(
            botClient,
            title: "📝 **Новая заявка: консультация**",
            clientName: clientName,
            phone: normalizedPhone,
            apartmentName: apartmentName,
            clientId: userId,
            clientUsername: null,
            cancellationToken: cancellationToken);

        await SendCompletionMessagesAsync(
            botClient,
            userId,
            "✅ Заявка принята.\n\n" +
            "Менеджер свяжется с вами в ближайшее время.\n\n" +
            $"📱 Телефон: {normalizedPhone}\n" +
            $"👤 Имя: {clientName}\n" +
            $"🏠 Объект: {apartmentName}",
            cancellationToken);

        state.CurrentStep = BotStep.ViewApartments;
        state.PendingInput = null;
        state.RequestedApartmentName = null;
        state.ConsultationClientName = null;
        await _userStateService.SetStateAsync(userId, state, cancellationToken);
    }

    private async Task SendCompletionMessagesAsync(
        ITelegramBotClient botClient,
        long userId,
        string successMessage,
        CancellationToken cancellationToken)
    {
        await _telegramMessageService.SendMessageAsync(
            botClient,
            userId,
            successMessage,
            ParseMode.Markdown,
            new ReplyKeyboardRemove(),
            cancellationToken);

        await _telegramMessageService.SendMessageAsync(
            botClient,
            userId,
            "Что хотите сделать дальше?",
            ParseMode.None,
            CreateAfterLeadKeyboard(),
            cancellationToken);
    }

    private async Task NotifyManagerAsync(
        ITelegramBotClient botClient,
        string title,
        string clientName,
        string phone,
        string apartmentName,
        long clientId,
        string? clientUsername,
        CancellationToken cancellationToken)
    {
        var managerChatId = _telegramSettings.Value.ManagerChatId;
        if (!managerChatId.HasValue)
        {
            _logger.LogWarning("ManagerChatId не настроен. Уведомление не отправлено.");
            return;
        }

        var profileLine = BuildProfileLine(clientUsername);

        try
        {
            await _telegramMessageService.SendMessageAsync(
                botClient,
                managerChatId.Value,
                $"{title}\n\n" +
                $"👤 Клиент: {clientName}\n" +
                $"🆔 Telegram ID: `{clientId}`\n" +
                $"📱 Телефон: `{phone}`\n" +
                $"🏠 Объект: {apartmentName}\n" +
                $"🔗 {profileLine}",
                ParseMode.Markdown,
                cancellationToken: cancellationToken);

            _logger.LogInformation("Уведомление менеджеру отправлено в чат {ChatId}", managerChatId.Value);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка отправки уведомления менеджеру в чат {ChatId}", managerChatId.Value);
        }
    }

    private static string BuildProfileLine(string? clientUsername)
    {
        if (string.IsNullOrWhiteSpace(clientUsername))
        {
            return "Профиль клиента: недоступен";
        }

        var escapedUsername = EscapeMarkdown(clientUsername);
        return $"[Открыть профиль клиента](https://t.me/{escapedUsername})";
    }

    private static string EscapeMarkdown(string value)
    {
        return value
            .Replace("_", "\\_")
            .Replace("*", "\\*")
            .Replace("[", "\\[")
            .Replace("`", "\\`");
    }

    private static bool TryNormalizePhone(string? rawPhone, out string normalizedPhone)
    {
        normalizedPhone = string.Empty;

        if (string.IsNullOrWhiteSpace(rawPhone))
        {
            return false;
        }

        var digits = NonDigitRegex.Replace(rawPhone, string.Empty);

        if (digits.Length == 10)
        {
            digits = $"7{digits}";
        }
        else if (digits.Length == 11 && digits.StartsWith("8", StringComparison.Ordinal))
        {
            digits = $"7{digits[1..]}";
        }

        if (digits.Length < 11 || digits.Length > 15)
        {
            return false;
        }

        normalizedPhone = $"+{digits}";
        return true;
    }

    private static ReplyKeyboardMarkup CreateContactKeyboard(string buttonText)
    {
        return new ReplyKeyboardMarkup(new[]
        {
            new[] { KeyboardButton.WithRequestContact(buttonText) }
        })
        {
            ResizeKeyboard = true,
            OneTimeKeyboard = true
        };
    }

    private static InlineKeyboardMarkup CreateAfterLeadKeyboard()
    {
        return new InlineKeyboardMarkup(
        [
            [InlineKeyboardButton.WithCallbackData("🏠 В начало", new NavigationCallbackData { Action = "back_to_start" }.ToCallbackData())]
        ]);
    }
}

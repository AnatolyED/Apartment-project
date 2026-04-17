using System.Text.RegularExpressions;
using ApartmentBot.Application.Services;
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

    Task CancelLeadRequestAsync(
        ITelegramBotClient botClient,
        long userId,
        UserState state,
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
        var leadMessage = await _telegramMessageService.SendMessageAndReturnAsync(
            botClient,
            userId,
            "📞 **Заявка на консультацию**\n\n" +
            "Вас заинтересовал объект:\n" +
            $"```\n{apartmentInfo}\n```\n\n" +
            "Нажмите кнопку `📱 Отправить контакт` ниже, чтобы Telegram отправил ваш номер в чат.\n\n" +
            "Если нужно, номер можно ввести вручную в одном из форматов:\n" +
            "`+79991234567`\n" +
            "`7-999-123-45-67`\n" +
            "`7 999 123 45 67`",
            ParseMode.Markdown,
            KeyboardFactory.CreateLeadContactRequestKeyboard(),
            cancellationToken);

        var state = await _userStateService.GetStateAsync(userId, cancellationToken);
        state.CurrentStep = BotStep.ContactManager;
        state.RequestedApartmentName = apartmentName;
        state.ConsultationClientName = null;
        state.PendingInput = "phone";
        state.LeadRequestMessageId = leadMessage.Id;
        state.LeadContactPromptMessageId = null;
        await _userStateService.SetStateAsync(userId, state, cancellationToken);
    }

    public Task BeginConsultationAsync(
        ITelegramBotClient botClient,
        long userId,
        string apartmentName,
        string apartmentInfo,
        CancellationToken cancellationToken)
    {
        return BeginManagerContactAsync(botClient, userId, apartmentName, apartmentInfo, cancellationToken);
    }

    public async Task CancelLeadRequestAsync(
        ITelegramBotClient botClient,
        long userId,
        UserState state,
        CancellationToken cancellationToken)
    {
        state.CurrentStep = BotStep.ViewApartments;
        state.PendingInput = null;
        state.RequestedApartmentName = null;
        state.ConsultationClientName = null;
        state.LeadRequestMessageId = null;
        state.LeadContactPromptMessageId = null;
        await _userStateService.SetStateAsync(userId, state, cancellationToken);
    }

    public async Task HandleContactResponseAsync(
        ITelegramBotClient botClient,
        long userId,
        Message message,
        UserState state,
        CancellationToken cancellationToken)
    {
        var rawPhone = message.Contact?.PhoneNumber ?? message.Text;
        if (!TryNormalizePhone(rawPhone, out var normalizedPhone))
        {
            await _telegramMessageService.SendMessageAsync(
                botClient,
                userId,
                "❌ Некорректный номер телефона.\n\n" +
                "Нажмите кнопку `📱 Отправить контакт` или введите номер в формате `+79991234567`, `89991234567`, `7-999-123-45-67` или `7 999 123 45 67`.",
                ParseMode.Markdown,
                KeyboardFactory.CreateLeadContactRequestKeyboard(),
                cancellationToken);
            return;
        }

        var clientName = message.Contact?.FirstName
            ?? state.ConsultationClientName
            ?? message.From?.FirstName
            ?? "Клиент";

        await ProcessPhoneSubmissionAsync(
            botClient,
            userId,
            state,
            clientName,
            normalizedPhone,
            message.From?.Username,
            cancellationToken);
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

        var contactPromptMessage = await _telegramMessageService.SendMessageAndReturnAsync(
            botClient,
            userId,
            "📱 **Отправьте ваш контакт**\n\n" +
            "Нажмите кнопку ниже, чтобы Telegram автоматически отправил ваш номер в чат.\n\n" +
            "Если нужно, номер можно ввести и вручную в одном из форматов:\n" +
            "`+79991234567`\n" +
            "`7-999-123-45-67`\n" +
            "`7 999 123 45 67`",
            ParseMode.Markdown,
            KeyboardFactory.CreateLeadContactRequestKeyboard(),
            cancellationToken);

        state.LeadContactPromptMessageId = contactPromptMessage.Id;
        await _userStateService.SetStateAsync(userId, state, cancellationToken);
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
                "Нажмите кнопку `📱 Отправить контакт` или введите номер в формате `+79991234567`, `89991234567`, `7-999-123-45-67` или `7 999 123 45 67`.",
                ParseMode.Markdown,
                KeyboardFactory.CreateLeadContactRequestKeyboard(),
                cancellationToken);
            return;
        }

        await ProcessPhoneSubmissionAsync(
            botClient,
            userId,
            state,
            state.ConsultationClientName ?? "Клиент",
            normalizedPhone,
            null,
            cancellationToken);
    }

    private async Task ProcessPhoneSubmissionAsync(
        ITelegramBotClient botClient,
        long userId,
        UserState state,
        string clientName,
        string normalizedPhone,
        string? clientUsername,
        CancellationToken cancellationToken)
    {
        var apartmentName = state.RequestedApartmentName ?? "Неизвестно";

        _logger.LogInformation(
            "Заявка на консультацию: User={UserId}, Name={Name}, Phone={Phone}, Apartment={ApartmentName}",
            userId,
            clientName,
            normalizedPhone,
            apartmentName);

        await NotifyManagerAsync(
            botClient,
            title: "📞 **Новая заявка: консультация**",
            clientName: clientName,
            phone: normalizedPhone,
            apartmentName: apartmentName,
            clientId: userId,
            clientUsername: clientUsername,
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
        state.LeadRequestMessageId = null;
        state.LeadContactPromptMessageId = null;
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
            KeyboardFactory.CreatePostLeadNavigationKeyboard(),
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
}

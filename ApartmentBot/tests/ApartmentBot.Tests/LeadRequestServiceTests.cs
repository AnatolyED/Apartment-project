using ApartmentBot.Application.Services;
using ApartmentBot.Bot.Services;
using ApartmentBot.Domain.Interfaces;
using ApartmentBot.Infrastructure.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Telegram.Bot;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using Telegram.Bot.Types.ReplyMarkups;

namespace ApartmentBot.Tests;

public sealed class LeadRequestServiceTests
{
    [Fact]
    public async Task BeginConsultationAsync_PreparesDirectContactFlow()
    {
        var userStateService = new Mock<IUserStateService>();
        var telegramMessageService = new Mock<ITelegramMessageService>();
        var state = new UserState();
        ReplyKeyboardMarkup? sentMarkup = null;
        userStateService.Setup(x => x.GetStateAsync(777, It.IsAny<CancellationToken>()))
            .ReturnsAsync(state);
        telegramMessageService
            .Setup(x => x.SendMessageAndReturnAsync(
                It.IsAny<ITelegramBotClient>(),
                It.IsAny<ChatId>(),
                It.IsAny<string>(),
                It.IsAny<ParseMode>(),
                It.IsAny<ReplyMarkup?>(),
                It.IsAny<CancellationToken>()))
            .Callback<ITelegramBotClient, ChatId, string, ParseMode, ReplyMarkup?, CancellationToken>((_, _, _, _, markup, _) =>
            {
                sentMarkup = markup as ReplyKeyboardMarkup;
            })
            .ReturnsAsync(new Message { Id = 101, Date = DateTime.UtcNow });

        var service = CreateService(
            userStateService.Object,
            telegramMessageService.Object,
            managerChatId: null);

        await service.BeginConsultationAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            "РљРІР°СЂС‚РёСЂР° в„–7",
            "РРЅС„РѕСЂРјР°С†РёСЏ РїРѕ РєРІР°СЂС‚РёСЂРµ",
            CancellationToken.None);

        Assert.Equal(BotStep.ContactManager, state.CurrentStep);
        Assert.Equal("РљРІР°СЂС‚РёСЂР° в„–7", state.RequestedApartmentName);
        Assert.Null(state.ConsultationClientName);
        Assert.Equal("phone", state.PendingInput);
        Assert.Equal(101, state.LeadRequestMessageId);
        Assert.Null(state.LeadContactPromptMessageId);
        Assert.NotNull(sentMarkup);
        Assert.Contains(
            sentMarkup!.Keyboard.SelectMany(row => row),
            button => button.RequestContact == true);
        Assert.Contains(
            sentMarkup.Keyboard.SelectMany(row => row),
            button => button.Text == "\u274C \u041E\u0442\u043C\u0435\u043D\u0430");

        telegramMessageService.Verify(
            x => x.SendMessageAndReturnAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 777),
                It.Is<string>(text => text.Contains("Р—Р°СЏРІРєР° РЅР° РєРѕРЅСЃСѓР»СЊС‚Р°С†РёСЋ")),
                ParseMode.Markdown,
                It.Is<ReplyMarkup>(markup => markup is ReplyKeyboardMarkup),
                It.IsAny<CancellationToken>()),
            Times.Once);

        userStateService.Verify(
            x => x.SetStateAsync(777, state, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleConsultationNameInputAsync_SavesNameAndRequestsPhone()
    {
        var userStateService = new Mock<IUserStateService>();
        var telegramMessageService = new Mock<ITelegramMessageService>();
        var state = new UserState
        {
            CurrentStep = BotStep.ConsultationName,
            RequestedApartmentName = "РљРІР°СЂС‚РёСЂР° в„–2"
        };
        ReplyKeyboardMarkup? sentMarkup = null;
        telegramMessageService
            .Setup(x => x.SendMessageAndReturnAsync(
                It.IsAny<ITelegramBotClient>(),
                It.IsAny<ChatId>(),
                It.IsAny<string>(),
                It.IsAny<ParseMode>(),
                It.IsAny<ReplyMarkup?>(),
                It.IsAny<CancellationToken>()))
            .Callback<ITelegramBotClient, ChatId, string, ParseMode, ReplyMarkup?, CancellationToken>((_, _, _, _, markup, _) =>
            {
                sentMarkup = markup as ReplyKeyboardMarkup;
            })
            .ReturnsAsync(new Message { Id = 202, Date = DateTime.UtcNow });

        var service = CreateService(
            userStateService.Object,
            telegramMessageService.Object,
            managerChatId: null);

        await service.HandleConsultationNameInputAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            "РђР»РµРєСЃРµР№",
            state,
            CancellationToken.None);

        Assert.Equal("РђР»РµРєСЃРµР№", state.ConsultationClientName);
        Assert.Equal(BotStep.ConsultationPhone, state.CurrentStep);
        Assert.Equal(202, state.LeadContactPromptMessageId);
        Assert.NotNull(sentMarkup);
        Assert.Contains(
            sentMarkup!.Keyboard.SelectMany(row => row),
            button => button.Text == "рџ“± РћС‚РїСЂР°РІРёС‚СЊ РєРѕРЅС‚Р°РєС‚" && button.RequestContact == true);
        Assert.Contains(
            sentMarkup.Keyboard.SelectMany(row => row),
            button => button.Text == "вќЊ РћС‚РјРµРЅР°");

        userStateService.Verify(
            x => x.SetStateAsync(777, state, It.IsAny<CancellationToken>()),
            Times.Once);

        telegramMessageService.Verify(
            x => x.SendMessageAndReturnAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 777),
                It.Is<string>(text => text.Contains("7-999-123-45-67")),
                ParseMode.Markdown,
                It.Is<ReplyMarkup>(markup => markup is ReplyKeyboardMarkup),
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task CancelLeadRequestAsync_ClearsLeadStateWithoutSendingMessages()
    {
        var userStateService = new Mock<IUserStateService>();
        var telegramMessageService = new Mock<ITelegramMessageService>();
        var state = new UserState
        {
            CurrentStep = BotStep.ContactManager,
            RequestedApartmentName = "РљРІР°СЂС‚РёСЂР° в„–5",
            ConsultationClientName = "РђРЅРЅР°",
            PendingInput = "phone",
            LeadRequestMessageId = 11,
            LeadContactPromptMessageId = 12
        };

        var service = CreateService(
            userStateService.Object,
            telegramMessageService.Object,
            managerChatId: null);

        await service.CancelLeadRequestAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            state,
            CancellationToken.None);

        Assert.Equal(BotStep.ViewApartments, state.CurrentStep);
        Assert.Null(state.RequestedApartmentName);
        Assert.Null(state.ConsultationClientName);
        Assert.Null(state.PendingInput);
        Assert.Null(state.LeadRequestMessageId);
        Assert.Null(state.LeadContactPromptMessageId);
        telegramMessageService.VerifyNoOtherCalls();
        userStateService.Verify(
            x => x.SetStateAsync(777, state, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleConsultationPhoneInputAsync_NormalizesHumanReadablePhone_AndShowsUnavailableProfile()
    {
        var userStateService = new Mock<IUserStateService>();
        var telegramMessageService = new Mock<ITelegramMessageService>();
        var state = new UserState
        {
            CurrentStep = BotStep.ConsultationPhone,
            RequestedApartmentName = "РљРІР°СЂС‚РёСЂР° в„–9",
            ConsultationClientName = "РњР°СЂРёРЅР°",
            PendingInput = "phone"
        };

        var service = CreateService(
            userStateService.Object,
            telegramMessageService.Object,
            managerChatId: 99887766);

        await service.HandleConsultationPhoneInputAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            "7-999-000-33-03",
            state,
            CancellationToken.None);

        Assert.Equal(BotStep.ViewApartments, state.CurrentStep);
        Assert.Null(state.PendingInput);
        Assert.Null(state.RequestedApartmentName);
        Assert.Null(state.ConsultationClientName);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 777),
                It.IsAny<string>(),
                ParseMode.Markdown,
                It.Is<ReplyMarkup>(markup => markup is ReplyKeyboardRemove),
                It.IsAny<CancellationToken>()),
            Times.Once);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 777),
                It.Is<string>(text => text.Contains("Р§С‚Рѕ С…РѕС‚РёС‚Рµ СЃРґРµР»Р°С‚СЊ РґР°Р»СЊС€Рµ?")),
                ParseMode.None,
                It.Is<ReplyMarkup>(markup => markup is InlineKeyboardMarkup),
                It.IsAny<CancellationToken>()),
            Times.Once);

        userStateService.Verify(
            x => x.SetStateAsync(777, state, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleConsultationPhoneInputAsync_WithInvalidPhone_RePromptsUserAndKeepsStep()
    {
        var userStateService = new Mock<IUserStateService>();
        var telegramMessageService = new Mock<ITelegramMessageService>();
        var state = new UserState
        {
            CurrentStep = BotStep.ConsultationPhone,
            RequestedApartmentName = "РљРІР°СЂС‚РёСЂР° в„–9",
            ConsultationClientName = "РњР°СЂРёРЅР°"
        };

        var service = CreateService(
            userStateService.Object,
            telegramMessageService.Object,
            managerChatId: 99887766);

        await service.HandleConsultationPhoneInputAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            "12345",
            state,
            CancellationToken.None);

        Assert.Equal(BotStep.ConsultationPhone, state.CurrentStep);
        Assert.Equal("РљРІР°СЂС‚РёСЂР° в„–9", state.RequestedApartmentName);
        Assert.Equal("РњР°СЂРёРЅР°", state.ConsultationClientName);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 777),
                It.Is<string>(text => text.Contains("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РЅРѕРјРµСЂ С‚РµР»РµС„РѕРЅР°")),
                ParseMode.Markdown,
                It.Is<ReplyMarkup>(markup => markup is ReplyKeyboardMarkup),
                It.IsAny<CancellationToken>()),
            Times.Once);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 99887766),
                It.IsAny<string>(),
                ParseMode.Markdown,
                null,
                It.IsAny<CancellationToken>()),
            Times.Never);

        userStateService.Verify(
            x => x.SetStateAsync(It.IsAny<long>(), It.IsAny<UserState>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task HandleContactResponseAsync_WithoutPhone_RePromptsUser()
    {
        var userStateService = new Mock<IUserStateService>();
        var telegramMessageService = new Mock<ITelegramMessageService>();
        var state = new UserState
        {
            CurrentStep = BotStep.ContactManager,
            RequestedApartmentName = "РљРІР°СЂС‚РёСЂР° в„–1"
        };

        var service = CreateService(
            userStateService.Object,
            telegramMessageService.Object,
            managerChatId: 11223344);

        await service.HandleContactResponseAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            new Message(),
            state,
            CancellationToken.None);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 777),
                It.Is<string>(text => text.Contains("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РЅРѕРјРµСЂ С‚РµР»РµС„РѕРЅР°")),
                ParseMode.Markdown,
                It.Is<ReplyMarkup>(markup => markup is ReplyKeyboardMarkup),
                It.IsAny<CancellationToken>()),
            Times.Once);

        userStateService.Verify(
            x => x.SetStateAsync(It.IsAny<long>(), It.IsAny<UserState>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task HandleContactResponseAsync_WithUsername_SendsProfileLink()
    {
        var userStateService = new Mock<IUserStateService>();
        var telegramMessageService = new Mock<ITelegramMessageService>();
        var state = new UserState
        {
            CurrentStep = BotStep.ContactManager,
            RequestedApartmentName = "РљРІР°СЂС‚РёСЂР° в„–15",
            PendingInput = "contact"
        };

        var service = CreateService(
            userStateService.Object,
            telegramMessageService.Object,
            managerChatId: 44556677);

        await service.HandleContactResponseAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            new Message
            {
                From = new User
                {
                    Id = 777,
                    IsBot = false,
                    FirstName = "РРІР°РЅ",
                    Username = "madina_client"
                },
                Contact = new Contact
                {
                    FirstName = "РРІР°РЅ",
                    PhoneNumber = "+79995554433"
                }
            },
            state,
            CancellationToken.None);

        Assert.Equal(BotStep.ViewApartments, state.CurrentStep);
        Assert.Null(state.PendingInput);
        Assert.Null(state.RequestedApartmentName);
        Assert.Null(state.ConsultationClientName);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 44556677),
                It.Is<string>(text => text.Contains("https://t.me/madina\\_client")),
                ParseMode.Markdown,
                null,
                It.IsAny<CancellationToken>()),
            Times.Once);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 777),
                It.IsAny<string>(),
                ParseMode.Markdown,
                It.Is<ReplyMarkup>(markup => markup is ReplyKeyboardRemove),
                It.IsAny<CancellationToken>()),
            Times.Once);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 777),
                It.Is<string>(text => text.Contains("Р§С‚Рѕ С…РѕС‚РёС‚Рµ СЃРґРµР»Р°С‚СЊ РґР°Р»СЊС€Рµ?")),
                ParseMode.None,
                It.Is<ReplyMarkup>(markup => markup is InlineKeyboardMarkup),
                It.IsAny<CancellationToken>()),
            Times.Once);

        userStateService.Verify(
            x => x.SetStateAsync(777, state, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleContactResponseAsync_WithInvalidPhoneInContact_RePromptsUser()
    {
        var userStateService = new Mock<IUserStateService>();
        var telegramMessageService = new Mock<ITelegramMessageService>();
        var state = new UserState
        {
            CurrentStep = BotStep.ContactManager,
            RequestedApartmentName = "РљРІР°СЂС‚РёСЂР° в„–15"
        };

        var service = CreateService(
            userStateService.Object,
            telegramMessageService.Object,
            managerChatId: 44556677);

        await service.HandleContactResponseAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            new Message
            {
                Contact = new Contact
                {
                    FirstName = "РРІР°РЅ",
                    PhoneNumber = "12"
                }
            },
            state,
            CancellationToken.None);

        Assert.Equal(BotStep.ContactManager, state.CurrentStep);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 777),
                It.Is<string>(text => text.Contains("РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ РЅРѕРјРµСЂ С‚РµР»РµС„РѕРЅР°")),
                ParseMode.Markdown,
                It.Is<ReplyMarkup>(markup => markup is ReplyKeyboardMarkup),
                It.IsAny<CancellationToken>()),
            Times.Once);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 44556677),
                It.IsAny<string>(),
                ParseMode.Markdown,
                null,
                It.IsAny<CancellationToken>()),
            Times.Never);

        userStateService.Verify(
            x => x.SetStateAsync(It.IsAny<long>(), It.IsAny<UserState>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    private static LeadRequestService CreateService(
        IUserStateService userStateService,
        ITelegramMessageService telegramMessageService,
        long? managerChatId)
    {
        return new LeadRequestService(
            userStateService,
            telegramMessageService,
            Options.Create(new TelegramSettings
            {
                BotToken = "123:token",
                ManagerChatId = managerChatId
            }),
            NullLogger<LeadRequestService>.Instance);
    }
}

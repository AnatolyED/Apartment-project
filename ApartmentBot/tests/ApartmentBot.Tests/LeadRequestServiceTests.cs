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
    public async Task BeginConsultationAsync_SetsConsultationStepAndPromptsUser()
    {
        var userStateService = new Mock<IUserStateService>();
        var telegramMessageService = new Mock<ITelegramMessageService>();
        var state = new UserState();
        userStateService.Setup(x => x.GetStateAsync(777, It.IsAny<CancellationToken>()))
            .ReturnsAsync(state);

        var service = CreateService(
            userStateService.Object,
            telegramMessageService.Object,
            managerChatId: null);

        await service.BeginConsultationAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            "Квартира №7",
            "Информация по квартире",
            CancellationToken.None);

        Assert.Equal(BotStep.ConsultationName, state.CurrentStep);
        Assert.Equal("Квартира №7", state.RequestedApartmentName);
        Assert.Null(state.ConsultationClientName);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 777),
                It.IsAny<string>(),
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
            RequestedApartmentName = "Квартира №2"
        };

        var service = CreateService(
            userStateService.Object,
            telegramMessageService.Object,
            managerChatId: null);

        await service.HandleConsultationNameInputAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            "Алексей",
            state,
            CancellationToken.None);

        Assert.Equal("Алексей", state.ConsultationClientName);
        Assert.Equal(BotStep.ConsultationPhone, state.CurrentStep);

        userStateService.Verify(
            x => x.SetStateAsync(777, state, It.IsAny<CancellationToken>()),
            Times.Once);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 777),
                It.Is<string>(text => text.Contains("7-999-123-45-67")),
                ParseMode.Markdown,
                It.Is<ReplyMarkup>(markup => markup is ReplyKeyboardMarkup),
                It.IsAny<CancellationToken>()),
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
            RequestedApartmentName = "Квартира №9",
            ConsultationClientName = "Марина",
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
                It.Is<ChatId>(chatId => chatId.Identifier == 99887766),
                It.Is<string>(text => text.Contains("`+79990003303`") && text.Contains("Профиль клиента: недоступен")),
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
                It.Is<string>(text => text.Contains("Что хотите сделать дальше?")),
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
            RequestedApartmentName = "Квартира №9",
            ConsultationClientName = "Марина"
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
        Assert.Equal("Квартира №9", state.RequestedApartmentName);
        Assert.Equal("Марина", state.ConsultationClientName);

        telegramMessageService.Verify(
            x => x.SendMessageAsync(
                It.IsAny<ITelegramBotClient>(),
                It.Is<ChatId>(chatId => chatId.Identifier == 777),
                It.Is<string>(text => text.Contains("Некорректный номер телефона")),
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
    public async Task HandleContactResponseAsync_WithoutContact_RePromptsUser()
    {
        var userStateService = new Mock<IUserStateService>();
        var telegramMessageService = new Mock<ITelegramMessageService>();
        var state = new UserState
        {
            CurrentStep = BotStep.ContactManager,
            RequestedApartmentName = "Квартира №1"
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
                It.IsAny<string>(),
                ParseMode.None,
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
            RequestedApartmentName = "Квартира №15",
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
                    FirstName = "Иван",
                    Username = "madina_client"
                },
                Contact = new Contact
                {
                    FirstName = "Иван",
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
                It.Is<string>(text => text.Contains("Что хотите сделать дальше?")),
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
            RequestedApartmentName = "Квартира №15"
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
                    FirstName = "Иван",
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
                It.Is<string>(text => text.Contains("Не удалось распознать номер телефона")),
                ParseMode.None,
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

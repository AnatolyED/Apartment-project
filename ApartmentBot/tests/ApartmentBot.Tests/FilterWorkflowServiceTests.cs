using ApartmentBot.Application.Services;
using ApartmentBot.Bot.Services;
using ApartmentBot.Domain.Entities;
using ApartmentBot.Domain.Interfaces;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Telegram.Bot;
using Telegram.Bot.Requests.Abstractions;
using Telegram.Bot.Types;
using Telegram.Bot.Types.ReplyMarkups;

namespace ApartmentBot.Tests;

public sealed class FilterWorkflowServiceTests
{
    [Fact]
    public async Task HandleFilterCallbackAsync_Menu_EditsExistingMessage()
    {
        IRequest<Message>? capturedRequest = null;
        var botClient = CreateBotClientMock(request => capturedRequest = request);
        var service = CreateService(Mock.Of<IUserStateService>());

        await service.HandleFilterCallbackAsync(
            botClient.Object,
            777,
            "filter:menu",
            new UserState(),
            51,
            () => Task.CompletedTask,
            () => new InlineKeyboardMarkup(new List<List<InlineKeyboardButton>>()),
            CancellationToken.None);

        Assert.NotNull(capturedRequest);
        Assert.Equal("EditMessageTextRequest", capturedRequest!.GetType().Name);
        Assert.Contains("Выберите фильтр", GetStringProperty(capturedRequest, "Text"));
    }

    [Fact]
    public async Task HandleFilterCallbackAsync_ResetClearsFiltersAndShowsApartmentList()
    {
        var userStateService = new Mock<IUserStateService>();
        var service = CreateService(userStateService.Object);
        var state = new UserState
        {
            SelectedDistrictId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
            CurrentPage = 4,
            CurrentFilters = new ApartmentFilters
            {
                Finishing = FinishingType.БезОтделки,
                Rooms = "3",
                PriceMin = 10000000m,
                PriceMax = 15000000m,
                AreaMin = 45m,
                AreaMax = 80m,
                Sort = "price_asc"
            }
        };

        var showApartmentListCalled = false;

        await service.HandleFilterCallbackAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            "filter:reset",
            state,
            0,
            () =>
            {
                showApartmentListCalled = true;
                return Task.CompletedTask;
            },
            () => new InlineKeyboardMarkup(new List<List<InlineKeyboardButton>>()),
            CancellationToken.None);

        Assert.True(showApartmentListCalled);
        Assert.Equal(1, state.CurrentPage);
        Assert.False(state.CurrentFilters.HasActiveFilters);
        Assert.Null(state.CurrentFilters.Finishing);
        Assert.Null(state.CurrentFilters.Rooms);
        Assert.Null(state.CurrentFilters.PriceMin);
        Assert.Null(state.CurrentFilters.PriceMax);
        Assert.Null(state.CurrentFilters.AreaMin);
        Assert.Null(state.CurrentFilters.AreaMax);
        Assert.Equal("created_desc", state.CurrentFilters.Sort);
        userStateService.Verify(
            x => x.SetStateAsync(777, state, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public void ApartmentFilters_HasActiveFiltersBecomesTrueWhenAnyFilterIsSet()
    {
        var filters = new ApartmentFilters
        {
            Rooms = "2"
        };

        Assert.True(filters.HasActiveFilters);
    }

    [Fact]
    public void ApartmentFilters_ResetClearsAllFilterValues()
    {
        var filters = new ApartmentFilters
        {
            Finishing = FinishingType.Чистовая,
            Rooms = "2",
            PriceMin = 9000000m,
            PriceMax = 12000000m,
            AreaMin = 40m,
            AreaMax = 60m,
            Sort = "price_desc"
        };

        filters.Reset();

        Assert.False(filters.HasActiveFilters);
        Assert.Null(filters.Finishing);
        Assert.Null(filters.Rooms);
        Assert.Null(filters.PriceMin);
        Assert.Null(filters.PriceMax);
        Assert.Null(filters.AreaMin);
        Assert.Null(filters.AreaMax);
        Assert.Equal("created_desc", filters.Sort);
    }

    [Fact]
    public async Task HandleAreaMinInputAsync_WithComma_ParsesDecimalValue()
    {
        var userStateService = new Mock<IUserStateService>();
        var service = CreateService(userStateService.Object);
        var state = new UserState
        {
            CurrentStep = BotStep.FilterAreaMin,
            CurrentFilters = new ApartmentFilters()
        };

        await service.HandleAreaMinInputAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            "57,9",
            state,
            CancellationToken.None);

        Assert.Equal(57.9m, state.CurrentFilters.AreaMin);
        Assert.Equal(BotStep.FilterAreaMax, state.CurrentStep);
        userStateService.Verify(
            x => x.SetStateAsync(777, state, It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleAreaMinInputAsync_WithInvalidCommaSeparatedValue_RePromptsUser()
    {
        IRequest<Message>? capturedRequest = null;
        var userStateService = new Mock<IUserStateService>();
        var botClient = CreateBotClientMock(request => capturedRequest = request);
        var service = CreateService(userStateService.Object);
        var state = new UserState
        {
            CurrentStep = BotStep.FilterAreaMin,
            CurrentFilters = new ApartmentFilters()
        };

        await service.HandleAreaMinInputAsync(
            botClient.Object,
            777,
            "57,9,1",
            state,
            CancellationToken.None);

        Assert.Null(state.CurrentFilters.AreaMin);
        Assert.Equal(BotStep.FilterAreaMin, state.CurrentStep);
        Assert.NotNull(capturedRequest);
        Assert.Contains("Некорректное значение", GetStringProperty(capturedRequest!, "Text"));
        userStateService.Verify(
            x => x.SetStateAsync(It.IsAny<long>(), It.IsAny<UserState>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    private static FilterWorkflowService CreateService(IUserStateService userStateService)
    {
        return new FilterWorkflowService(
            userStateService,
            new TelegramRetryService(NullLogger<TelegramRetryService>.Instance),
            NullLogger<FilterWorkflowService>.Instance);
    }

    private static Mock<ITelegramBotClient> CreateBotClientMock(Action<IRequest<Message>> onRequest)
    {
        var botClient = new Mock<ITelegramBotClient>();
        botClient.Setup(x => x.SendRequest(
                It.IsAny<IRequest<Message>>(),
                It.IsAny<CancellationToken>()))
            .Callback<IRequest<Message>, CancellationToken>((request, _) => onRequest(request))
            .ReturnsAsync(new Message { Id = 1, Date = DateTime.UtcNow });

        return botClient;
    }

    private static string GetStringProperty(object target, string propertyName)
    {
        return (string)(target.GetType().GetProperty(propertyName)?.GetValue(target)
            ?? throw new InvalidOperationException($"Property {propertyName} not found."));
    }
}

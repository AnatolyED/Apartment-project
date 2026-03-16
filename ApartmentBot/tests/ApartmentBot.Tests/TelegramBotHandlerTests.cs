using ApartmentBot.Application.Services;
using ApartmentBot.Bot.Handlers;
using ApartmentBot.Bot.Services;
using ApartmentBot.Domain.Interfaces;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Telegram.Bot;
using Telegram.Bot.Requests.Abstractions;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;

namespace ApartmentBot.Tests;

public sealed class TelegramBotHandlerTests
{
    [Fact]
    public async Task HandleUpdateAsync_StartMessage_ResetsStateAndSendsWelcome()
    {
        var state = new UserState
        {
            CurrentStep = BotStep.ViewApartments,
            SelectedCityId = Guid.Parse("11111111-1111-1111-1111-111111111111"),
            SelectedCityName = "Владивосток",
            SelectedDistrictId = Guid.Parse("22222222-2222-2222-2222-222222222222"),
            SelectedDistrictName = "Патрокл",
            SelectedDistrictPhotoUrl = "/uploads/test.jpg",
            SelectedApartmentId = Guid.Parse("33333333-3333-3333-3333-333333333333"),
            SelectedApartmentSummary = "summary",
            RequestedApartmentName = "Квартира №1",
            CurrentFilters = new ApartmentFilters
            {
                Rooms = "3",
                PriceMin = 10_000_000m
            }
        };

        var userStateService = new Mock<IUserStateService>();
        userStateService.Setup(x => x.GetStateAsync(777, It.IsAny<CancellationToken>()))
            .ReturnsAsync(state);

        IRequest<Message>? capturedRequest = null;
        var botClient = CreateBotClientMock(messageRequest: request => capturedRequest = request);

        var handler = CreateHandler(
            userStateService: userStateService.Object);

        await handler.HandleUpdateAsync(
            botClient.Object,
            new Update
            {
                Message = new Message
                {
                    Text = "/start",
                    From = new User { Id = 777, FirstName = "Test", IsBot = false },
                    Date = DateTime.UtcNow
                }
            },
            CancellationToken.None);

        Assert.NotNull(capturedRequest);
        Assert.Contains("Добро пожаловать", GetStringProperty(capturedRequest!, "Text"));
        Assert.Equal(BotStep.Start, state.CurrentStep);
        Assert.Null(state.SelectedCityId);
        Assert.Null(state.SelectedDistrictId);
        Assert.Null(state.SelectedApartmentId);
        Assert.Null(state.SelectedApartmentSummary);
        Assert.Null(state.RequestedApartmentName);
        Assert.False(state.CurrentFilters.HasActiveFilters);

        userStateService.Verify(
            x => x.SetStateAsync(777, state, It.IsAny<CancellationToken>()),
            Times.AtLeastOnce);
    }

    [Fact]
    public async Task HandleUpdateAsync_StartCityCallbackWithoutCities_AnswersCallback()
    {
        var userStateService = new Mock<IUserStateService>();
        userStateService.Setup(x => x.GetStateAsync(777, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new UserState());

        var cityService = new Mock<ICityService>();
        cityService.Setup(x => x.GetAllCitiesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);

        IRequest<bool>? capturedBoolRequest = null;
        var botClient = CreateBotClientMock(boolRequest: request => capturedBoolRequest = request);

        var handler = CreateHandler(
            cityService: cityService.Object,
            userStateService: userStateService.Object);

        await handler.HandleUpdateAsync(
            botClient.Object,
            new Update
            {
                CallbackQuery = new CallbackQuery
                {
                    Id = "cb-1",
                    Data = "start_city",
                    From = new User { Id = 777, FirstName = "Test", IsBot = false },
                    Message = new Message
                    {
                        Date = DateTime.UtcNow
                    }
                }
            },
            CancellationToken.None);

        Assert.NotNull(capturedBoolRequest);
        Assert.Equal("AnswerCallbackQueryRequest", capturedBoolRequest!.GetType().Name);
        Assert.Contains("Города пока не добавлены", GetStringProperty(capturedBoolRequest, "Text"));
    }

    [Fact]
    public async Task HandleUpdateAsync_ApartmentCallback_DelegatesToNavigationService()
    {
        var userStateService = new Mock<IUserStateService>();
        userStateService.Setup(x => x.GetStateAsync(777, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new UserState());

        var apartmentNavigationService = new Mock<IApartmentNavigationService>();
        apartmentNavigationService
            .Setup(x => x.HandleApartmentSelectionAsync(
                It.IsAny<ITelegramBotClient>(),
                777,
                It.IsAny<string>(),
                It.IsAny<UserState>(),
                It.IsAny<Func<ApartmentBot.Application.DTOs.ApartmentDto, Task>>(),
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        IRequest<bool>? capturedBoolRequest = null;
        var botClient = CreateBotClientMock(boolRequest: request => capturedBoolRequest = request);
        var apartmentId = Guid.Parse("031cd3a3-01d6-45f8-b33c-453b7b0e36f1");

        var handler = CreateHandler(
            userStateService: userStateService.Object,
            apartmentNavigationService: apartmentNavigationService.Object);

        await handler.HandleUpdateAsync(
            botClient.Object,
            new Update
            {
                CallbackQuery = new CallbackQuery
                {
                    Id = "cb-2",
                    Data = $"apt:{apartmentId}",
                    From = new User { Id = 777, FirstName = "Test", IsBot = false },
                    Message = new Message
                    {
                        Date = DateTime.UtcNow
                    }
                }
            },
            CancellationToken.None);

        apartmentNavigationService.Verify(
            x => x.HandleApartmentSelectionAsync(
                botClient.Object,
                777,
                $"apt:{apartmentId}",
                It.IsAny<UserState>(),
                It.IsAny<Func<ApartmentBot.Application.DTOs.ApartmentDto, Task>>(),
                It.IsAny<CancellationToken>()),
            Times.Once);

        Assert.NotNull(capturedBoolRequest);
        Assert.Equal("AnswerCallbackQueryRequest", capturedBoolRequest!.GetType().Name);
    }

    [Fact]
    public async Task HandleUpdateAsync_CityCallback_WhenAnswerCallbackFails_StillShowsDistricts()
    {
        var cityId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        var state = new UserState();

        var userStateService = new Mock<IUserStateService>();
        userStateService.Setup(x => x.GetStateAsync(777, It.IsAny<CancellationToken>()))
            .ReturnsAsync(state);
        userStateService.Setup(x => x.SetStateAsync(777, It.IsAny<UserState>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var cityService = new Mock<ICityService>();
        cityService.Setup(x => x.GetCityByIdAsync(cityId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ApartmentBot.Application.DTOs.CityDto(
                cityId,
                "Москва",
                null,
                true,
                DateTime.UtcNow,
                DateTime.UtcNow));

        var districtService = new Mock<IDistrictService>();
        districtService.Setup(x => x.GetDistrictsByCityIdAsync(cityId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(
            [
                new ApartmentBot.Application.DTOs.DistrictDto(
                    Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                    cityId,
                    "Центральный",
                    null,
                    [],
                    true,
                    DateTime.UtcNow,
                    DateTime.UtcNow)
            ]);

        var presentationService = new Mock<IApartmentPresentationService>();
        presentationService.Setup(x => x.ShowDistrictListAsync(
                It.IsAny<ITelegramBotClient>(),
                777,
                It.IsAny<ApartmentBot.Application.DTOs.CityDto?>(),
                It.IsAny<IReadOnlyList<ApartmentBot.Application.DTOs.DistrictDto>>(),
                15,
                It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var botClient = new Mock<ITelegramBotClient>();
        botClient.Setup(x => x.SendRequest(
                It.IsAny<IRequest<bool>>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("telegram callback timeout"));
        botClient.Setup(x => x.SendRequest(
                It.IsAny<IRequest<Message>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new Message { Id = 1, Date = DateTime.UtcNow });

        var handler = CreateHandler(
            cityService: cityService.Object,
            districtService: districtService.Object,
            userStateService: userStateService.Object,
            apartmentPresentationService: presentationService.Object);

        await handler.HandleUpdateAsync(
            botClient.Object,
            new Update
            {
                CallbackQuery = new CallbackQuery
                {
                    Id = "cb-city-timeout",
                    Data = $"city:{cityId}",
                    From = new User { Id = 777, FirstName = "Test", IsBot = false },
                    Message = new Message
                    {
                        Id = 15,
                        Date = DateTime.UtcNow
                    }
                }
            },
            CancellationToken.None);

        presentationService.Verify(
            x => x.ShowDistrictListAsync(
                botClient.Object,
                777,
                It.Is<ApartmentBot.Application.DTOs.CityDto?>(c => c != null && c.Id == cityId),
                It.Is<IReadOnlyList<ApartmentBot.Application.DTOs.DistrictDto>>(d => d.Count == 1),
                15,
                It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task HandleUpdateAsync_WhenUpdateIsDuplicate_DoesNothing()
    {
        IRequest<Message>? capturedMessageRequest = null;
        var botClient = CreateBotClientMock(messageRequest: request => capturedMessageRequest = request);

        var dedupeService = new Mock<ITelegramUpdateDeduplicationService>();
        dedupeService.Setup(x => x.IsDuplicateAsync(It.IsAny<Update>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var handler = CreateHandler(deduplicationService: dedupeService.Object);

        await handler.HandleUpdateAsync(
            botClient.Object,
            new Update
            {
                Id = 12345,
                Message = new Message
                {
                    Text = "/start",
                    From = new User { Id = 777, FirstName = "Test", IsBot = false },
                    Date = DateTime.UtcNow
                }
            },
            CancellationToken.None);

        Assert.Null(capturedMessageRequest);
        dedupeService.Verify(x => x.IsDuplicateAsync(It.IsAny<Update>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task HandleUpdateAsync_WhenRecoveryMessageFails_DoesNotRethrow()
    {
        var userStateService = new Mock<IUserStateService>();
        userStateService.Setup(x => x.GetStateAsync(777, It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("state failure"));

        var botClient = new Mock<ITelegramBotClient>();
        botClient.Setup(x => x.SendRequest(
                It.IsAny<IRequest<Message>>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new HttpRequestException("telegram send failure"));

        var handler = CreateHandler(userStateService: userStateService.Object);

        var exception = await Record.ExceptionAsync(() => handler.HandleUpdateAsync(
            botClient.Object,
            new Update
            {
                Message = new Message
                {
                    Text = "/start",
                    From = new User { Id = 777, FirstName = "Test", IsBot = false },
                    Date = DateTime.UtcNow
                }
            },
            CancellationToken.None));

        Assert.Null(exception);
    }

    private static TelegramBotHandler CreateHandler(
        ICityService? cityService = null,
        IDistrictService? districtService = null,
        IUserStateService? userStateService = null,
        ILeadRequestService? leadRequestService = null,
        IFilterWorkflowService? filterWorkflowService = null,
        IApartmentNavigationService? apartmentNavigationService = null,
        IApartmentPresentationService? apartmentPresentationService = null,
        ITelegramUpdateDeduplicationService? deduplicationService = null)
    {
        return new TelegramBotHandler(
            cityService ?? Mock.Of<ICityService>(),
            districtService ?? Mock.Of<IDistrictService>(),
            userStateService ?? Mock.Of<IUserStateService>(),
            leadRequestService ?? Mock.Of<ILeadRequestService>(),
            filterWorkflowService ?? Mock.Of<IFilterWorkflowService>(),
            apartmentNavigationService ?? Mock.Of<IApartmentNavigationService>(),
            apartmentPresentationService ?? Mock.Of<IApartmentPresentationService>(),
            new TelegramRetryService(NullLogger<TelegramRetryService>.Instance),
            deduplicationService ?? Mock.Of<ITelegramUpdateDeduplicationService>(),
            NullLogger<TelegramBotHandler>.Instance);
    }

    private static Mock<ITelegramBotClient> CreateBotClientMock(
        Action<IRequest<Message>>? messageRequest = null,
        Action<IRequest<bool>>? boolRequest = null)
    {
        var botClient = new Mock<ITelegramBotClient>();
        botClient.Setup(x => x.SendRequest(
                It.IsAny<IRequest<Message>>(),
                It.IsAny<CancellationToken>()))
            .Callback<IRequest<Message>, CancellationToken>((request, _) => messageRequest?.Invoke(request))
            .ReturnsAsync(new Message { Id = 1, Date = DateTime.UtcNow });

        botClient.Setup(x => x.SendRequest(
                It.IsAny<IRequest<bool>>(),
                It.IsAny<CancellationToken>()))
            .Callback<IRequest<bool>, CancellationToken>((request, _) => boolRequest?.Invoke(request))
            .ReturnsAsync(true);

        return botClient;
    }

    private static string GetStringProperty(object target, string propertyName)
    {
        return (string)(target.GetType().GetProperty(propertyName)?.GetValue(target)
            ?? throw new InvalidOperationException($"Property {propertyName} not found."));
    }
}

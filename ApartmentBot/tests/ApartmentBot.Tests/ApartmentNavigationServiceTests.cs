using ApartmentBot.Application.DTOs;
using ApartmentBot.Application.Services;
using ApartmentBot.Bot.CallbackData;
using ApartmentBot.Bot.Services;
using ApartmentBot.Domain.Interfaces;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Telegram.Bot;
using Telegram.Bot.Requests.Abstractions;
using Telegram.Bot.Types;
using Telegram.Bot.Types.ReplyMarkups;

namespace ApartmentBot.Tests;

public sealed class ApartmentNavigationServiceTests
{
    [Fact]
    public async Task HandleApartmentSelectionAsync_UpdatesStateAndShowsApartment()
    {
        var apartmentId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var apartment = CreateApartmentDto(apartmentId, "Квартира №11");
        var state = new UserState();

        var userStateService = new Mock<IUserStateService>();
        var apartmentService = new Mock<IApartmentService>();
        var formatter = new Mock<IApartmentMessageFormatter>();
        formatter.Setup(x => x.FormatApartmentMessage(apartment)).Returns("formatted apartment");
        apartmentService.Setup(x => x.GetApartmentByIdAsync(apartmentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(apartment);

        var service = CreateService(
            userStateService.Object,
            apartmentService.Object,
            Mock.Of<ICityService>(),
            Mock.Of<IDistrictService>(),
            formatter.Object);

        ApartmentDto? shownApartment = null;

        await service.HandleApartmentSelectionAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            new ApartmentCallbackData { ApartmentId = apartmentId }.ToCallbackData(),
            state,
            dto =>
            {
                shownApartment = dto;
                return Task.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(apartmentId, state.SelectedApartmentId);
        Assert.Equal("Квартира №11", state.RequestedApartmentName);
        Assert.Equal("formatted apartment", state.SelectedApartmentSummary);
        Assert.Equal(apartment, shownApartment);
        userStateService.Verify(x => x.SetStateAsync(777, state, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task HandleApartmentActionAsync_UsesCachedApartmentDataWithoutRefetch()
    {
        var userStateService = new Mock<IUserStateService>();
        var apartmentService = new Mock<IApartmentService>(MockBehavior.Strict);
        var service = CreateService(
            userStateService.Object,
            apartmentService.Object,
            Mock.Of<ICityService>(),
            Mock.Of<IDistrictService>(),
            Mock.Of<IApartmentMessageFormatter>());

        var state = new UserState
        {
            RequestedApartmentName = "Квартира №5",
            SelectedApartmentSummary = "cached summary"
        };

        string? handledName = null;
        string? handledSummary = null;

        await service.HandleApartmentActionAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            state,
            (name, summary) =>
            {
                handledName = name;
                handledSummary = summary;
                return Task.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal("Квартира №5", handledName);
        Assert.Equal("cached summary", handledSummary);
        apartmentService.Verify(x => x.GetApartmentByIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
        userStateService.Verify(x => x.SetStateAsync(It.IsAny<long>(), It.IsAny<UserState>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task HandleSelectedApartmentAsync_LoadsApartmentAndInvokesHandler()
    {
        var apartmentId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var apartment = CreateApartmentDto(apartmentId, "Квартира №8");
        var apartmentService = new Mock<IApartmentService>();
        apartmentService.Setup(x => x.GetApartmentByIdAsync(apartmentId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(apartment);

        var service = CreateService(
            Mock.Of<IUserStateService>(),
            apartmentService.Object,
            Mock.Of<ICityService>(),
            Mock.Of<IDistrictService>(),
            Mock.Of<IApartmentMessageFormatter>());

        ApartmentDto? handledApartment = null;

        await service.HandleSelectedApartmentAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            new UserState { SelectedApartmentId = apartmentId },
            dto =>
            {
                handledApartment = dto;
                return Task.CompletedTask;
            },
            CancellationToken.None);

        Assert.Equal(apartment, handledApartment);
    }

    [Fact]
    public async Task HandleNavigationCallbackAsync_BackToApartments_ClearsSelectedApartmentAndShowsList()
    {
        var userStateService = new Mock<IUserStateService>();
        var service = CreateService(
            userStateService.Object,
            Mock.Of<IApartmentService>(),
            Mock.Of<ICityService>(),
            Mock.Of<IDistrictService>(),
            Mock.Of<IApartmentMessageFormatter>());

        var state = new UserState
        {
            SelectedDistrictId = Guid.Parse("22222222-2222-2222-2222-222222222222"),
            SelectedApartmentId = Guid.Parse("33333333-3333-3333-3333-333333333333"),
            RequestedApartmentName = "Квартира №3",
            SelectedApartmentSummary = "summary"
        };

        var showListCalled = false;

        await service.HandleNavigationCallbackAsync(
            Mock.Of<ITelegramBotClient>(),
            777,
            "nav:back_to_apartments",
            state,
            0,
            () =>
            {
                showListCalled = true;
                return Task.CompletedTask;
            },
            () => new InlineKeyboardMarkup(new List<List<InlineKeyboardButton>>()),
            CancellationToken.None);

        Assert.True(showListCalled);
        Assert.Null(state.SelectedApartmentId);
        Assert.Null(state.RequestedApartmentName);
        Assert.Null(state.SelectedApartmentSummary);
        userStateService.Verify(x => x.SetStateAsync(777, state, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task HandleNavigationCallbackAsync_BackToDistricts_EditsCurrentMessage()
    {
        IRequest<Message>? capturedRequest = null;
        var botClient = new Mock<ITelegramBotClient>();
        botClient.Setup(x => x.SendRequest(
                It.IsAny<IRequest<Message>>(),
                It.IsAny<CancellationToken>()))
            .Callback<IRequest<Message>, CancellationToken>((request, _) => capturedRequest = request)
            .ReturnsAsync(new Message { Id = 1, Date = DateTime.UtcNow });

        var districtService = new Mock<IDistrictService>();
        districtService.Setup(x => x.GetDistrictsByCityIdAsync(
                Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(
            [
                new DistrictDto(
                    Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                    Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                    "Патрокл",
                    null,
                    [],
                    true,
                    DateTime.UtcNow,
                    DateTime.UtcNow)
            ]);

        var userStateService = new Mock<IUserStateService>();
        var service = CreateService(
            userStateService.Object,
            Mock.Of<IApartmentService>(),
            Mock.Of<ICityService>(),
            districtService.Object,
            Mock.Of<IApartmentMessageFormatter>());

        var state = new UserState
        {
            SelectedCityId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            DistrictPhotoShownForDistrictId = Guid.Parse("cccccccc-cccc-cccc-cccc-cccccccccccc"),
            DistrictPhotoShownForPhotoUrl = "/uploads/test.jpg",
            ApartmentPhotoShownForApartmentId = Guid.Parse("dddddddd-dddd-dddd-dddd-dddddddddddd"),
            ApartmentPhotoShownForPhotoUrl = "/uploads/apartment.jpg"
        };

        await service.HandleNavigationCallbackAsync(
            botClient.Object,
            777,
            "nav:back_to_districts",
            state,
            55,
            () => Task.CompletedTask,
            () => new InlineKeyboardMarkup(new List<List<InlineKeyboardButton>>()),
            CancellationToken.None);

        Assert.NotNull(capturedRequest);
        Assert.Equal("EditMessageTextRequest", capturedRequest!.GetType().Name);
        Assert.Contains("Выберите район", GetStringProperty(capturedRequest, "Text"));
        Assert.Null(state.DistrictPhotoShownForDistrictId);
        Assert.Null(state.DistrictPhotoShownForPhotoUrl);
        Assert.Null(state.ApartmentPhotoShownForApartmentId);
        Assert.Null(state.ApartmentPhotoShownForPhotoUrl);
    }

    private static ApartmentNavigationService CreateService(
        IUserStateService userStateService,
        IApartmentService apartmentService,
        ICityService cityService,
        IDistrictService districtService,
        IApartmentMessageFormatter apartmentMessageFormatter)
    {
        return new ApartmentNavigationService(
            userStateService,
            apartmentService,
            cityService,
            districtService,
            apartmentMessageFormatter,
            new TelegramRetryService(NullLogger<TelegramRetryService>.Instance),
            NullLogger<ApartmentNavigationService>.Instance);
    }

    private static ApartmentDto CreateApartmentDto(Guid id, string name)
    {
        return new ApartmentDto(
            id,
            Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            name,
            "Чистовая",
            "2",
            64.5m,
            8,
            14_500_000m,
            ["/uploads/apartments/test/photo.jpg"],
            true,
            DateTime.UtcNow,
            DateTime.UtcNow);
    }

    private static string GetStringProperty(object target, string propertyName)
    {
        return (string)(target.GetType().GetProperty(propertyName)?.GetValue(target)
            ?? throw new InvalidOperationException($"Property {propertyName} not found."));
    }
}

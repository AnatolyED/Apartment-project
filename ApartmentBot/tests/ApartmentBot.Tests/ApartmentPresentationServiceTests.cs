using ApartmentBot.Application.DTOs;
using ApartmentBot.Application.Services;
using ApartmentBot.Bot.Services;
using ApartmentBot.Domain.Interfaces;
using ApartmentBot.Infrastructure.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Telegram.Bot;
using Telegram.Bot.Requests.Abstractions;
using Telegram.Bot.Types;
using Telegram.Bot.Types.ReplyMarkups;

namespace ApartmentBot.Tests;

public sealed class ApartmentPresentationServiceTests
{
    [Fact]
    public void FormatApartmentMessage_IncludesFormattedPriceAndArea()
    {
        var formatter = new ApartmentMessageFormatter();
        var apartment = CreateApartment(
            name: "Квартира №2",
            area: 89.0m,
            price: 25_000_000m,
            photos: []);

        var message = formatter.FormatApartmentMessage(apartment);

        Assert.Contains("Квартира №2", message);
        Assert.Contains("Цена:", message);
        Assert.Contains("25000000", NormalizeNumberFormatting(message));
        Assert.Contains("₽", message);
        Assert.Contains("Площадь:", message);
        Assert.Contains("89 м²", message);
    }

    [Fact]
    public async Task ShowApartmentListAsync_WithoutSelectedDistrict_DoesNothing()
    {
        var apartmentService = new Mock<IApartmentService>(MockBehavior.Strict);
        var districtService = new Mock<IDistrictService>(MockBehavior.Strict);
        var botClient = new Mock<ITelegramBotClient>(MockBehavior.Strict);
        var service = CreateService(
            apartmentService.Object,
            districtService.Object,
            Mock.Of<IUserStateService>(),
            new ApartmentMessageFormatter(),
            Mock.Of<ITelegramMediaService>(),
            managerChatId: null);

        await service.ShowApartmentListAsync(
            botClient.Object,
            777,
            new UserState(),
            0,
            CancellationToken.None);

        apartmentService.Verify(
            x => x.GetApartmentsAsync(
                It.IsAny<Guid?>(),
                It.IsAny<Guid?>(),
                It.IsAny<ApartmentFilters?>(),
                It.IsAny<int>(),
                It.IsAny<int>(),
                It.IsAny<CancellationToken>()),
            Times.Never);
        districtService.Verify(x => x.GetDistrictByIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ShowApartmentListAsync_WhenNoApartments_SendsFallbackMessageWithoutPaginationRow()
    {
        var apartmentService = new Mock<IApartmentService>();
        var districtService = new Mock<IDistrictService>();
        var districtId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        apartmentService.Setup(x => x.GetApartmentsAsync(
                districtId,
                null,
                null,
                1,
                20,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ApartmentListDto([], 0, 0, 1));

        districtService.Setup(x => x.GetDistrictByIdAsync(
                districtId,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DistrictDto(
                districtId,
                Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                "Тестовый район",
                null,
                [],
                true,
                DateTime.UtcNow,
                DateTime.UtcNow));

        IRequest<Message>? capturedRequest = null;
        var botClient = CreateBotClientMock(request => capturedRequest = request);

        var service = CreateService(
            apartmentService.Object,
            districtService.Object,
            Mock.Of<IUserStateService>(),
            new ApartmentMessageFormatter(),
            Mock.Of<ITelegramMediaService>(),
            managerChatId: null);

        await service.ShowApartmentListAsync(
            botClient.Object,
            777,
            new UserState
            {
                SelectedDistrictId = districtId,
                CurrentPage = 1
            },
            0,
            CancellationToken.None);

        Assert.NotNull(capturedRequest);
        Assert.Equal("SendMessageRequest", capturedRequest!.GetType().Name);
        Assert.Contains("Квартиры не найдены", GetStringProperty(capturedRequest, "Text"));
        Assert.DoesNotContain("Стр.", GetReplyMarkupButtonTexts(capturedRequest));
    }

    [Fact]
    public async Task ShowApartmentListAsync_WhenDistrictPhotoAlreadyShown_EditsExistingMessage()
    {
        IRequest<Message>? capturedRequest = null;
        var botClient = CreateBotClientMock(request => capturedRequest = request);
        var apartmentService = new Mock<IApartmentService>();
        var districtService = new Mock<IDistrictService>();
        var districtId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        const string districtPhoto = "/uploads/districts/test/photo.jpg";

        apartmentService.Setup(x => x.GetApartmentsAsync(
                districtId,
                null,
                null,
                1,
                20,
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ApartmentListDto(
            [
                CreateApartment("Квартира №1", 65m, 17_000_000m, [])
            ],
            1,
            1,
            1));

        districtService.Setup(x => x.GetDistrictByIdAsync(districtId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DistrictDto(
                districtId,
                Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                "Тестовый район",
                null,
                [districtPhoto],
                true,
                DateTime.UtcNow,
                DateTime.UtcNow));

        var service = CreateService(
            apartmentService.Object,
            districtService.Object,
            CreateUserStateServiceMock().Object,
            new ApartmentMessageFormatter(),
            Mock.Of<ITelegramMediaService>(),
            managerChatId: null);

        await service.ShowApartmentListAsync(
            botClient.Object,
            777,
            new UserState
            {
                SelectedDistrictId = districtId,
                CurrentPage = 1,
                DistrictPhotoShownForDistrictId = districtId,
                DistrictPhotoShownForPhotoUrl = districtPhoto
            },
            42,
            CancellationToken.None);

        Assert.NotNull(capturedRequest);
        Assert.Equal("EditMessageTextRequest", capturedRequest!.GetType().Name);
        Assert.Contains("Доступно квартир: 1", GetStringProperty(capturedRequest, "Text"));
        Assert.Contains("65 м²", GetReplyMarkupButtonTexts(capturedRequest));
    }

    [Fact]
    public async Task ShowDistrictListAsync_UsesEditMessageTextRequestWithCityName()
    {
        IRequest<Message>? capturedRequest = null;
        var botClient = CreateBotClientMock(request => capturedRequest = request);
        var service = CreateService(
            Mock.Of<IApartmentService>(),
            Mock.Of<IDistrictService>(),
            Mock.Of<IUserStateService>(),
            new ApartmentMessageFormatter(),
            Mock.Of<ITelegramMediaService>(),
            managerChatId: null);

        await service.ShowDistrictListAsync(
            botClient.Object,
            777,
            new CityDto(
                Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                "Владивосток",
                null,
                true,
                DateTime.UtcNow,
                DateTime.UtcNow),
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
            ],
            15,
            CancellationToken.None);

        Assert.NotNull(capturedRequest);
        Assert.Equal("EditMessageTextRequest", capturedRequest!.GetType().Name);
        Assert.Contains("Владивосток", GetStringProperty(capturedRequest, "Text"));
    }

    [Fact]
    public async Task ShowDistrictListAsync_WhenEditFails_SendsFallbackMessage()
    {
        var requests = new List<string>();
        var botClient = new Mock<ITelegramBotClient>();
        botClient.Setup(x => x.SendRequest(
                It.IsAny<IRequest<Message>>(),
                It.IsAny<CancellationToken>()))
            .Returns<IRequest<Message>, CancellationToken>((request, _) =>
            {
                requests.Add(request.GetType().Name);

                if (request.GetType().Name == "EditMessageTextRequest")
                {
                    throw new HttpRequestException("telegram timeout");
                }

                return Task.FromResult(new Message { Id = 1, Date = DateTime.UtcNow });
            });

        var service = CreateService(
            Mock.Of<IApartmentService>(),
            Mock.Of<IDistrictService>(),
            Mock.Of<IUserStateService>(),
            new ApartmentMessageFormatter(),
            Mock.Of<ITelegramMediaService>(),
            managerChatId: null);

        await service.ShowDistrictListAsync(
            botClient.Object,
            777,
            new CityDto(
                Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                "Москва",
                null,
                true,
                DateTime.UtcNow,
                DateTime.UtcNow),
            [
                new DistrictDto(
                    Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                    Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
                    "Центральный",
                    null,
                    [],
                    true,
                    DateTime.UtcNow,
                    DateTime.UtcNow)
            ],
            42,
            CancellationToken.None);

        Assert.Equal(
            ["EditMessageTextRequest", "EditMessageTextRequest", "EditMessageTextRequest", "SendMessageRequest"],
            requests);
    }

    [Fact]
    public async Task ShowApartmentDetailsAsync_WithoutPhoto_SendsFormattedMessage()
    {
        IRequest<Message>? capturedRequest = null;
        var botClient = CreateBotClientMock(request => capturedRequest = request);
        var mediaService = new Mock<ITelegramMediaService>(MockBehavior.Strict);
        var service = CreateService(
            Mock.Of<IApartmentService>(),
            Mock.Of<IDistrictService>(),
            CreateUserStateServiceMock().Object,
            new ApartmentMessageFormatter(),
            mediaService.Object,
            managerChatId: 123456);

        await service.ShowApartmentDetailsAsync(
            botClient.Object,
            777,
            CreateApartment(
                name: "Квартира №3",
                area: 79.4m,
                price: 27_000_000m,
                photos: []),
            0,
            CancellationToken.None);

        Assert.NotNull(capturedRequest);
        Assert.Equal("SendMessageRequest", capturedRequest!.GetType().Name);
        Assert.Contains("Квартира №3", GetStringProperty(capturedRequest, "Text"));
        Assert.Contains("27000000", NormalizeNumberFormatting(GetStringProperty(capturedRequest, "Text")));

        mediaService.Verify(
            x => x.LoadPhotoAsInputFileAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task ShowApartmentDetailsAsync_WhenPhotoAlreadyShown_SendsTextOnly()
    {
        IRequest<Message>? capturedRequest = null;
        var botClient = CreateBotClientMock(request => capturedRequest = request);
        var mediaService = new Mock<ITelegramMediaService>(MockBehavior.Strict);
        var userStateService = CreateUserStateServiceMock(new UserState
        {
            ApartmentPhotoShownForApartmentId = Guid.Parse("031cd3a3-01d6-45f8-b33c-453b7b0e36f1"),
            ApartmentPhotoShownForPhotoUrl = "/uploads/apartments/test/photo.jpg"
        });

        var service = CreateService(
            Mock.Of<IApartmentService>(),
            Mock.Of<IDistrictService>(),
            userStateService.Object,
            new ApartmentMessageFormatter(),
            mediaService.Object,
            managerChatId: null);

        await service.ShowApartmentDetailsAsync(
            botClient.Object,
            777,
            CreateApartment(
                "Квартира №5",
                61m,
                19_000_000m,
                ["/uploads/apartments/test/photo.jpg"]),
            41,
            CancellationToken.None);

        Assert.NotNull(capturedRequest);
        Assert.Equal("EditMessageTextRequest", capturedRequest!.GetType().Name);
        Assert.Contains("Фото этой квартиры уже показано выше.", GetStringProperty(capturedRequest, "Text"));
        mediaService.Verify(
            x => x.LoadPhotoAsInputFileAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task ShowApartmentGalleryAsync_WithSeveralPhotos_SendsMediaGroup()
    {
        var botClient = new Mock<ITelegramBotClient>();
        botClient.Setup(x => x.SendRequest(
                It.IsAny<IRequest<Message[]>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync([]);

        var mediaService = new Mock<ITelegramMediaService>();
        mediaService.Setup(x => x.BuildWebPanelFileUrl(It.IsAny<string>()))
            .Returns<string>(path => $"http://localhost:3000{path}");
        mediaService.Setup(x => x.LoadPhotoAsInputFileAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Telegram.Bot.Types.InputFile.FromStream(new MemoryStream([1, 2, 3]), "photo.jpg"));

        var service = CreateService(
            Mock.Of<IApartmentService>(),
            Mock.Of<IDistrictService>(),
            CreateUserStateServiceMock().Object,
            new ApartmentMessageFormatter(),
            mediaService.Object,
            managerChatId: null);

        await service.ShowApartmentGalleryAsync(
            botClient.Object,
            777,
            CreateApartment(
                "Квартира №9",
                72m,
                21_000_000m,
                ["/uploads/a.jpg", "/uploads/b.jpg"]),
            CancellationToken.None);

        mediaService.Verify(
            x => x.LoadPhotoAsInputFileAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Once);
        botClient.Verify(
            x => x.SendRequest(It.IsAny<IRequest<Message[]>>(), It.IsAny<CancellationToken>()),
            Times.Once);
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

    private static ApartmentPresentationService CreateService(
        IApartmentService apartmentService,
        IDistrictService districtService,
        IUserStateService userStateService,
        IApartmentMessageFormatter apartmentMessageFormatter,
        ITelegramMediaService telegramMediaService,
        long? managerChatId)
    {
        return new ApartmentPresentationService(
            apartmentService,
            districtService,
            userStateService,
            apartmentMessageFormatter,
            telegramMediaService,
            new TelegramRetryService(NullLogger<TelegramRetryService>.Instance),
            Options.Create(new TelegramSettings
            {
                BotToken = "123:token",
                ManagerChatId = managerChatId
            }),
            NullLogger<ApartmentPresentationService>.Instance);
    }

    private static Mock<IUserStateService> CreateUserStateServiceMock(UserState? state = null)
    {
        var userStateService = new Mock<IUserStateService>();
        userStateService.Setup(x => x.GetStateAsync(It.IsAny<long>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(state ?? new UserState());
        userStateService.Setup(x => x.SetStateAsync(It.IsAny<long>(), It.IsAny<UserState>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        return userStateService;
    }

    private static ApartmentDto CreateApartment(
        string name,
        decimal area,
        decimal price,
        IReadOnlyList<string> photos)
    {
        return new ApartmentDto(
            Guid.Parse("031cd3a3-01d6-45f8-b33c-453b7b0e36f1"),
            Guid.Parse("f2fd359b-8ce1-4c3a-a3e4-70b484d249f5"),
            name,
            "Чистовая",
            "3",
            area,
            18,
            price,
            photos,
            true,
            DateTime.UtcNow,
            DateTime.UtcNow);
    }

    private static string GetStringProperty(object target, string propertyName)
    {
        return (string)(target.GetType().GetProperty(propertyName)?.GetValue(target)
            ?? throw new InvalidOperationException($"Property {propertyName} not found."));
    }

    private static string NormalizeNumberFormatting(string value)
    {
        return value
            .Replace(" ", string.Empty)
            .Replace("\u00A0", string.Empty)
            .Replace("\u202F", string.Empty);
    }

    private static string GetReplyMarkupButtonTexts(object request)
    {
        var replyMarkup = request.GetType().GetProperty("ReplyMarkup")?.GetValue(request) as InlineKeyboardMarkup;
        if (replyMarkup is null)
        {
            return string.Empty;
        }

        return string.Join(
            "\n",
            replyMarkup.InlineKeyboard
                .SelectMany(row => row)
                .Select(button => button.Text));
    }
}

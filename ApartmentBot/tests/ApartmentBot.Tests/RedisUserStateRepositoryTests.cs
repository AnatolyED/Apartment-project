using System.Text.Json;
using ApartmentBot.Domain.Interfaces;
using ApartmentBot.Infrastructure.Configuration;
using ApartmentBot.Infrastructure.State;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using StackExchange.Redis;

namespace ApartmentBot.Tests;

public sealed class RedisUserStateRepositoryTests
{
    [Fact]
    public async Task SetAsync_UsesConfiguredTtlAndExpectedKey()
    {
        var database = new Mock<IDatabase>();
        var multiplexer = new Mock<IConnectionMultiplexer>();
        multiplexer.Setup(x => x.GetDatabase(It.IsAny<int>(), It.IsAny<object>()))
            .Returns(database.Object);

        var repository = CreateRepository(multiplexer.Object, 45);
        var state = new UserState
        {
            SelectedCityId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
            CurrentPage = 3,
            SelectedCityName = "Владивосток"
        };

        await repository.SetAsync(777, state);

        var invocation = Assert.Single(database.Invocations, x => x.Method.Name == nameof(IDatabase.StringSetAsync));
        Assert.Equal("user:state:777", invocation.Arguments[0]?.ToString());
        Assert.Equal("EX 2700", invocation.Arguments[2]?.ToString());
    }

    [Fact]
    public async Task GetAsync_DeserializesStoredUserState()
    {
        var database = new Mock<IDatabase>();
        var multiplexer = new Mock<IConnectionMultiplexer>();
        multiplexer.Setup(x => x.GetDatabase(It.IsAny<int>(), It.IsAny<object>()))
            .Returns(database.Object);

        var state = new UserState
        {
            SelectedDistrictId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
            RequestedApartmentName = "Квартира №8",
            CurrentStep = BotStep.ViewApartments
        };

        var json = JsonSerializer.Serialize(
            state,
            new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
            });

        database.Setup(x => x.StringGetAsync("user:state:888", CommandFlags.None))
            .ReturnsAsync(json);

        var repository = CreateRepository(multiplexer.Object, 30);

        var restored = await repository.GetAsync(888);

        Assert.NotNull(restored);
        Assert.Equal(state.SelectedDistrictId, restored!.SelectedDistrictId);
        Assert.Equal("Квартира №8", restored.RequestedApartmentName);
        Assert.Equal(BotStep.ViewApartments, restored.CurrentStep);
    }

    [Fact]
    public async Task RemoveAsync_DeletesExpectedKey()
    {
        var database = new Mock<IDatabase>();
        var multiplexer = new Mock<IConnectionMultiplexer>();
        multiplexer.Setup(x => x.GetDatabase(It.IsAny<int>(), It.IsAny<object>()))
            .Returns(database.Object);

        var repository = CreateRepository(multiplexer.Object, 30);

        await repository.RemoveAsync(999);

        database.Verify(
            x => x.KeyDeleteAsync("user:state:999", CommandFlags.None),
            Times.Once);
    }

    private static RedisUserStateRepository CreateRepository(
        IConnectionMultiplexer multiplexer,
        int ttlMinutes)
    {
        return new RedisUserStateRepository(
            multiplexer,
            Options.Create(new RedisSettings
            {
                ConnectionString = "localhost:6379",
                UserStateTtlMinutes = ttlMinutes
            }),
            NullLogger<RedisUserStateRepository>.Instance);
    }
}

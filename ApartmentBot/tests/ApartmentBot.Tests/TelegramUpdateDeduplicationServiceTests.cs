using ApartmentBot.Bot.Services;
using Telegram.Bot.Types;

namespace ApartmentBot.Tests;

public sealed class TelegramUpdateDeduplicationServiceTests
{
    [Fact]
    public void BuildKey_UsesCallbackQueryId_WhenPresent()
    {
        var update = new Update
        {
            Id = 123,
            CallbackQuery = new CallbackQuery { Id = "cb-42" }
        };

        var key = TelegramUpdateDeduplicationService.BuildKey(update);

        Assert.Equal("telegram:update-dedupe:callback:cb-42", key);
    }

    [Fact]
    public void BuildKey_FallsBackToUpdateId_ForRegularUpdate()
    {
        var update = new Update
        {
            Id = 98765
        };

        var key = TelegramUpdateDeduplicationService.BuildKey(update);

        Assert.Equal("telegram:update-dedupe:update:98765", key);
    }
}

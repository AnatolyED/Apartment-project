using ApartmentBot.Bot.CallbackData;
using ApartmentBot.Bot.Keyboards;

namespace ApartmentBot.Tests;

public sealed class ApartmentDetailsKeyboardTests
{
    [Fact]
    public void CreateApartmentDetailsKeyboard_EmbedsApartmentIdInCardActions()
    {
        var apartmentId = Guid.Parse("11111111-1111-1111-1111-111111111111");

        var keyboard = KeyboardFactory.CreateApartmentDetailsKeyboard(
            apartmentId,
            hasGallery: true,
            hasLocationPhoto: true);

        var callbacks = keyboard.InlineKeyboard
            .SelectMany(row => row)
            .Select(button => button.CallbackData)
            .ToArray();

        Assert.Contains(ApartmentConsultationCallbackData.ToCallbackData(apartmentId), callbacks);
        Assert.Contains(ApartmentGalleryCallbackData.ToCallbackData(apartmentId), callbacks);
        Assert.Contains(
            ApartmentPhotoCallbackData.ToCallbackData(ApartmentPhotoCallbackData.Layout, apartmentId),
            callbacks);
        Assert.Contains(
            ApartmentPhotoCallbackData.ToCallbackData(ApartmentPhotoCallbackData.Location, apartmentId),
            callbacks);
    }

    [Fact]
    public void ApartmentPhotoCallbackData_Parse_ReturnsViewAndApartmentId()
    {
        var apartmentId = Guid.Parse("22222222-2222-2222-2222-222222222222");

        var parsed = ApartmentPhotoCallbackData.Parse(
            ApartmentPhotoCallbackData.ToCallbackData(ApartmentPhotoCallbackData.Location, apartmentId));

        Assert.Equal(ApartmentPhotoCallbackData.Location, parsed.View);
        Assert.Equal(apartmentId, parsed.ApartmentId);
    }
}

using ApartmentBot.Application.DTOs;
using ApartmentBot.Max.CallbackData;
using Max.Bot.Types;
using Max.Bot.Types.Enums;

namespace ApartmentBot.Max.Keyboards;

public static class MaxKeyboardFactory
{
    public static InlineKeyboard CreateCityKeyboard(IReadOnlyList<CityDto> cities)
    {
        var rows = cities
            .Select(city => new[]
            {
                CreateCallbackButton(city.Name, new MaxCityCallbackData { CityId = city.Id }.ToPayload())
            })
            .ToList();

        return new InlineKeyboard(rows.ToArray());
    }

    public static InlineKeyboard CreateDistrictKeyboard(IReadOnlyList<DistrictDto> districts)
    {
        var rows = districts
            .Select(district => new[]
            {
                CreateCallbackButton(district.Name, new MaxDistrictCallbackData { DistrictId = district.Id }.ToPayload())
            })
            .ToList();

        rows.Add([CreateCallbackButton("Назад к городам", MaxNavigationCallbacks.BackToCities)]);

        return new InlineKeyboard(rows.ToArray());
    }

    private static InlineKeyboardButton CreateCallbackButton(string text, string payload)
    {
        return new InlineKeyboardButton
        {
            Text = text,
            CallbackData = payload,
            Intent = ButtonIntent.Default
        };
    }
}

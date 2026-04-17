using System.Globalization;
using ApartmentBot.Application.DTOs;

namespace ApartmentBot.Bot.Services;

public interface IApartmentMessageFormatter
{
    string FormatApartmentMessage(ApartmentDto apartment, string? districtName = null);
}

public sealed class ApartmentMessageFormatter : IApartmentMessageFormatter
{
    public string FormatApartmentMessage(ApartmentDto apartment, string? districtName = null)
    {
        var priceFormatted = $"{apartment.Price:N0} ₽";
        var areaFormatted = FormatArea(apartment.Area);
        var finishingFormatted = FormatFinishing(apartment.Finishing);
        var districtLine = string.IsNullOrWhiteSpace(districtName)
            ? string.Empty
            : $"📍 Район: {districtName}\n";

        return $"🏠 {apartment.Name}\n\n" +
               districtLine +
               $"💰 Цена: {priceFormatted}\n" +
               $"📐 Площадь: {areaFormatted}\n" +
               $"🚪 Комнаты: {apartment.Rooms}\n" +
               $"🎨 Отделка: {finishingFormatted}";
    }

    public static string FormatArea(decimal area)
    {
        return $"{area.ToString("0.#", CultureInfo.InvariantCulture)} м²";
    }

    public static string FormatFinishing(string finishing)
    {
        return finishing switch
        {
            "Чистовая" => "Чистовая",
            "ВайтБокс" => "Подчистовая",
            "Вайт бокс" => "Подчистовая",
            "Подчистовая" => "Подчистовая",
            "БезОтделки" => "Без отделки",
            "Без отделки" => "Без отделки",
            _ => finishing
        };
    }
}

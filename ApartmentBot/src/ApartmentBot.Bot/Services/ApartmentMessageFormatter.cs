using System.Globalization;
using ApartmentBot.Application.DTOs;

namespace ApartmentBot.Bot.Services;

public interface IApartmentMessageFormatter
{
    string FormatApartmentMessage(ApartmentDto apartment);
}

public sealed class ApartmentMessageFormatter : IApartmentMessageFormatter
{
    public string FormatApartmentMessage(ApartmentDto apartment)
    {
        var priceFormatted = $"{apartment.Price:N0} ₽";
        var areaFormatted = FormatArea(apartment.Area);
        var finishingFormatted = FormatFinishing(apartment.Finishing);

        return $"🏠 {apartment.Name}\n\n" +
               $"💰 Цена: {priceFormatted}\n" +
               $"📐 Площадь: {areaFormatted}\n" +
               $"🏢 Этаж: {apartment.Floor}\n" +
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
            "ВайтБокс" => "Вайт бокс",
            "Вайт бокс" => "Вайт бокс",
            "БезОтделки" => "Без отделки",
            "Без отделки" => "Без отделки",
            _ => finishing
        };
    }
}

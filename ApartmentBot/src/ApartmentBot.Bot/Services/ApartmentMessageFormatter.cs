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
        var areaFormatted = $"{apartment.Area:F1} м²";

        return $"🏠 {apartment.Name}\n\n" +
               $"💰 Цена: {priceFormatted}\n" +
               $"📐 Площадь: {areaFormatted}\n" +
               $"🏢 Этаж: {apartment.Floor}\n" +
               $"🚪 Комнаты: {apartment.Rooms}\n" +
               $"🎨 Отделка: {apartment.Finishing}";
    }
}

using System.Globalization;
using ApartmentBot.Domain.Entities;

namespace ApartmentBot.Infrastructure.Caching;

internal static class CacheKeys
{
    public static string CitiesAll() => "cities:all";

    public static string DistrictsByCity(Guid cityId) => $"districts:city:{cityId:D}";

    public static string ApartmentsPage(
        Guid? districtId,
        Guid? cityId,
        FinishingType? finishing,
        string? rooms,
        decimal? priceMin,
        decimal? priceMax,
        decimal? areaMin,
        decimal? areaMax,
        int page,
        int limit,
        string sort)
    {
        return string.Join(':',
            "apartments",
            "city", FormatGuid(cityId),
            "district", FormatGuid(districtId),
            "finishing", finishing?.ToString() ?? "none",
            "rooms", Escape(rooms),
            "priceMin", FormatDecimal(priceMin),
            "priceMax", FormatDecimal(priceMax),
            "areaMin", FormatDecimal(areaMin),
            "areaMax", FormatDecimal(areaMax),
            "page", page.ToString(CultureInfo.InvariantCulture),
            "limit", limit.ToString(CultureInfo.InvariantCulture),
            "sort", Escape(sort));
    }

    private static string FormatGuid(Guid? value) => value?.ToString("D") ?? "none";

    private static string FormatDecimal(decimal? value) =>
        value?.ToString(CultureInfo.InvariantCulture) ?? "none";

    private static string Escape(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? "none"
            : value.Trim().Replace(':', '_').Replace(' ', '_');
}

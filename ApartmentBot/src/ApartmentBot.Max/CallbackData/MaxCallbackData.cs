namespace ApartmentBot.Max.CallbackData;

public static class MaxNavigationCallbacks
{
    public const string ShowCities = "nav:cities";
    public const string BackToCities = "nav:back_to_cities";
}

public sealed class MaxCityCallbackData
{
    public const string Prefix = "city:";

    public Guid CityId { get; init; }

    public string ToPayload() => $"{Prefix}{CityId}";

    public static bool TryParse(string? payload, out Guid cityId)
    {
        cityId = Guid.Empty;

        if (string.IsNullOrWhiteSpace(payload) || !payload.StartsWith(Prefix, StringComparison.Ordinal))
        {
            return false;
        }

        return Guid.TryParse(payload[Prefix.Length..], out cityId);
    }
}

public sealed class MaxDistrictCallbackData
{
    public const string Prefix = "district:";

    public Guid DistrictId { get; init; }

    public string ToPayload() => $"{Prefix}{DistrictId}";

    public static bool TryParse(string? payload, out Guid districtId)
    {
        districtId = Guid.Empty;

        if (string.IsNullOrWhiteSpace(payload) || !payload.StartsWith(Prefix, StringComparison.Ordinal))
        {
            return false;
        }

        return Guid.TryParse(payload[Prefix.Length..], out districtId);
    }
}

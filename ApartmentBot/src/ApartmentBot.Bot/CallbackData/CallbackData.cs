namespace ApartmentBot.Bot.CallbackData;

public sealed class CityCallbackData
{
    public const string Prefix = "city:";
    public Guid CityId { get; set; }
    
    public string ToCallbackData() => $"{Prefix}{CityId}";
    
    public static Guid Parse(string data) => Guid.Parse(data.Replace(Prefix, ""));
}

public sealed class DistrictCallbackData
{
    public const string Prefix = "district:";
    public Guid DistrictId { get; set; }
    
    public string ToCallbackData() => $"{Prefix}{DistrictId}";
    
    public static Guid Parse(string data) => Guid.Parse(data.Replace(Prefix, ""));
}

public sealed class ApartmentCallbackData
{
    public const string Prefix = "apt:";
    public Guid ApartmentId { get; set; }
    
    public string ToCallbackData() => $"{Prefix}{ApartmentId}";
    
    public static Guid Parse(string data) => Guid.Parse(data.Replace(Prefix, ""));
}

public static class ApartmentPhotoCallbackData
{
    public const string Prefix = "apt:photo:";
    public const string Layout = "layout";
    public const string Location = "location";

    public static string ToCallbackData(string view, Guid apartmentId) => $"{Prefix}{view}:{apartmentId}";

    public static (string View, Guid ApartmentId) Parse(string data)
    {
        var payload = data[Prefix.Length..];
        var parts = payload.Split(':', 2);
        if (parts.Length != 2)
        {
            throw new FormatException("Apartment photo callback must include view and apartment id.");
        }

        return (parts[0], Guid.Parse(parts[1]));
    }

    public static bool IsKnownView(string view) =>
        string.Equals(view, Layout, StringComparison.Ordinal) ||
        string.Equals(view, Location, StringComparison.Ordinal);
}

public static class ApartmentConsultationCallbackData
{
    public const string Prefix = "apt:consult:";

    public static string ToCallbackData(Guid apartmentId) => $"{Prefix}{apartmentId}";

    public static Guid Parse(string data) => Guid.Parse(data[Prefix.Length..]);
}

public static class ApartmentGalleryCallbackData
{
    public const string Prefix = "apt:gallery:";

    public static string ToCallbackData(Guid apartmentId) => $"{Prefix}{apartmentId}";

    public static Guid Parse(string data) => Guid.Parse(data[Prefix.Length..]);
}

public sealed class PageCallbackData
{
    public const string Prefix = "page:";
    public int PageNumber { get; set; }
    
    public string ToCallbackData() => $"{Prefix}{PageNumber}";
    
    public static int Parse(string data) => int.Parse(data.Replace(Prefix, ""));
}

public sealed class FilterCallbackData
{
    public const string Prefix = "filter:";
    public string FilterType { get; set; } = string.Empty;
    public string? Value { get; set; }
    
    public string ToCallbackData() => string.IsNullOrEmpty(Value) ? $"{Prefix}{FilterType}" : $"{Prefix}{FilterType}:{Value}";
    
    public static (string type, string? value) Parse(string data)
    {
        var parts = data.Replace(Prefix, "").Split(':', 2);
        return (parts[0], parts.Length > 1 ? parts[1] : null);
    }
}

public sealed class NavigationCallbackData
{
    public const string Prefix = "nav:";
    public string Action { get; set; } = string.Empty;
    
    public string ToCallbackData() => $"{Prefix}{Action}";
    
    public static string Parse(string data) => data.Replace(Prefix, "");
}

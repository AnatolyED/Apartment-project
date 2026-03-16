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

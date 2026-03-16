namespace ApartmentBot.Domain.Errors;

public sealed class DomainError
{
    public string Code { get; init; } = string.Empty;
    public string Message { get; init; } = string.Empty;
    
    public static readonly DomainError NotFound = new() { Code = "NOT_FOUND", Message = "Ресурс не найден" };
    public static readonly DomainError InvalidData = new() { Code = "INVALID_DATA", Message = "Некорректные данные" };
    public static readonly DomainError CityNotFound = new() { Code = "CITY_NOT_FOUND", Message = "Город не найден" };
    public static readonly DomainError DistrictNotFound = new() { Code = "DISTRICT_NOT_FOUND", Message = "Район не найден" };
    public static readonly DomainError ApartmentNotFound = new() { Code = "APARTMENT_NOT_FOUND", Message = "Квартира не найдена" };
    public static readonly DomainError ApiError = new() { Code = "API_ERROR", Message = "Ошибка при запросе к API" };
}

public sealed class ApiException : Exception
{
    public string Code { get; init; } = string.Empty;
    public string? Details { get; init; }
    
    public ApiException(string message, string code = "API_ERROR", string? details = null) 
        : base(message)
    {
        Code = code;
        Details = details;
    }
}

using ApartmentBot.Domain.Entities;
using ApartmentBot.Domain.Errors;
using ApartmentBot.Domain.Interfaces;
using Microsoft.Extensions.Logging;
using System.Globalization;
using System.Net.Http.Json;

namespace ApartmentBot.Infrastructure.ApiClient;

public interface IWebPanelApiClient
{
    Task<IReadOnlyList<City>> GetCitiesAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<District>> GetDistrictsByCityIdAsync(Guid cityId, CancellationToken cancellationToken = default);
    Task<ApartmentPagedList> GetApartmentsAsync(
        Guid? districtId = null,
        Guid? cityId = null,
        FinishingType? finishing = null,
        string? rooms = null,
        decimal? priceMin = null,
        decimal? priceMax = null,
        decimal? areaMin = null,
        decimal? areaMax = null,
        int page = 1,
        int limit = 20,
        string sort = "created_desc",
        CancellationToken cancellationToken = default);
    Task<Apartment?> GetApartmentByIdAsync(Guid id, CancellationToken cancellationToken = default);
}

public sealed class WebPanelApiClient : IWebPanelApiClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<WebPanelApiClient> _logger;
    private readonly string _baseUrl;

    public WebPanelApiClient(HttpClient httpClient, ILogger<WebPanelApiClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _baseUrl = httpClient.BaseAddress?.ToString().TrimEnd('/') ?? "http://localhost:3000/api";
        _logger.LogInformation("WebPanelApiClient инициализирован с базовым адресом: {BaseAddress}", _baseUrl);
    }

    public async Task<IReadOnlyList<City>> GetCitiesAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var requestUrl = BuildRequestUrl("cities", new Dictionary<string, string?>
            {
                ["limit"] = "100",
                ["isActive"] = "true",
                ["view"] = "bot"
            });
            _logger.LogInformation("Запрос городов: {Url}", requestUrl);

            var response = await _httpClient.GetFromJsonAsync<ApiResponse<CitiesResponse>>(
                requestUrl,
                cancellationToken);

            var data = EnsureSuccessfulResponse(response);

            return data.Cities.Select(c => new City
            {
                Id = Guid.Parse(c.Id),
                Name = c.Name,
                Description = c.Description,
                IsActive = c.IsActive,
                CreatedAt = c.CreatedAt,
                UpdatedAt = c.UpdatedAt
            }).ToList();
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Ошибка HTTP при запросе городов");
            throw new ApiException("Ошибка соединения с API", "HTTP_ERROR", ex.Message);
        }
    }

    public async Task<IReadOnlyList<District>> GetDistrictsByCityIdAsync(Guid cityId, CancellationToken cancellationToken = default)
    {
        try
        {
            var requestUrl = BuildRequestUrl("districts", new Dictionary<string, string?>
            {
                ["cityId"] = cityId.ToString("D"),
                ["isActive"] = "true",
                ["view"] = "bot"
            });
            _logger.LogInformation("Запрос районов: {Url}", requestUrl);

            var response = await _httpClient.GetFromJsonAsync<ApiResponse<DistrictsResponse>>(
                requestUrl,
                cancellationToken);

            var data = EnsureSuccessfulResponse(response);

            return data.Districts.Select(d => new District
            {
                Id = Guid.Parse(d.Id),
                CityId = Guid.Parse(d.CityId),
                Name = d.Name,
                Description = d.Description,
                Photos = d.Photos,
                IsActive = d.IsActive,
                CreatedAt = d.CreatedAt,
                UpdatedAt = d.UpdatedAt
            }).ToList();
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Ошибка HTTP при запросе районов");
            throw new ApiException("Ошибка соединения с API", "HTTP_ERROR", ex.Message);
        }
    }

    public async Task<ApartmentPagedList> GetApartmentsAsync(
        Guid? districtId = null,
        Guid? cityId = null,
        FinishingType? finishing = null,
        string? rooms = null,
        decimal? priceMin = null,
        decimal? priceMax = null,
        decimal? areaMin = null,
        decimal? areaMax = null,
        int page = 1,
        int limit = 20,
        string sort = "created_desc",
        CancellationToken cancellationToken = default)
    {
        try
        {
            var requestUrl = BuildRequestUrl("apartments", new Dictionary<string, string?>
            {
                ["districtId"] = districtId?.ToString("D"),
                ["cityId"] = cityId?.ToString("D"),
                ["view"] = "bot",
                ["finishing"] = FormatFinishing(finishing),
                ["rooms"] = rooms,
                ["priceMin"] = FormatDecimal(priceMin),
                ["priceMax"] = FormatDecimal(priceMax),
                ["areaMin"] = FormatDecimal(areaMin),
                ["areaMax"] = FormatDecimal(areaMax),
                ["page"] = page.ToString(CultureInfo.InvariantCulture),
                ["limit"] = limit.ToString(CultureInfo.InvariantCulture),
                ["sort"] = sort
            });
            _logger.LogInformation("Запрос квартир: {Url}", requestUrl);

            var response = await _httpClient.GetFromJsonAsync<ApiResponse<ApartmentsResponse>>(
                requestUrl,
                cancellationToken);

            var data = EnsureSuccessfulResponse(response);

            return new ApartmentPagedList(
                data.Apartments.Select(a =>
                {
                    var apartmentId = !string.IsNullOrEmpty(a.Id) ? Guid.Parse(a.Id) : Guid.NewGuid();
                    var apartmentDistrictId = !string.IsNullOrEmpty(a.DistrictId) ? Guid.Parse(a.DistrictId) : Guid.NewGuid();

                    _logger.LogDebug("Маппинг квартиры: API Id={ApiId}, Mapped Id={Id}", a.Id, apartmentId);

                    return new Apartment
                    {
                        Id = apartmentId,
                        DistrictId = apartmentDistrictId,
                        Name = a.Name,
                        Finishing = ParseFinishingType(a.Finishing),
                        Rooms = a.Rooms,
                        Area = a.Area,
                        Floor = a.Floor,
                        Price = a.Price,
                        Photos = a.Photos,
                        IsActive = a.IsActive,
                        CreatedAt = a.CreatedAt,
                        UpdatedAt = a.UpdatedAt
                    };
                }).ToList(),
                data.Total,
                data.TotalPages,
                data.CurrentPage);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Ошибка HTTP при запросе квартир");
            throw new ApiException("Ошибка соединения с API", "HTTP_ERROR", ex.Message);
        }
    }

    public async Task<Apartment?> GetApartmentByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        try
        {
            var requestUrl = BuildRequestUrl($"apartments/{id}", new Dictionary<string, string?>
            {
                ["view"] = "bot"
            });
            _logger.LogDebug("Запрос квартиры: {Url}", requestUrl);

            var response = await _httpClient.GetFromJsonAsync<ApiResponse<ApartmentByIdResponse>>(
                requestUrl,
                cancellationToken);

            if (response is null || !response.Success || response.Data is null)
            {
                return null;
            }

            var apartment = response.Data.Apartment ?? response.Data.Apartments?.FirstOrDefault();
            if (apartment is null)
            {
                return null;
            }

            return new Apartment
            {
                Id = Guid.Parse(apartment.Id),
                DistrictId = Guid.Parse(apartment.DistrictId),
                Name = apartment.Name,
                Finishing = ParseFinishingType(apartment.Finishing),
                Rooms = apartment.Rooms,
                Area = apartment.Area,
                Floor = apartment.Floor,
                Price = apartment.Price,
                Photos = apartment.Photos,
                IsActive = apartment.IsActive,
                CreatedAt = apartment.CreatedAt,
                UpdatedAt = apartment.UpdatedAt
            };
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Ошибка HTTP при запросе квартиры");
            throw new ApiException("Ошибка соединения с API", "HTTP_ERROR", ex.Message);
        }
    }

    private static FinishingType ParseFinishingType(string finishing) => finishing switch
    {
        "Чистовая" => FinishingType.Чистовая,
        "Вайт бокс" => FinishingType.ВайтБокс,
        "ВайтБокс" => FinishingType.ВайтБокс,
        "Без отделки" => FinishingType.БезОтделки,
        "БезОтделки" => FinishingType.БезОтделки,
        _ => FinishingType.Unknown
    };

    private string BuildRequestUrl(string path, IReadOnlyDictionary<string, string?> queryParameters)
    {
        var queryString = string.Join("&",
            queryParameters
                .Where(parameter => !string.IsNullOrWhiteSpace(parameter.Value))
                .Select(parameter => $"{Uri.EscapeDataString(parameter.Key)}={Uri.EscapeDataString(parameter.Value!)}"));

        return string.IsNullOrEmpty(queryString)
            ? $"{_baseUrl}/{path}"
            : $"{_baseUrl}/{path}?{queryString}";
    }

    private static T EnsureSuccessfulResponse<T>(ApiResponse<T>? response) where T : class
    {
        if (response is not null && response.Success && response.Data is not null)
        {
            return response.Data;
        }

        throw new ApiException(
            response?.Error?.Message ?? "Неизвестная ошибка API",
            response?.Error?.Code ?? "API_ERROR",
            response?.Error?.Details is not null ? string.Join("; ", response.Error.Details) : null);
    }

    private static string? FormatFinishing(FinishingType? finishing) => finishing switch
    {
        FinishingType.Чистовая => "Чистовая",
        FinishingType.ВайтБокс => "Вайт бокс",
        FinishingType.БезОтделки => "Без отделки",
        _ => null
    };

    private static string? FormatDecimal(decimal? value) =>
        value?.ToString(CultureInfo.InvariantCulture);
}

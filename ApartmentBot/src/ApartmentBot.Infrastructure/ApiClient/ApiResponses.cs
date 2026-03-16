using System.Text.Json.Serialization;

namespace ApartmentBot.Infrastructure.ApiClient;

public sealed record ApiResponse<T>(
    [property: JsonPropertyName("success")] bool Success,
    [property: JsonPropertyName("data")] T? Data,
    [property: JsonPropertyName("error")] ApiError? Error);

public sealed record ApiError(
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("details")] List<string>? Details);

public sealed record CitiesResponse(
    [property: JsonPropertyName("cities")] IReadOnlyList<CityResponse> Cities,
    [property: JsonPropertyName("total")] int Total);

public sealed record CityResponse(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("isActive")] bool IsActive,
    [property: JsonPropertyName("createdAt")] DateTime CreatedAt,
    [property: JsonPropertyName("updatedAt")] DateTime UpdatedAt);

public sealed record DistrictsResponse(
    [property: JsonPropertyName("districts")] IReadOnlyList<DistrictResponse> Districts,
    [property: JsonPropertyName("total")] int Total);

public sealed record DistrictResponse(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("cityId")] string CityId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string? Description,
    [property: JsonPropertyName("photos")] IReadOnlyList<string> Photos,
    [property: JsonPropertyName("isActive")] bool IsActive,
    [property: JsonPropertyName("createdAt")] DateTime CreatedAt,
    [property: JsonPropertyName("updatedAt")] DateTime UpdatedAt);

public sealed record ApartmentsResponse(
    [property: JsonPropertyName("apartments")] IReadOnlyList<ApartmentResponse> Apartments,
    [property: JsonPropertyName("total")] int Total,
    [property: JsonPropertyName("totalPages")] int TotalPages,
    [property: JsonPropertyName("currentPage")] int CurrentPage);

public sealed record ApartmentByIdResponse(
    [property: JsonPropertyName("apartment")] ApartmentResponse? Apartment,
    [property: JsonPropertyName("apartments")] IReadOnlyList<ApartmentResponse>? Apartments);

public sealed record ApartmentResponse(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("districtId")] string DistrictId,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("finishing")] string Finishing,
    [property: JsonPropertyName("rooms")] string Rooms,
    [property: JsonPropertyName("area")] decimal Area,
    [property: JsonPropertyName("floor")] int Floor,
    [property: JsonPropertyName("price")] decimal Price,
    [property: JsonPropertyName("photos")] IReadOnlyList<string> Photos,
    [property: JsonPropertyName("isActive")] bool IsActive,
    [property: JsonPropertyName("createdAt")] DateTime CreatedAt,
    [property: JsonPropertyName("updatedAt")] DateTime UpdatedAt);

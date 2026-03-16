namespace ApartmentBot.Application.DTOs;

public sealed record CityDto(
    Guid Id,
    string Name,
    string? Description,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record DistrictDto(
    Guid Id,
    Guid CityId,
    string Name,
    string? Description,
    IReadOnlyList<string> Photos,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record ApartmentDto(
    Guid Id,
    Guid DistrictId,
    string Name,
    string Finishing,
    string Rooms,
    decimal Area,
    int Floor,
    decimal Price,
    IReadOnlyList<string> Photos,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record ApartmentListDto(
    IReadOnlyList<ApartmentDto> Apartments,
    int Total,
    int TotalPages,
    int CurrentPage);

using ApartmentBot.Domain.Entities;

namespace ApartmentBot.Domain.Interfaces;

public interface ICityRepository
{
    Task<IReadOnlyList<City>> GetAllAsync(bool onlyActive = true, CancellationToken cancellationToken = default);
    Task<City?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IDistrictRepository
{
    Task<IReadOnlyList<District>> GetByCityIdAsync(Guid cityId, bool onlyActive = true, CancellationToken cancellationToken = default);
    Task<District?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IApartmentRepository
{
    Task<ApartmentPagedList> GetPagedListAsync(
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
    
    Task<Apartment?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
}

public record ApartmentPagedList(
    IReadOnlyList<Apartment> Apartments,
    int Total,
    int TotalPages,
    int CurrentPage);

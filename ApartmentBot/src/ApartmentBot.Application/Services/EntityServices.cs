using ApartmentBot.Domain.Entities;
using ApartmentBot.Domain.Interfaces;
using ApartmentBot.Domain.Errors;
using ApartmentBot.Application.DTOs;

namespace ApartmentBot.Application.Services;

public interface ICityService
{
    Task<IReadOnlyList<CityDto>> GetAllCitiesAsync(CancellationToken cancellationToken = default);
    Task<CityDto?> GetCityByIdAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IDistrictService
{
    Task<IReadOnlyList<DistrictDto>> GetDistrictsByCityIdAsync(Guid cityId, CancellationToken cancellationToken = default);
    Task<DistrictDto?> GetDistrictByIdAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IApartmentService
{
    Task<ApartmentListDto> GetApartmentsAsync(
        Guid? districtId = null,
        Guid? cityId = null,
        ApartmentFilters? filters = null,
        int page = 1,
        int limit = 20,
        CancellationToken cancellationToken = default);
    
    Task<ApartmentDto?> GetApartmentByIdAsync(Guid id, CancellationToken cancellationToken = default);
}

public sealed class CityService : ICityService
{
    private readonly ICityRepository _cityRepository;

    public CityService(ICityRepository cityRepository)
    {
        _cityRepository = cityRepository;
    }

    public async Task<IReadOnlyList<CityDto>> GetAllCitiesAsync(CancellationToken cancellationToken = default)
    {
        var cities = await _cityRepository.GetAllAsync(onlyActive: true, cancellationToken);
        return cities.Select(c => new CityDto(
            c.Id, c.Name, c.Description, c.IsActive, c.CreatedAt, c.UpdatedAt)).ToList();
    }

    public async Task<CityDto?> GetCityByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var cities = await GetAllCitiesAsync(cancellationToken);
        return cities.FirstOrDefault(c => c.Id == id);
    }
}

public sealed class DistrictService : IDistrictService
{
    private readonly IDistrictRepository _districtRepository;

    public DistrictService(IDistrictRepository districtRepository)
    {
        _districtRepository = districtRepository;
    }

    public async Task<IReadOnlyList<DistrictDto>> GetDistrictsByCityIdAsync(Guid cityId, CancellationToken cancellationToken = default)
    {
        var districts = await _districtRepository.GetByCityIdAsync(cityId, onlyActive: true, cancellationToken);
        return districts.Select(d => new DistrictDto(
            d.Id, d.CityId, d.Name, d.Description, d.Photos, d.IsActive, d.CreatedAt, d.UpdatedAt)).ToList();
    }

    public async Task<DistrictDto?> GetDistrictByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var district = await _districtRepository.GetByIdAsync(id, cancellationToken);
        if (district is null) return null;

        return new DistrictDto(
            district.Id, district.CityId, district.Name, district.Description, 
            district.Photos, district.IsActive, district.CreatedAt, district.UpdatedAt);
    }
}

public sealed class ApartmentService : IApartmentService
{
    private readonly IApartmentRepository _apartmentRepository;

    public ApartmentService(IApartmentRepository apartmentRepository)
    {
        _apartmentRepository = apartmentRepository;
    }

    public async Task<ApartmentListDto> GetApartmentsAsync(
        Guid? districtId = null,
        Guid? cityId = null,
        ApartmentFilters? filters = null,
        int page = 1,
        int limit = 20,
        CancellationToken cancellationToken = default)
    {
        var result = await _apartmentRepository.GetPagedListAsync(
            districtId: districtId,
            cityId: cityId,
            finishing: filters?.Finishing,
            rooms: filters?.Rooms,
            priceMin: filters?.PriceMin,
            priceMax: filters?.PriceMax,
            areaMin: filters?.AreaMin,
            areaMax: filters?.AreaMax,
            page: page,
            limit: limit,
            sort: filters?.Sort ?? "created_desc",
            cancellationToken: cancellationToken);

        return new ApartmentListDto(
            result.Apartments.Select(a => new ApartmentDto(
                a.Id, a.DistrictId, a.Name, a.Finishing.ToString(), a.Rooms, a.Area, 
                a.Floor, a.Price, a.Photos, a.IsActive, a.CreatedAt, a.UpdatedAt)).ToList(),
            result.Total,
            result.TotalPages,
            result.CurrentPage);
    }

    public async Task<ApartmentDto?> GetApartmentByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var apartment = await _apartmentRepository.GetByIdAsync(id, cancellationToken);
        if (apartment is null) return null;

        return new ApartmentDto(
            apartment.Id, apartment.DistrictId, apartment.Name, apartment.Finishing.ToString(),
            apartment.Rooms, apartment.Area, apartment.Floor, apartment.Price,
            apartment.Photos, apartment.IsActive, apartment.CreatedAt, apartment.UpdatedAt);
    }
}

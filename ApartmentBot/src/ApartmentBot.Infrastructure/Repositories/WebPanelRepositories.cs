using ApartmentBot.Domain.Entities;
using ApartmentBot.Domain.Interfaces;
using ApartmentBot.Infrastructure.ApiClient;
using ApartmentBot.Infrastructure.Caching;

namespace ApartmentBot.Infrastructure.Repositories;

public sealed class WebPanelCityRepository : ICityRepository
{
    private readonly IWebPanelApiClient _apiClient;
    private readonly ICacheService _cacheService;
    private readonly TimeSpan _cacheExpiration = TimeSpan.FromHours(1);
    public WebPanelCityRepository(IWebPanelApiClient apiClient, ICacheService cacheService)
    {
        _apiClient = apiClient;
        _cacheService = cacheService;
    }

    public async Task<IReadOnlyList<City>> GetAllAsync(bool onlyActive = true, CancellationToken cancellationToken = default)
    {
        var cacheKey = CacheKeys.CitiesAll();
        var cached = await _cacheService.GetAsync<IReadOnlyList<City>>(cacheKey, cancellationToken);
        if (cached is not null && cached.Count > 0)
        {
            return cached;
        }

        var cities = await _apiClient.GetCitiesAsync(cancellationToken);

        if (cities.Count > 0)
        {
            await _cacheService.SetAsync(cacheKey, cities, _cacheExpiration, cancellationToken);
        }

        return cities;
    }

    public async Task<City?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var cities = await GetAllAsync(cancellationToken: cancellationToken);
        return cities.FirstOrDefault(c => c.Id == id);
    }
}

public sealed class WebPanelDistrictRepository : IDistrictRepository
{
    private readonly IWebPanelApiClient _apiClient;
    private readonly ICacheService _cacheService;
    private readonly TimeSpan _cacheExpiration = TimeSpan.FromHours(1);

    public WebPanelDistrictRepository(IWebPanelApiClient apiClient, ICacheService cacheService)
    {
        _apiClient = apiClient;
        _cacheService = cacheService;
    }

    public async Task<IReadOnlyList<District>> GetByCityIdAsync(Guid cityId, bool onlyActive = true, CancellationToken cancellationToken = default)
    {
        var cacheKey = CacheKeys.DistrictsByCity(cityId);
        var cached = await _cacheService.GetAsync<IReadOnlyList<District>>(cacheKey, cancellationToken);
        if (cached is not null && cached.Count > 0)
        {
            return cached;
        }

        var districts = await _apiClient.GetDistrictsByCityIdAsync(cityId, cancellationToken);

        if (districts.Count > 0)
        {
            await _cacheService.SetAsync(cacheKey, districts, _cacheExpiration, cancellationToken);
        }

        return districts;
    }

    public async Task<District?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var cities = await _apiClient.GetCitiesAsync(cancellationToken);

        foreach (var city in cities)
        {
            var districts = await _apiClient.GetDistrictsByCityIdAsync(city.Id, cancellationToken);

            var district = districts.FirstOrDefault(d => d.Id == id);
            if (district is not null)
            {
                return district;
            }
        }

        return null;
    }
}

public sealed class WebPanelApartmentRepository : IApartmentRepository
{
    private readonly IWebPanelApiClient _apiClient;
    private readonly ICacheService _cacheService;
    private readonly TimeSpan _cacheExpiration = TimeSpan.FromMinutes(5);

    public WebPanelApartmentRepository(IWebPanelApiClient apiClient, ICacheService cacheService)
    {
        _apiClient = apiClient;
        _cacheService = cacheService;
    }

    public async Task<ApartmentPagedList> GetPagedListAsync(
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
        var cacheKey = CacheKeys.ApartmentsPage(districtId, cityId, finishing, rooms, priceMin, priceMax, areaMin, areaMax, page, limit, sort);

        var cached = await _cacheService.GetAsync<ApartmentPagedList>(cacheKey, cancellationToken);
        if (cached is not null)
        {
            return cached;
        }

        var result = await _apiClient.GetApartmentsAsync(
            districtId: districtId,
            cityId: cityId,
            finishing: finishing,
            rooms: rooms,
            priceMin: priceMin,
            priceMax: priceMax,
            areaMin: areaMin,
            areaMax: areaMax,
            page: page,
            limit: limit,
            sort: sort,
            cancellationToken: cancellationToken);

        if (result.Apartments.Count > 0 || result.Total > 0)
        {
            await _cacheService.SetAsync(cacheKey, result, _cacheExpiration, cancellationToken);
        }

        return result;
    }

    public async Task<Apartment?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _apiClient.GetApartmentByIdAsync(id, cancellationToken);
    }
}

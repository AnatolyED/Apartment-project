using ApartmentBot.Domain.Entities;
using ApartmentBot.Domain.Interfaces;
using ApartmentBot.Infrastructure.ApiClient;

namespace ApartmentBot.Infrastructure.Repositories;

public sealed class WebPanelCityRepository : ICityRepository
{
    private readonly IWebPanelApiClient _apiClient;

    public WebPanelCityRepository(IWebPanelApiClient apiClient)
    {
        _apiClient = apiClient;
    }

    public async Task<IReadOnlyList<City>> GetAllAsync(bool onlyActive = true, CancellationToken cancellationToken = default)
    {
        return await _apiClient.GetCitiesAsync(cancellationToken);
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

    public WebPanelDistrictRepository(IWebPanelApiClient apiClient)
    {
        _apiClient = apiClient;
    }

    public async Task<IReadOnlyList<District>> GetByCityIdAsync(Guid cityId, bool onlyActive = true, CancellationToken cancellationToken = default)
    {
        return await _apiClient.GetDistrictsByCityIdAsync(cityId, cancellationToken);
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

    public WebPanelApartmentRepository(IWebPanelApiClient apiClient)
    {
        _apiClient = apiClient;
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
        return await _apiClient.GetApartmentsAsync(
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
    }

    public async Task<Apartment?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _apiClient.GetApartmentByIdAsync(id, cancellationToken);
    }
}

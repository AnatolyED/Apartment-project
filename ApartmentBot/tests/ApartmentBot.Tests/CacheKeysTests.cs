using ApartmentBot.Domain.Entities;
using ApartmentBot.Infrastructure.Caching;

namespace ApartmentBot.Tests;

public sealed class CacheKeysTests
{
    [Fact]
    public void ApartmentsPage_BuildsDeterministicReadableKey()
    {
        var key = CacheKeys.ApartmentsPage(
            districtId: Guid.Parse("11111111-1111-1111-1111-111111111111"),
            cityId: Guid.Parse("22222222-2222-2222-2222-222222222222"),
            finishing: FinishingType.БезОтделки,
            rooms: "2 комнаты",
            priceMin: 10000000m,
            priceMax: 20000000m,
            areaMin: 40.5m,
            areaMax: 80m,
            page: 3,
            limit: 20,
            sort: "price:asc");

        Assert.Equal(
            "apartments:city:22222222-2222-2222-2222-222222222222:district:11111111-1111-1111-1111-111111111111:finishing:БезОтделки:rooms:2_комнаты:priceMin:10000000:priceMax:20000000:areaMin:40.5:areaMax:80:page:3:limit:20:sort:price_asc",
            key);
    }

    [Fact]
    public void ApartmentsPage_UsesNoneForMissingValues()
    {
        var key = CacheKeys.ApartmentsPage(
            districtId: null,
            cityId: null,
            finishing: null,
            rooms: null,
            priceMin: null,
            priceMax: null,
            areaMin: null,
            areaMax: null,
            page: 1,
            limit: 10,
            sort: "created_desc");

        Assert.Equal(
            "apartments:city:none:district:none:finishing:none:rooms:none:priceMin:none:priceMax:none:areaMin:none:areaMax:none:page:1:limit:10:sort:created_desc",
            key);
    }
}

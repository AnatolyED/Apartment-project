using System.Net;
using System.Text;
using ApartmentBot.Domain.Entities;
using ApartmentBot.Infrastructure.ApiClient;
using Microsoft.Extensions.Logging.Abstractions;

namespace ApartmentBot.Tests;

public sealed class WebPanelApiClientTests
{
    [Fact]
    public async Task GetCitiesAsync_SendsBotViewAndMapsCompactResponse()
    {
        var handler = new RecordingHttpMessageHandler(
            """
            {
              "success": true,
              "data": {
                "cities": [
                  {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "name": "Владивосток",
                    "description": "Тестовый город"
                  }
                ],
                "total": 1
              }
            }
            """);
        var client = CreateClient(handler);

        var cities = await client.GetCitiesAsync();

        Assert.Single(cities);
        Assert.Equal("Владивосток", cities[0].Name);
        Assert.Equal("Тестовый город", cities[0].Description);
        Assert.NotNull(handler.LastRequestUri);
        Assert.Equal("/api/cities", handler.LastRequestUri!.AbsolutePath);
        Assert.Equal("100", GetQueryValue(handler.LastRequestUri, "limit"));
        Assert.Equal("true", GetQueryValue(handler.LastRequestUri, "isActive"));
        Assert.Equal("bot", GetQueryValue(handler.LastRequestUri, "view"));
    }

    [Fact]
    public async Task GetApartmentsAsync_SendsSortAndBotView()
    {
        var handler = new RecordingHttpMessageHandler(
            """
            {
              "success": true,
              "data": {
                "apartments": [
                  {
                    "id": "22222222-2222-2222-2222-222222222222",
                    "districtId": "33333333-3333-3333-3333-333333333333",
                    "name": "Квартира №7",
                    "finishing": "Без отделки",
                    "rooms": "2",
                    "area": 54.5,
                    "floor": 9,
                    "price": 12500000,
                    "photos": ["/uploads/apartments/test/photo.jpg"]
                  }
                ],
                "total": 1,
                "totalPages": 1,
                "currentPage": 2
              }
            }
            """);
        var client = CreateClient(handler);

        var result = await client.GetApartmentsAsync(
            districtId: Guid.Parse("33333333-3333-3333-3333-333333333333"),
            finishing: FinishingType.БезОтделки,
            page: 2,
            limit: 10,
            sort: "price_asc");

        Assert.Single(result.Apartments);
        Assert.Equal("Квартира №7", result.Apartments[0].Name);
        Assert.Equal(54.5m, result.Apartments[0].Area);
        Assert.Equal(1, result.Total);
        Assert.NotNull(handler.LastRequestUri);
        Assert.Equal("/api/apartments", handler.LastRequestUri!.AbsolutePath);
        Assert.Equal("bot", GetQueryValue(handler.LastRequestUri, "view"));
        Assert.Equal("price_asc", GetQueryValue(handler.LastRequestUri, "sort"));
        Assert.Equal("10", GetQueryValue(handler.LastRequestUri, "limit"));
        Assert.Equal("2", GetQueryValue(handler.LastRequestUri, "page"));
    }

    [Fact]
    public async Task GetApartmentByIdAsync_UsesBotViewParameter()
    {
        var apartmentId = Guid.Parse("44444444-4444-4444-4444-444444444444");
        var handler = new RecordingHttpMessageHandler(
            """
            {
              "success": true,
              "data": {
                "apartments": [
                  {
                    "id": "44444444-4444-4444-4444-444444444444",
                    "districtId": "55555555-5555-5555-5555-555555555555",
                    "name": "Квартира №4",
                    "finishing": "Чистовая",
                    "rooms": "1",
                    "area": 38.2,
                    "floor": 5,
                    "price": 8700000,
                    "photos": ["/uploads/apartments/test/photo-4.jpg"]
                  }
                ]
              }
            }
            """);
        var client = CreateClient(handler);

        var apartment = await client.GetApartmentByIdAsync(apartmentId);

        Assert.NotNull(apartment);
        Assert.Equal(apartmentId, apartment!.Id);
        Assert.Equal("Квартира №4", apartment.Name);
        Assert.NotNull(handler.LastRequestUri);
        Assert.Equal($"/api/apartments/{apartmentId}", handler.LastRequestUri!.AbsolutePath);
        Assert.Equal("bot", GetQueryValue(handler.LastRequestUri, "view"));
    }

    private static WebPanelApiClient CreateClient(RecordingHttpMessageHandler handler)
    {
        var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("http://localhost:3000/api/")
        };

        return new WebPanelApiClient(httpClient, NullLogger<WebPanelApiClient>.Instance);
    }

    private static string? GetQueryValue(Uri uri, string key)
    {
        var query = uri.Query.TrimStart('?');
        if (string.IsNullOrWhiteSpace(query))
        {
            return null;
        }

        foreach (var part in query.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var tokens = part.Split('=', 2);
            if (tokens.Length == 2 && Uri.UnescapeDataString(tokens[0]) == key)
            {
                return Uri.UnescapeDataString(tokens[1]);
            }
        }

        return null;
    }

    private sealed class RecordingHttpMessageHandler(string json) : HttpMessageHandler
    {
        private readonly string _json = json;

        public Uri? LastRequestUri { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            LastRequestUri = request.RequestUri;

            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_json, Encoding.UTF8, "application/json")
            });
        }
    }
}

using ApartmentBot.Domain.Entities;

namespace ApartmentBot.Domain.Interfaces;

public interface IUserStateRepository
{
    Task<UserState?> GetAsync(long userId, CancellationToken cancellationToken = default);
    Task SetAsync(long userId, UserState state, CancellationToken cancellationToken = default);
    Task RemoveAsync(long userId, CancellationToken cancellationToken = default);
}

public enum BotStep
{
    Start = 0,
    SelectCity = 1,
    SelectSearchMode = 2,
    SelectDistrict = 3,
    ViewApartments = 4,
    FilterInput = 5,
    FilterPriceMin = 6,
    FilterPriceMax = 7,
    FilterAreaMin = 8,
    FilterAreaMax = 9,
    ContactManager = 10,
    ConsultationName = 11,
    ConsultationPhone = 12
}

public enum ApartmentSearchMode
{
    ByDistrict = 0,
    ByCity = 1
}

public sealed class UserState
{
    public Guid? SelectedCityId { get; set; }
    public Guid? SelectedDistrictId { get; set; }
    public ApartmentSearchMode SearchMode { get; set; } = ApartmentSearchMode.ByDistrict;
    public ApartmentFilters CurrentFilters { get; set; } = new();
    public int CurrentPage { get; set; } = 1;
    public BotStep CurrentStep { get; set; } = BotStep.Start;
    public string? PendingInput { get; set; }
    public string? SelectedCityName { get; set; }
    public string? SelectedDistrictName { get; set; }
    public string? SelectedDistrictPhotoUrl { get; set; }
    public Guid? DistrictPhotoShownForDistrictId { get; set; }
    public string? DistrictPhotoShownForPhotoUrl { get; set; }
    public Guid? ApartmentPhotoShownForApartmentId { get; set; }
    public string? ApartmentPhotoShownForPhotoUrl { get; set; }
    public string? RequestedApartmentName { get; set; }
    public string? SelectedApartmentSummary { get; set; }
    public string? ConsultationClientName { get; set; }
    public int? LeadRequestMessageId { get; set; }
    public int? LeadContactPromptMessageId { get; set; }
    public DateTime LastActivityTime { get; set; } = DateTime.UtcNow;
    public Guid? SelectedApartmentId { get; set; }
}

public sealed class ApartmentFilters
{
    public FinishingType? Finishing { get; set; }
    public string? Rooms { get; set; }
    public decimal? PriceMin { get; set; }
    public decimal? PriceMax { get; set; }
    public decimal? AreaMin { get; set; }
    public decimal? AreaMax { get; set; }
    public string Sort { get; set; } = "created_desc";

    public bool HasActiveFilters =>
        Finishing.HasValue ||
        !string.IsNullOrEmpty(Rooms) ||
        PriceMin.HasValue ||
        PriceMax.HasValue ||
        AreaMin.HasValue ||
        AreaMax.HasValue;

    public void Reset()
    {
        Finishing = null;
        Rooms = null;
        PriceMin = null;
        PriceMax = null;
        AreaMin = null;
        AreaMax = null;
        Sort = "created_desc";
    }
}

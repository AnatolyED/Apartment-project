namespace ApartmentBot.Domain.Entities;

public enum FinishingType
{
    Unknown = 0,
    Чистовая = 1,
    ВайтБокс = 2,
    БезОтделки = 3
}

public sealed class Apartment
{
    public Guid Id { get; init; }
    public Guid DistrictId { get; init; }
    public string Name { get; init; } = string.Empty;
    public FinishingType Finishing { get; init; }
    public string Rooms { get; init; } = string.Empty;
    public decimal Area { get; init; }
    public int Floor { get; init; }
    public decimal Price { get; init; }
    public IReadOnlyList<string> Photos { get; init; } = [];
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
}

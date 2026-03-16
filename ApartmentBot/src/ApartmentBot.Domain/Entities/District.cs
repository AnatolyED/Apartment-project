namespace ApartmentBot.Domain.Entities;

public sealed class District
{
    public Guid Id { get; init; }
    public Guid CityId { get; init; }
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public IReadOnlyList<string> Photos { get; init; } = [];
    public bool IsActive { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
}

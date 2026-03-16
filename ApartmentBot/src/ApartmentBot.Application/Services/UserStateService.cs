using ApartmentBot.Domain.Interfaces;

namespace ApartmentBot.Application.Services;

public interface IUserStateService
{
    Task<UserState> GetStateAsync(long userId, CancellationToken cancellationToken = default);
    Task SetStateAsync(long userId, UserState state, CancellationToken cancellationToken = default);
    Task ClearStateAsync(long userId, CancellationToken cancellationToken = default);
}

public sealed class UserStateService : IUserStateService
{
    private readonly IUserStateRepository _userStateRepository;

    public UserStateService(IUserStateRepository userStateRepository)
    {
        _userStateRepository = userStateRepository;
    }

    public async Task<UserState> GetStateAsync(long userId, CancellationToken cancellationToken = default)
    {
        var state = await _userStateRepository.GetAsync(userId, cancellationToken);
        return state ?? new UserState();
    }

    public async Task SetStateAsync(long userId, UserState state, CancellationToken cancellationToken = default)
    {
        await _userStateRepository.SetAsync(userId, state, cancellationToken);
    }

    public async Task ClearStateAsync(long userId, CancellationToken cancellationToken = default)
    {
        await _userStateRepository.RemoveAsync(userId, cancellationToken);
    }
}

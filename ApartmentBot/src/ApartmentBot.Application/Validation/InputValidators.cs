using FluentValidation;

namespace ApartmentBot.Application.Validation;

public sealed class PriceInputValidator : AbstractValidator<string>
{
    public PriceInputValidator()
    {
        RuleFor(x => x)
            .NotEmpty().WithMessage("Введите цену")
            .Matches(@"^\d+$").WithMessage("Цена должна быть числом")
            .Must(BeValidPrice).WithMessage("Цена должна быть в диапазоне от 0 до 1 000 000 000");
    }
    
    private static bool BeValidPrice(string price)
    {
        return decimal.TryParse(price, out var value) && value >= 0 && value <= 1_000_000_000;
    }
}

public sealed class AreaInputValidator : AbstractValidator<string>
{
    public AreaInputValidator()
    {
        RuleFor(x => x)
            .NotEmpty().WithMessage("Введите площадь")
            .Matches(@"^\d+(\.\d+)?$").WithMessage("Площадь должна быть числом")
            .Must(BeValidArea).WithMessage("Площадь должна быть в диапазоне от 0 до 1000 м²");
    }
    
    private static bool BeValidArea(string area)
    {
        return decimal.TryParse(area, out var value) && value >= 0 && value <= 1000;
    }
}

public sealed class FloorInputValidator : AbstractValidator<string>
{
    public FloorInputValidator()
    {
        RuleFor(x => x)
            .NotEmpty().WithMessage("Введите этаж")
            .Matches(@"^\d+$").WithMessage("Этаж должен быть числом")
            .Must(BeValidFloor).WithMessage("Этаж должен быть в диапазоне от 1 до 100");
    }
    
    private static bool BeValidFloor(string floor)
    {
        return int.TryParse(floor, out var value) && value >= 1 && value <= 100;
    }
}

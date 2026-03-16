using ApartmentBot.Application.DTOs;
using ApartmentBot.Bot.CallbackData;
using ApartmentBot.Domain.Entities;
using ApartmentBot.Domain.Interfaces;
using Telegram.Bot.Types.ReplyMarkups;

namespace ApartmentBot.Bot.Keyboards;

public static class KeyboardFactory
{
    public static InlineKeyboardMarkup CreateCityKeyboard(IReadOnlyList<CityDto> cities)
    {
        var buttons = cities.Select(c => new[]
        {
            InlineKeyboardButton.WithCallbackData(c.Name, new CityCallbackData { CityId = c.Id }.ToCallbackData())
        }).ToList();

        buttons.Add(
        [
            InlineKeyboardButton.WithCallbackData("🔙 Назад", "nav:back_to_start")
        ]);

        return new InlineKeyboardMarkup(buttons);
    }

    public static InlineKeyboardMarkup CreateDistrictKeyboard(IReadOnlyList<DistrictDto> districts, Guid? cityId = null)
    {
        var buttons = districts.Select(d => new[]
        {
            InlineKeyboardButton.WithCallbackData(d.Name, new DistrictCallbackData { DistrictId = d.Id }.ToCallbackData())
        }).ToList();

        buttons.Add(
        [
            InlineKeyboardButton.WithCallbackData("🔙 Назад к городам", $"nav:back_to_cities:{cityId}"),
            InlineKeyboardButton.WithCallbackData("🏠 В начало", "nav:back_to_start")
        ]);

        return new InlineKeyboardMarkup(buttons);
    }

    public static InlineKeyboardMarkup CreateApartmentListNavigationKeyboard(int currentPage, int totalPages, bool hasFilters)
    {
        var keyboard = new List<List<InlineKeyboardButton>>();

        var navRow = new List<InlineKeyboardButton>();
        if (currentPage > 1)
        {
            navRow.Add(InlineKeyboardButton.WithCallbackData("⬅️", new PageCallbackData { PageNumber = currentPage - 1 }.ToCallbackData()));
        }

        navRow.Add(InlineKeyboardButton.WithCallbackData($"Стр. {currentPage}/{totalPages}", "ignore"));

        if (currentPage < totalPages)
        {
            navRow.Add(InlineKeyboardButton.WithCallbackData("➡️", new PageCallbackData { PageNumber = currentPage + 1 }.ToCallbackData()));
        }

        keyboard.Add(navRow);

        var actionRow = new List<InlineKeyboardButton>
        {
            InlineKeyboardButton.WithCallbackData("🔍 Фильтры", "apartments_filter:menu"),
            InlineKeyboardButton.WithCallbackData("🔙 Назад", "nav:back_to_districts")
        };

        if (hasFilters)
        {
            actionRow.Add(InlineKeyboardButton.WithCallbackData("❌ Сбросить", "filter:reset"));
        }

        keyboard.Add(actionRow);

        return new InlineKeyboardMarkup(keyboard);
    }

    public static InlineKeyboardMarkup CreateApartmentDetailsKeyboard(long? managerChatId = null, bool hasGallery = false)
    {
        var contactButton = managerChatId.HasValue
            ? InlineKeyboardButton.WithUrl("Связаться с менеджером", $"tg://user?id={managerChatId.Value}")
            : InlineKeyboardButton.WithCallbackData("Связаться с менеджером", "apt:contact");

        var keyboard = new List<List<InlineKeyboardButton>>
        {
            new()
            {
                contactButton,
                InlineKeyboardButton.WithCallbackData("Получить консультацию", "apt:consultation")
            }
        };

        if (hasGallery)
        {
            keyboard.Add(
            [
                InlineKeyboardButton.WithCallbackData("Показать все фото", "apt:gallery")
            ]);
        }

        keyboard.Add(
        [
            InlineKeyboardButton.WithCallbackData("Назад к списку", "nav:back_to_apartments")
        ]);

        return new InlineKeyboardMarkup(keyboard);
    }

    public static InlineKeyboardMarkup CreateFilterKeyboard(ApartmentFilters currentFilters)
    {
        var keyboard = new List<List<InlineKeyboardButton>>
        {
            new()
            {
                InlineKeyboardButton.WithCallbackData(
                    $"Отделка: {FormatFinishing(currentFilters.Finishing)}",
                    new FilterCallbackData { FilterType = "finishing" }.ToCallbackData())
            },
            new()
            {
                InlineKeyboardButton.WithCallbackData(
                    $"Комнаты: {currentFilters.Rooms ?? "Любые"}",
                    new FilterCallbackData { FilterType = "rooms" }.ToCallbackData())
            },
            new()
            {
                InlineKeyboardButton.WithCallbackData(
                    $"Цена: {currentFilters.PriceMin?.ToString("N0") ?? "0"} - {currentFilters.PriceMax?.ToString("N0") ?? "∞"}",
                    new FilterCallbackData { FilterType = "price" }.ToCallbackData()),
                InlineKeyboardButton.WithCallbackData(
                    $"Площадь: {currentFilters.AreaMin?.ToString("F1") ?? "0"} - {currentFilters.AreaMax?.ToString("F1") ?? "∞"}",
                    new FilterCallbackData { FilterType = "area" }.ToCallbackData())
            },
            new()
            {
                InlineKeyboardButton.WithCallbackData("✅ Применить", new NavigationCallbackData { Action = "apply_filters" }.ToCallbackData()),
                InlineKeyboardButton.WithCallbackData("❌ Сбросить", new FilterCallbackData { FilterType = "reset" }.ToCallbackData())
            },
            new()
            {
                InlineKeyboardButton.WithCallbackData("🔙 Назад", new FilterCallbackData { FilterType = "back" }.ToCallbackData())
            }
        };

        return new InlineKeyboardMarkup(keyboard);
    }

    public static InlineKeyboardMarkup CreateFinishingKeyboard()
    {
        return new InlineKeyboardMarkup(new[]
        {
            new[]
            {
                InlineKeyboardButton.WithCallbackData("Чистовая", new FilterCallbackData { FilterType = "finishing", Value = "Чистовая" }.ToCallbackData())
            },
            new[]
            {
                InlineKeyboardButton.WithCallbackData("Вайт бокс", new FilterCallbackData { FilterType = "finishing", Value = "Вайт бокс" }.ToCallbackData())
            },
            new[]
            {
                InlineKeyboardButton.WithCallbackData("Без отделки", new FilterCallbackData { FilterType = "finishing", Value = "Без отделки" }.ToCallbackData())
            },
            new[]
            {
                InlineKeyboardButton.WithCallbackData("Любая", new FilterCallbackData { FilterType = "finishing", Value = "Любая" }.ToCallbackData())
            },
            new[]
            {
                InlineKeyboardButton.WithCallbackData("🔙 Назад", new FilterCallbackData { FilterType = "menu" }.ToCallbackData())
            }
        });
    }

    public static InlineKeyboardMarkup CreateRoomsKeyboard()
    {
        return new InlineKeyboardMarkup(new[]
        {
            new[]
            {
                InlineKeyboardButton.WithCallbackData("Студия", new FilterCallbackData { FilterType = "rooms", Value = "Студия" }.ToCallbackData()),
                InlineKeyboardButton.WithCallbackData("1", new FilterCallbackData { FilterType = "rooms", Value = "1" }.ToCallbackData()),
                InlineKeyboardButton.WithCallbackData("2", new FilterCallbackData { FilterType = "rooms", Value = "2" }.ToCallbackData())
            },
            new[]
            {
                InlineKeyboardButton.WithCallbackData("3", new FilterCallbackData { FilterType = "rooms", Value = "3" }.ToCallbackData()),
                InlineKeyboardButton.WithCallbackData("4+", new FilterCallbackData { FilterType = "rooms", Value = "4+" }.ToCallbackData())
            },
            new[]
            {
                InlineKeyboardButton.WithCallbackData("🔙 Назад", new FilterCallbackData { FilterType = "menu" }.ToCallbackData())
            }
        });
    }

    public static ReplyKeyboardMarkup CreateCancelKeyboard()
    {
        return new ReplyKeyboardMarkup(new[]
        {
            new[] { new KeyboardButton("❌ Отмена") }
        })
        {
            ResizeKeyboard = true,
            OneTimeKeyboard = true
        };
    }

    private static string FormatFinishing(FinishingType? finishing) => finishing switch
    {
        FinishingType.Чистовая => "Чистовая",
        FinishingType.ВайтБокс => "Вайт бокс",
        FinishingType.БезОтделки => "Без отделки",
        _ => "Любая"
    };
}

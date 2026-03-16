using ApartmentBot.Application.Services;
using ApartmentBot.Bot;
using ApartmentBot.Bot.Diagnostics;
using ApartmentBot.Bot.Handlers;
using ApartmentBot.Bot.Services;
using ApartmentBot.Infrastructure;
using ApartmentBot.Infrastructure.Configuration;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using System.Text.Json;
using Telegram.Bot;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);
builder.WebHost.UseUrls(builder.Configuration["Diagnostics:Urls"] ?? "http://0.0.0.0:8080");

// Infrastructure
builder.Services.AddInfrastructure(builder.Configuration);

// Application Services
builder.Services.AddSingleton<ICityService, CityService>();
builder.Services.AddSingleton<IDistrictService, DistrictService>();
builder.Services.AddSingleton<IApartmentService, ApartmentService>();
builder.Services.AddSingleton<IUserStateService, UserStateService>();

// Bot
builder.Services.AddSingleton<ITelegramRuntimeStatusTracker, TelegramRuntimeStatusTracker>();
builder.Services.AddSingleton<ILeadRequestService, LeadRequestService>();
builder.Services.AddSingleton<IFilterWorkflowService, FilterWorkflowService>();
builder.Services.AddSingleton<IApartmentNavigationService, ApartmentNavigationService>();
builder.Services.AddSingleton<IApartmentMessageFormatter, ApartmentMessageFormatter>();
builder.Services.AddSingleton<ITelegramMediaService, TelegramMediaService>();
builder.Services.AddSingleton<ITelegramRetryService, TelegramRetryService>();
builder.Services.AddSingleton<ITelegramUpdateDeduplicationService, TelegramUpdateDeduplicationService>();
builder.Services.AddSingleton<ITelegramMessageService, TelegramMessageService>();
builder.Services.AddSingleton<IApartmentPresentationService, ApartmentPresentationService>();
builder.Services.AddSingleton<IBotHandler, TelegramBotHandler>();
builder.Services.AddSingleton<ITelegramBotRuntime, TelegramBotRuntime>();
builder.Services.AddSingleton<ITelegramBotClient>(sp =>
{
    var settings = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<TelegramSettings>>().Value;

    if (string.IsNullOrWhiteSpace(settings.BotToken))
    {
        throw new InvalidOperationException(
            "Telegram Bot token is not configured. Set Telegram:BotToken in appsettings.Local.json, user-secrets, or environment variables.");
    }

    if (!settings.BotToken.Contains(':'))
    {
        throw new InvalidOperationException(
            "Telegram Bot token has an invalid format. Check Telegram:BotToken in your local configuration.");
    }

    var httpClient = new HttpClient
    {
        Timeout = TimeSpan.FromSeconds(15)
    };

    return new TelegramBotClient(settings.BotToken, httpClient);
});

// Hosted Service
builder.Services.AddHostedService<BotHostedService>();

// Diagnostics
builder.Services.AddHealthChecks()
    .AddCheck<TelegramRuntimeHealthCheck>("telegram-runtime", tags: ["ready"])
    .AddCheck<RedisConnectionHealthCheck>("redis", tags: ["ready"])
    .AddCheck<WebPanelApiHealthCheck>("web-panel-api", tags: ["ready"]);

// Logging
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.SetMinimumLevel(LogLevel.Information);

var app = builder.Build();

app.MapGet("/", () => Results.Ok(new
{
    service = "ApartmentBot",
    status = "running",
    diagnostics = new[]
    {
        "/health/live",
        "/health/ready",
        "/diagnostics/runtime"
    }
}));

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false,
    ResponseWriter = WriteHealthResponseAsync
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = registration => registration.Tags.Contains("ready"),
    ResponseWriter = WriteHealthResponseAsync
});

app.MapGet("/diagnostics/runtime", (ITelegramRuntimeStatusTracker tracker) =>
{
    var snapshot = tracker.GetSnapshot();
    return Results.Ok(snapshot);
});

app.MapGet(
    "/diagnostics/summary",
    async (
        HealthCheckService healthCheckService,
        ITelegramRuntimeStatusTracker tracker,
        CancellationToken cancellationToken) =>
    {
        var report = await healthCheckService.CheckHealthAsync(
            registration => registration.Tags.Contains("ready"),
            cancellationToken);

        var snapshot = tracker.GetSnapshot();
        var summary = new
        {
            overallStatus = report.Status.ToString(),
            generatedAtUtc = DateTimeOffset.UtcNow,
            telegram = new
            {
                state = snapshot.State.ToString(),
                botUsername = snapshot.BotUsername,
                lastFailureReason = snapshot.LastFailureReason,
                lastSuccessfulStartAtUtc = snapshot.LastSuccessfulStartAtUtc,
                lastUpdateHandledAtUtc = snapshot.LastUpdateHandledAtUtc
            },
            dependencies = report.Entries.ToDictionary(
                pair => pair.Key,
                pair => new
                {
                    status = pair.Value.Status.ToString(),
                    description = pair.Value.Description
                }),
            hints = BuildDiagnosticsHints(report, snapshot)
        };

        return Results.Ok(summary);
    });

app.Run();

static Task WriteHealthResponseAsync(HttpContext context, HealthReport report)
{
    context.Response.ContentType = "application/json; charset=utf-8";

    var payload = new
    {
        status = report.Status.ToString(),
        totalDurationMs = report.TotalDuration.TotalMilliseconds,
        entries = report.Entries.ToDictionary(
            pair => pair.Key,
            pair => new
            {
                status = pair.Value.Status.ToString(),
                description = pair.Value.Description,
                durationMs = pair.Value.Duration.TotalMilliseconds,
                exception = pair.Value.Exception?.Message,
                data = pair.Value.Data.ToDictionary(
                    dataPair => dataPair.Key,
                    dataPair => dataPair.Value)
            })
    };

    return context.Response.WriteAsync(JsonSerializer.Serialize(payload));
}

static string[] BuildDiagnosticsHints(HealthReport report, TelegramRuntimeSnapshot snapshot)
{
    var hints = new List<string>();

    if (snapshot.State == TelegramRuntimeState.Faulted && !string.IsNullOrWhiteSpace(snapshot.LastFailureReason))
    {
        hints.Add($"Telegram runtime в ошибке: {snapshot.LastFailureReason}");
    }

    foreach (var entry in report.Entries.Where(entry => entry.Value.Status != HealthStatus.Healthy))
    {
        hints.Add($"{entry.Key}: {entry.Value.Description}");
    }

    if (hints.Count == 0)
    {
        hints.Add("Все основные зависимости и Telegram runtime находятся в рабочем состоянии.");
    }

    return hints.ToArray();
}

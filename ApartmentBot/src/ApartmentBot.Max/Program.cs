using ApartmentBot.Max;
using ApartmentBot.Application.Services;
using ApartmentBot.Infrastructure;
using ApartmentBot.Infrastructure.Configuration;
using Max.Bot;
using Max.Bot.Configuration;
using Max.Bot.Polling;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);
builder.WebHost.UseUrls(builder.Configuration["Diagnostics:Urls"] ?? "http://0.0.0.0:8081");

builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddSingleton<ICityService, CityService>();
builder.Services.AddSingleton<IDistrictService, DistrictService>();
builder.Services.AddSingleton<IApartmentService, ApartmentService>();
builder.Services.AddSingleton<IUserStateService, UserStateService>();

builder.Services.AddSingleton<IMaxBotHandler, MaxBotHandler>();
builder.Services.AddSingleton<IUpdateHandler>(sp => sp.GetRequiredService<IMaxBotHandler>());
builder.Services.AddSingleton<IMaxBotRuntime, MaxBotRuntime>();
builder.Services.AddSingleton<MaxClient>(sp =>
{
    var settings = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<MaxSettings>>().Value;

    if (string.IsNullOrWhiteSpace(settings.BotToken))
    {
        throw new InvalidOperationException(
            "MAX Bot token is not configured. Set Max:BotToken in appsettings.Local.json or environment variables.");
    }

    var options = new MaxBotOptions
    {
        Token = settings.BotToken
    };

    return new MaxClient(options);
});

builder.Services.AddHostedService<MaxBotHostedService>();

builder.Services.AddHealthChecks()
    .AddCheck("max-config", () =>
    {
        var settings = builder.Configuration.GetSection(MaxSettings.SectionName).Get<MaxSettings>();
        return string.IsNullOrWhiteSpace(settings?.BotToken)
            ? HealthCheckResult.Degraded("MAX token is not configured.")
            : HealthCheckResult.Healthy("MAX token is configured.");
    }, tags: ["ready"]);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.SetMinimumLevel(LogLevel.Information);

var app = builder.Build();

app.MapGet("/", () => Results.Ok(new
{
    service = "ApartmentBot.Max",
    status = "running",
    diagnostics = new[]
    {
        "/health/live",
        "/health/ready"
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
                exception = pair.Value.Exception?.Message
            })
    };

    return context.Response.WriteAsync(JsonSerializer.Serialize(payload));
}

# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy solution and project files
COPY ["ApartmentBot.slnx", "./"]
COPY ["src/ApartmentBot.Domain/ApartmentBot.Domain.csproj", "src/ApartmentBot.Domain/"]
COPY ["src/ApartmentBot.Application/ApartmentBot.Application.csproj", "src/ApartmentBot.Application/"]
COPY ["src/ApartmentBot.Infrastructure/ApartmentBot.Infrastructure.csproj", "src/ApartmentBot.Infrastructure/"]
COPY ["src/ApartmentBot.Bot/ApartmentBot.Bot.csproj", "src/ApartmentBot.Bot/"]

# Restore dependencies
RUN dotnet restore "src/ApartmentBot.Bot/ApartmentBot.Bot.csproj"

# Copy source code
COPY . .

# Build and publish
WORKDIR "/src/src/ApartmentBot.Bot"
RUN dotnet publish "ApartmentBot.Bot.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Install dependencies for media processing and health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libgdiplus \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy published app
COPY --from=build /app/publish .

# Set environment
ENV ASPNETCORE_ENVIRONMENT=Production
ENV DOTNET_TieredGC=1

ENTRYPOINT ["dotnet", "ApartmentBot.Bot.dll"]

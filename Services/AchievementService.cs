using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Logging;

namespace BeeFlix.Profiles.Services;

/// <summary>
/// Calculates BeeFlix milestones from Jellyfin's per-user playback state and persists
/// permanent unlocks. BeeFlix never writes to Jellyfin playback data.
/// </summary>
public sealed class AchievementService
{
    private static readonly object ConfigurationLock = new();

    private static readonly AchievementDefinition[] MovieMilestones =
    [
        new("movie-reel-deal", "Reel Deal", "Watch 10 movies.", "Movies", 10),
        new("movie-double-feature", "Double Feature", "Watch 25 movies.", "Movies", 25),
        new("movie-popcorn-regular", "Popcorn Regular", "Watch 50 movies.", "Movies", 50),
        new("movie-film-enthusiast", "Film Enthusiast", "Watch 100 movies.", "Movies", 100),
        new("movie-film-buff", "Film Buff", "Watch 250 movies.", "Movies", 250),
        new("movie-movie-addict", "Movie Addict", "Watch 500 movies.", "Movies", 500),
        new("movie-master-archivist", "Master Archivist", "Watch 1,000 movies.", "Movies", 1000),
        new("movie-legendary-viewer", "Legendary Viewer", "Watch 2,500 movies.", "Movies", 2500)
    ];

    private static readonly AchievementDefinition[] SeriesMilestones =
    [
        new("tv-pilot-season", "Pilot Season", "Complete 1 series.", "TV", 1),
        new("tv-binge-watcher", "Binge Watcher", "Complete 5 series.", "TV", 5),
        new("tv-series-regular", "Series Regular", "Complete 10 series.", "TV", 10),
        new("tv-tv-enthusiast", "TV Enthusiast", "Complete 25 series.", "TV", 25),
        new("tv-small-screen-veteran", "Small Screen Veteran", "Complete 50 series.", "TV", 50),
        new("tv-television-legend", "Television Legend", "Complete 100 series.", "TV", 100),
        new("tv-ultimate-binger", "Ultimate Binger", "Complete 250 series.", "TV", 250)
    ];

    private readonly ILibraryManager _library;
    private readonly IUserDataManager _userData;
    private readonly ILogger<AchievementService> _logger;

    public AchievementService(ILibraryManager library, IUserDataManager userData, ILogger<AchievementService> logger)
    {
        _library = library;
        _userData = userData;
        _logger = logger;
    }

    public object GetAchievements(User user)
    {
        ArgumentNullException.ThrowIfNull(user);

        lock (ConfigurationLock)
        {
            var plugin = Plugin.Instance ?? throw new InvalidOperationException("BeeFlix Profiles is not initialized.");
            var configuration = plugin.Configuration;
            configuration.CompletedSeries ??= [];
            configuration.AchievementUnlocks ??= [];
            configuration.AchievementInitializedUsers ??= [];

            var completedSeriesBefore = configuration.CompletedSeries.Count;
            var movieCount = CountWatchedMovies(user);
            var completedSeriesCount = CountCompletedSeries(user);
            var changed = configuration.CompletedSeries.Count != completedSeriesBefore;
            var now = DateTimeOffset.UtcNow;
            var userId = user.Id.ToString("N");
            var previouslyInitialized = configuration.AchievementInitializedUsers.Contains(userId, StringComparer.OrdinalIgnoreCase);

            var allMilestones = MovieMilestones.Select(definition => (Definition: definition, Count: movieCount))
                .Concat(SeriesMilestones.Select(definition => (Definition: definition, Count: completedSeriesCount)));

            foreach (var milestone in allMilestones)
            {
                if (milestone.Count < milestone.Definition.Threshold) continue;

                var alreadyUnlocked = configuration.AchievementUnlocks.Any(entry =>
                    string.Equals(entry.UserId, userId, StringComparison.OrdinalIgnoreCase)
                    && string.Equals(entry.AchievementId, milestone.Definition.Id, StringComparison.OrdinalIgnoreCase));

                if (!alreadyUnlocked)
                {
                    configuration.AchievementUnlocks.Add(new AchievementUnlockRecord
                    {
                        UserId = userId,
                        AchievementId = milestone.Definition.Id,
                        UnlockedAt = now.ToString("O", System.Globalization.CultureInfo.InvariantCulture),
                        Retroactive = !previouslyInitialized
                    });
                    changed = true;
                }
            }

            if (!previouslyInitialized)
            {
                configuration.AchievementInitializedUsers.Add(userId);
                changed = true;
            }

            var achievementRows = MovieMilestones.Select(definition => BuildAchievementRow(
                    definition, movieCount, configuration.AchievementUnlocks, userId))
                .Concat(SeriesMilestones.Select(definition => BuildAchievementRow(
                    definition, completedSeriesCount, configuration.AchievementUnlocks, userId)))
                .ToArray();

            if (changed) plugin.UpdateConfiguration(configuration);

            return new { userId, movieCount, completedSeriesCount, achievements = achievementRows };
        }
    }

    public static string? GetAchievementName(string achievementId)
    {
        return MovieMilestones.Concat(SeriesMilestones)
            .FirstOrDefault(definition => string.Equals(definition.Id, achievementId, StringComparison.OrdinalIgnoreCase))
            ?.Name;
    }

    private int CountWatchedMovies(User user)
    {
        var query = new InternalItemsQuery(user)
        {
            IncludeItemTypes = [BaseItemKind.Movie],
            Recursive = true,
            IsVirtualItem = false,
            EnableTotalRecordCount = false
        };

        var movies = _library.GetItemsResult(query).Items
            .Where(item => item is not null && item.IsVisible(user) && !item.IsVirtualItem)
            .ToArray();

        if (movies.Length == 0) return 0;

        var data = _userData.GetUserDataBatch(movies, user);
        return movies.Count(movie => data.TryGetValue(movie.Id, out var state) && state.Played);
    }

    private int CountCompletedSeries(User user)
    {
        var seriesQuery = new InternalItemsQuery(user)
        {
            IncludeItemTypes = [BaseItemKind.Series],
            Recursive = true,
            IsVirtualItem = false,
            EnableTotalRecordCount = false
        };

        var seriesItems = _library.GetItemsResult(seriesQuery).Items
            .OfType<Series>()
            .Where(series => series.IsVisible(user) && !series.IsVirtualItem)
            .ToArray();

        var episodeQuery = new InternalItemsQuery(user)
        {
            IncludeItemTypes = [BaseItemKind.Episode],
            Recursive = true,
            IsVirtualItem = false,
            EnableTotalRecordCount = false
        };

        // Load the eligible episode set once for this member, then batch-read
        // playstate. This avoids one database query per series on large libraries.
        var eligibleEpisodes = _library.GetItemsResult(episodeQuery).Items
            .OfType<Episode>()
            .Where(episode => !episode.IsMissingEpisode
                && !episode.IsVirtualItem
                && episode.IsVisible(user)
                && episode.AiredSeasonNumber is > 0
                && (episode.PremiereDate is null || episode.PremiereDate <= DateTime.UtcNow)
                && !string.IsNullOrWhiteSpace(episode.SeriesPresentationUniqueKey))
            .DistinctBy(episode => episode.Id)
            .ToArray();

        var episodesBySeries = eligibleEpisodes
            .GroupBy(episode => episode.SeriesPresentationUniqueKey, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        var states = eligibleEpisodes.Length > 0
            ? _userData.GetUserDataBatch(eligibleEpisodes, user)
            : new Dictionary<Guid, UserItemData>();

        var userId = user.Id.ToString("N");
        var plugin = Plugin.Instance ?? throw new InvalidOperationException("BeeFlix Profiles is not initialized.");
        var configuration = plugin.Configuration;
        configuration.CompletedSeries ??= [];

        var knownCompletions = configuration.CompletedSeries
            .Where(entry => string.Equals(entry.UserId, userId, StringComparison.OrdinalIgnoreCase))
            .Select(entry => entry.SeriesId)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var series in seriesItems)
        {
            var seriesId = series.Id.ToString("N");
            if (knownCompletions.Contains(seriesId)) continue;

            try
            {
                var seriesKey = series.GetPresentationUniqueKey();
                if (string.IsNullOrWhiteSpace(seriesKey)
                    || !episodesBySeries.TryGetValue(seriesKey, out var seriesEpisodes)
                    || seriesEpisodes.Length == 0)
                {
                    continue;
                }

                if (seriesEpisodes.All(episode => states.TryGetValue(episode.Id, out var state) && state.Played))
                {
                    configuration.CompletedSeries.Add(new CompletedSeriesRecord
                    {
                        UserId = userId,
                        SeriesId = seriesId,
                        SeriesName = series.Name ?? string.Empty,
                        CompletedAt = DateTimeOffset.UtcNow.ToString("O", System.Globalization.CultureInfo.InvariantCulture)
                    });
                    knownCompletions.Add(seriesId);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Could not evaluate completion for series {SeriesId} and user {UserId}", series.Id, user.Id);
            }
        }

        // The configuration is persisted by GetAchievements after the full calculation.
        return configuration.CompletedSeries.Count(entry =>
            string.Equals(entry.UserId, userId, StringComparison.OrdinalIgnoreCase));
    }

    private static object BuildAchievementRow(
        AchievementDefinition definition,
        int currentCount,
        IReadOnlyCollection<AchievementUnlockRecord> unlocks,
        string userId)
    {
        var unlock = unlocks.FirstOrDefault(entry =>
            string.Equals(entry.UserId, userId, StringComparison.OrdinalIgnoreCase)
            && string.Equals(entry.AchievementId, definition.Id, StringComparison.OrdinalIgnoreCase));

        return new
        {
            id = definition.Id,
            name = definition.Name,
            description = definition.Description,
            category = definition.Category,
            threshold = definition.Threshold,
            currentCount,
            progress = Math.Clamp((double)currentCount / definition.Threshold, 0d, 1d),
            unlocked = unlock is not null,
            unlockedAt = unlock?.UnlockedAt,
            retroactive = unlock?.Retroactive ?? false
        };
    }

    private sealed record AchievementDefinition(string Id, string Name, string Description, string Category, int Threshold);
}

public sealed class CompletedSeriesRecord
{
    public string UserId { get; set; } = string.Empty;
    public string SeriesId { get; set; } = string.Empty;
    public string SeriesName { get; set; } = string.Empty;
    public string CompletedAt { get; set; } = string.Empty;
}

public sealed class AchievementUnlockRecord
{
    public string UserId { get; set; } = string.Empty;
    public string AchievementId { get; set; } = string.Empty;
    public string UnlockedAt { get; set; } = string.Empty;
    public bool Retroactive { get; set; }
}

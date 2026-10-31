namespace BeeFlix.Profiles.Services;

/// <summary>
/// BeeFlix-owned cosmetic rewards. Achievement unlocks remain the source of truth;
/// equipped titles are only presentation preferences and never grant progress.
/// </summary>
public static class RewardCatalog
{
    public const string DefaultId = "community-member";

    private static readonly RewardDefinition[] Definitions =
    [
        new("movie-reel-deal", "Reel Regular", "A familiar face in the Friday-night lineup.", "#69A7E8", "movie"),
        new("movie-double-feature", "Double Bill", "Two features? Now that's a proper night in.", "#9AA7B8", "movie"),
        new("movie-popcorn-regular", "Popcorn Society", "A seasoned member of the movie crowd.", "#E7B94C", "movie"),
        new("movie-film-enthusiast", "Silver Screen Fan", "A genuine appreciation for the art of film.", "#55B8A5", "movie"),
        new("movie-film-buff", "The Projectionist", "Knows their way around the silver screen.", "#8B91E8", "movie"),
        new("movie-movie-addict", "Marquee Regular", "A permanent fixture at the BeeFlix cinema.", "#D78BC7", "movie"),
        new("movie-master-archivist", "Film Historian", "A library of viewing history worth preserving.", "#D89B63", "movie"),
        new("movie-legendary-viewer", "The Auteur", "A legendary presence in the BeeFlix cinema.", "#E97878", "movie"),
        new("tv-pilot-season", "Series Scout", "Always ready to discover a new series.", "#67B7D1", "tv"),
        new("tv-binge-watcher", "Binge Companion", "One more episode is never just one more.", "#7DBB78", "tv"),
        new("tv-series-regular", "Small-Screen Regular", "A familiar face in the world of television.", "#B49AE8", "tv"),
        new("tv-tv-enthusiast", "Seasoned Viewer", "A serious commitment to the next season.", "#D2A4E0", "tv"),
        new("tv-small-screen-veteran", "Episode Veteran", "Has seen a few seasons come and go.", "#D49C72", "tv"),
        new("tv-television-legend", "The Showrunner", "A legendary television completion record.", "#E18A65", "tv"),
        new("tv-ultimate-binger", "Prime-Time Legend", "The ultimate champion of the small screen.", "#E5C35D", "tv")
    ];

    public static IReadOnlyList<RewardDefinition> All => Definitions;

    public static RewardDefinition? ForAchievement(string? achievementId) =>
        Definitions.FirstOrDefault(item => string.Equals(item.AchievementId, achievementId, StringComparison.OrdinalIgnoreCase));

    public static RewardDefinition? Find(string? rewardId) =>
        string.Equals(rewardId, DefaultId, StringComparison.OrdinalIgnoreCase)
            ? new RewardDefinition(DefaultId, "Community Member", "A member of the BeeFlix community.", "#F2C94C", "default")
            : Definitions.FirstOrDefault(item => string.Equals(item.Id, rewardId, StringComparison.OrdinalIgnoreCase));
}

public sealed record RewardDefinition(
    string AchievementId,
    string Name,
    string Description,
    string Color,
    string Category)
{
    public string Id => AchievementId;
}

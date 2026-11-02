using BeeFlix.Profiles.Services;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace BeeFlix.Profiles;

public sealed class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths paths, IXmlSerializer xmlSerializer) : base(paths, xmlSerializer) => Instance = this;
    public static Plugin? Instance { get; private set; }
    public override string Name => "BeeFlix Profiles";
    public override Guid Id => Guid.Parse("db13b58d-c0e2-4d13-a27a-9e6b8f3b4f21");
    public IEnumerable<PluginPageInfo> GetPages() => new[]
    {
        new PluginPageInfo { Name = "beeflix-profiles", DisplayName = "BeeFlix Community", EmbeddedResourcePath = "BeeFlix.Profiles.Web.profiles.html", EnableInMainMenu = false },
        new PluginPageInfo { Name = "beeflix-profiles.js", EmbeddedResourcePath = "BeeFlix.Profiles.Web.profiles.js" },
        new PluginPageInfo { Name = Name, EmbeddedResourcePath = "BeeFlix.Profiles.Web.admin.html" }
    };
}

public sealed class PluginConfiguration : BasePluginConfiguration
{
    public bool Enabled { get; set; } = true;
    public int MaximumReviewsPerPage { get; set; } = 50;
    public List<CompletedSeriesRecord> CompletedSeries { get; set; } = [];
    public List<AchievementUnlockRecord> AchievementUnlocks { get; set; } = [];
    public List<string> AchievementInitializedUsers { get; set; } = [];
    public List<EquippedRewardRecord> EquippedRewards { get; set; } = [];
    public List<AchievementDefinitionConfig> AchievementDefinitions { get; set; } = AchievementService.GetDefaultDefinitions();
}

public sealed class EquippedRewardRecord
{
    public string UserId { get; set; } = string.Empty;
    public string RewardId { get; set; } = BeeFlix.Profiles.Services.RewardCatalog.DefaultId;
}

public sealed class AchievementDefinitionConfig
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = "Community";
    public string Metric { get; set; } = "movies";
    public int Threshold { get; set; } = 1;
    public bool Enabled { get; set; } = true;
    public string Rarity { get; set; } = "Common";
    public string BadgeName { get; set; } = string.Empty;
    public string BadgeDescription { get; set; } = string.Empty;
    public string BadgeColor { get; set; } = "#E5C35D";
}

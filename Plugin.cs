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
        new PluginPageInfo { Name = "beeflix-profiles", DisplayName = "BeeFlix Community", EmbeddedResourcePath = "BeeFlix.Profiles.Web.profiles.html", EnableInMainMenu = true },
        new PluginPageInfo { Name = "beeflix-profiles.js", EmbeddedResourcePath = "BeeFlix.Profiles.Web.profiles.js" }
    };
}

public sealed class PluginConfiguration : BasePluginConfiguration
{
    public bool Enabled { get; set; } = true;
    public int MaximumReviewsPerPage { get; set; } = 50;
}

using Newtonsoft.Json.Linq;

namespace BeeFlix.Profiles;

/// <summary>
/// Injects a small script into Jellyfin Web's main document. Plugin Pages inserts page
/// HTML as a fragment, where script tags do not execute, so the loader watches for the
/// BeeFlix Community fragment and then loads its full page application.
/// </summary>
public static class WebTransformation
{
    public static string IndexHtml(JObject content)
    {
        var html = content.Value<string>("contents") ?? string.Empty;
        if (html.Length == 0 || html.Contains("plugin=\"BeeFlix.Profiles\"", StringComparison.OrdinalIgnoreCase))
        {
            return html;
        }

        var baseUrl = Plugin.Instance?.ServerConfigurationManager.GetNetworkConfiguration().BaseUrl;
        var rootPath = string.IsNullOrWhiteSpace(baseUrl) ? string.Empty : "/" + baseUrl.Trim('/');
        var script = $"<script type=\"text/javascript\" plugin=\"BeeFlix.Profiles\" src=\"{rootPath}/BeeFlixProfiles/loader.js\" defer></script>";
        return html.Replace("</body>", $"{script}</body>", StringComparison.OrdinalIgnoreCase);
    }
}

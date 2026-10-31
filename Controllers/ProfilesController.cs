using Jellyfin.Data.Enums;
using System.Collections;
using System.Reflection;
using System.Security.Claims;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Library;
using BeeFlix.Profiles.Services;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Model.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace BeeFlix.Profiles.Controllers;

[ApiController]
[Authorize]
[Route("BeeFlixProfiles")]
public sealed class ProfilesController : ControllerBase
{
    private readonly IServiceProvider _services;
    private readonly IUserManager _users;
    private readonly ILibraryManager _libraryManager;
    private readonly IPluginManager _pluginManager;
    private readonly ILogger<ProfilesController> _logger;
    private readonly AchievementService _achievements;
    private string? _reviewStoreDiagnostic;

    public ProfilesController(IServiceProvider services, IUserManager users, ILibraryManager libraryManager, IPluginManager pluginManager, AchievementService achievements, ILogger<ProfilesController> logger)
    {
        _services = services;
        _users = users;
        _libraryManager = libraryManager;
        _pluginManager = pluginManager;
        _achievements = achievements;
        _logger = logger;
    }

    [HttpGet("page")]
    public IActionResult GetProfilePage()
    {
        SetNoCacheHeaders();
        var stream = typeof(Plugin).Assembly.GetManifestResourceStream("BeeFlix.Profiles.Web.profiles.html");
        if (stream is null)
        {
            _logger.LogError("The embedded BeeFlix Profiles page was not found.");
            return NotFound();
        }

        return File(stream, "text/html; charset=utf-8");
    }

    // The script contains only client-side UI code and no user data. It is safe to serve
    // anonymously; all profile data remains behind this controller's authenticated API.
    [HttpGet("profiles.js")]
    [AllowAnonymous]
    public IActionResult GetProfileScript()
    {
        SetNoCacheHeaders();
        var stream = typeof(Plugin).Assembly.GetManifestResourceStream("BeeFlix.Profiles.Web.profiles.js");
        if (stream is null)
        {
            _logger.LogError("The embedded BeeFlix Profiles JavaScript was not found.");
            return NotFound();
        }

        return File(stream, "application/javascript; charset=utf-8");
    }

    [HttpGet("loader.js")]
    [AllowAnonymous]
    public IActionResult GetProfileLoaderScript()
    {
        SetNoCacheHeaders();
        var stream = typeof(Plugin).Assembly.GetManifestResourceStream("BeeFlix.Profiles.Web.profiles-loader.js");
        if (stream is null)
        {
            _logger.LogError("The embedded BeeFlix Profiles loader script was not found.");
            return NotFound();
        }

        return File(stream, "application/javascript; charset=utf-8");
    }

    private void SetNoCacheHeaders()
    {
        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";
    }

    [HttpGet("health")]
    public IActionResult Health() => Ok(new
    {
        plugin = "BeeFlix Profiles",
        version = "0.7.2",
        enhancedIntegration = FindReviewStore() != null,
        userFacingNavigation = PluginPagesRegistrationService.IsRegistered
    });

    [HttpGet("users")]
    public IActionResult GetMembers()
    {
        if (Plugin.Instance is null || !Plugin.Instance.Configuration.Enabled) return NotFound();

        var viewerId = GetViewerId();
        if (viewerId == Guid.Empty) return Unauthorized();
        var viewer = _users.GetUserById(viewerId);
        if (viewer is null) return Unauthorized();
        var isAdmin = SafelyHasPermission(viewer, "IsAdministrator");

        try
        {
            var members = _users.GetUsers()
                .Where(user => user is not null)
                .Where(user => isAdmin || user.Id == viewerId || !IsHiddenOrDisabled(user))
                .Select(user =>
                {
                    var equipped = GetEquippedReward(user.Id);
                    return new
                    {
                        userId = user.Id.ToString("N"),
                        userName = user.Username,
                        tag = equipped.Name,
                        tagColor = equipped.Color,
                        tagId = equipped.Id
                    };
                })
                .OrderBy(user => user.userName, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            return Ok(new { members });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to list BeeFlix profile members");
            return StatusCode(503, new { message = "Could not load the member directory. Check the Jellyfin server logs." });
        }
    }

    [HttpGet("activity/achievements")]
    public IActionResult GetAchievementActivity([FromQuery] int limit = 100)
    {
        if (Plugin.Instance is null || !Plugin.Instance.Configuration.Enabled) return NotFound();
        limit = Math.Clamp(limit, 1, 200);

        var viewerId = GetViewerId();
        if (viewerId == Guid.Empty) return Unauthorized();
        var viewer = _users.GetUserById(viewerId);
        if (viewer is null) return Unauthorized();
        var isAdmin = SafelyHasPermission(viewer, "IsAdministrator");

        try
        {
            var visibleUsers = _users.GetUsers()
                .Where(user => user is not null)
                .Where(user => isAdmin || user.Id == viewerId || !IsHiddenOrDisabled(user))
                .ToDictionary(user => user.Id.ToString("N"), StringComparer.OrdinalIgnoreCase);

            var unlockRecords = Plugin.Instance.Configuration.AchievementUnlocks ?? [];
            var events = unlockRecords
                .Where(entry => !entry.Retroactive && visibleUsers.ContainsKey(entry.UserId))
                .Where(entry => DateTimeOffset.TryParse(entry.UnlockedAt, System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.AssumeUniversal, out _))
                .Where(entry => AchievementService.GetAchievementName(entry.AchievementId) is not null)
                .Select(entry =>
                {
                    var unlockedAt = DateTimeOffset.Parse(entry.UnlockedAt, System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.AssumeUniversal);
                    var author = visibleUsers[entry.UserId];
                    return new AchievementActivityItem(
                        "AchievementUnlocked",
                        author.Id.ToString("N"),
                        author.Username,
                        unlockedAt.ToUnixTimeMilliseconds(),
                        entry.AchievementId,
                        AchievementService.GetAchievementName(entry.AchievementId)!);
                })
                .OrderByDescending(entry => entry.Timestamp)
                .Take(limit)
                .ToArray();

            return Ok(new { items = events });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load BeeFlix achievement activity");
            return StatusCode(503, new { message = "Could not load BeeFlix achievement activity." });
        }
    }

    [HttpGet("users/{userId}/achievements")]
    public IActionResult GetUserAchievements(string userId)
    {
        if (Plugin.Instance is null || !Plugin.Instance.Configuration.Enabled) return NotFound();
        if (!Guid.TryParse(userId, out var targetId)) return BadRequest(new { message = "Invalid user id." });

        var viewerId = GetViewerId();
        if (viewerId == Guid.Empty) return Unauthorized();
        var viewer = _users.GetUserById(viewerId);
        if (viewer is null) return Unauthorized();
        var isAdmin = SafelyHasPermission(viewer, "IsAdministrator");

        var targetUser = _users.GetUserById(targetId);
        if (targetUser is null && !isAdmin) return NotFound();
        if (!isAdmin && targetId != viewerId && targetUser is not null && IsHiddenOrDisabled(targetUser))
            return NotFound();
        if (targetUser is null) return NotFound();

        try
        {
            return Ok(_achievements.GetAchievements(targetUser));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to calculate BeeFlix achievements for profile {UserId}", targetId);
            return StatusCode(503, new { message = "Could not calculate achievements. Check the Jellyfin server logs." });
        }
    }

    [HttpGet("users/{userId}/rewards")]
    public IActionResult GetUserRewards(string userId)
    {
        if (Plugin.Instance is null || !Plugin.Instance.Configuration.Enabled) return NotFound();
        if (!Guid.TryParse(userId, out var targetId)) return BadRequest(new { message = "Invalid user id." });
        var viewerId = GetViewerId();
        if (viewerId == Guid.Empty) return Unauthorized();
        var viewer = _users.GetUserById(viewerId);
        var target = _users.GetUserById(targetId);
        if (viewer is null) return Unauthorized();
        var isAdmin = SafelyHasPermission(viewer, "IsAdministrator");
        if (target is null || (!isAdmin && targetId != viewerId && IsHiddenOrDisabled(target))) return NotFound();

        try
        {
            var achievements = _achievements.GetAchievements(target);
            var unlockedIds = Plugin.Instance.Configuration.AchievementUnlocks
                .Where(item => string.Equals(item.UserId, targetId.ToString("N"), StringComparison.OrdinalIgnoreCase))
                .Select(item => item.AchievementId)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var equipped = GetEquippedReward(targetId);
            var rewards = RewardCatalog.All.Select(reward => new
            {
                id = reward.Id,
                achievementId = reward.AchievementId,
                name = reward.Name,
                description = reward.Description,
                color = reward.Color,
                category = reward.Category,
                unlocked = unlockedIds.Contains(reward.AchievementId),
                equipped = string.Equals(equipped.Id, reward.Id, StringComparison.OrdinalIgnoreCase)
            }).ToArray();
            return Ok(new
            {
                userId = targetId.ToString("N"),
                equipped = new { id = equipped.Id, name = equipped.Name, color = equipped.Color },
                defaultReward = new { id = RewardCatalog.DefaultId, name = "Community Member", color = "#F2C94C" },
                rewards
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load BeeFlix rewards for {UserId}", targetId);
            return StatusCode(503, new { message = "Could not load member rewards." });
        }
    }

    [HttpPut("users/me/reward")]
    public IActionResult EquipReward([FromBody] EquipRewardRequest request)
    {
        if (Plugin.Instance is null || !Plugin.Instance.Configuration.Enabled) return NotFound();
        var viewerId = GetViewerId();
        if (viewerId == Guid.Empty) return Unauthorized();
        var viewer = _users.GetUserById(viewerId);
        if (viewer is null) return Unauthorized();

        var reward = RewardCatalog.Find(request?.RewardId);
        if (reward is null) return BadRequest(new { message = "Unknown BeeFlix reward." });

        try
        {
            _achievements.GetAchievements(viewer);
            var configuration = Plugin.Instance.Configuration;
            configuration.EquippedRewards ??= [];
            if (reward.Id != RewardCatalog.DefaultId)
            {
                var unlocked = configuration.AchievementUnlocks.Any(item =>
                    string.Equals(item.UserId, viewerId.ToString("N"), StringComparison.OrdinalIgnoreCase)
                    && string.Equals(item.AchievementId, reward.AchievementId, StringComparison.OrdinalIgnoreCase));
                if (!unlocked) return Conflict(new { message = "That reward has not been unlocked yet." });
            }

            var record = configuration.EquippedRewards.FirstOrDefault(item =>
                string.Equals(item.UserId, viewerId.ToString("N"), StringComparison.OrdinalIgnoreCase));
            if (record is null)
            {
                configuration.EquippedRewards.Add(new EquippedRewardRecord { UserId = viewerId.ToString("N"), RewardId = reward.Id });
            }
            else
            {
                record.RewardId = reward.Id;
            }
            Plugin.Instance.UpdateConfiguration(configuration);
            return Ok(new { equipped = new { id = reward.Id, name = reward.Name, color = reward.Color } });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to equip BeeFlix reward for {UserId}", viewerId);
            return StatusCode(503, new { message = "Could not update your profile reward." });
        }
    }

    [HttpGet("users/{userId}/identity")]
    public IActionResult GetMemberIdentity(string userId)
    {
        if (Plugin.Instance is null || !Plugin.Instance.Configuration.Enabled) return NotFound();
        if (!Guid.TryParse(userId, out var targetId)) return BadRequest(new { message = "Invalid user id." });
        var viewerId = GetViewerId();
        if (viewerId == Guid.Empty) return Unauthorized();
        var viewer = _users.GetUserById(viewerId);
        var target = _users.GetUserById(targetId);
        if (viewer is null) return Unauthorized();
        var isAdmin = SafelyHasPermission(viewer, "IsAdministrator");
        if (target is null || (!isAdmin && targetId != viewerId && IsHiddenOrDisabled(target))) return NotFound();
        var reward = GetEquippedReward(targetId);
        return Ok(new { userId = targetId.ToString("N"), userName = target.Username, tag = reward.Name, tagId = reward.Id, tagColor = reward.Color });
    }

    private RewardDefinition GetEquippedReward(Guid userId)
    {
        var records = Plugin.Instance?.Configuration.EquippedRewards ?? [];
        var rewardId = records.FirstOrDefault(item =>
            string.Equals(item.UserId, userId.ToString("N"), StringComparison.OrdinalIgnoreCase))?.RewardId
            ?? RewardCatalog.DefaultId;
        return RewardCatalog.Find(rewardId) ?? RewardCatalog.Find(RewardCatalog.DefaultId)!;
    }

    public sealed class EquipRewardRequest
    {
        public string RewardId { get; set; } = RewardCatalog.DefaultId;
    }

    [HttpGet("users/{userId}/reviews")]
    public IActionResult GetUserReviews(string userId, [FromQuery] int limit = 50, [FromQuery] int offset = 0)
    {
        if (Plugin.Instance is null || !Plugin.Instance.Configuration.Enabled) return NotFound();
        if (!Guid.TryParse(userId, out var targetId)) return BadRequest(new { message = "Invalid user id." });
        limit = Math.Clamp(limit, 1, Math.Clamp(Plugin.Instance.Configuration.MaximumReviewsPerPage, 1, 100));
        offset = Math.Clamp(offset, 0, 100000);

        var viewerId = GetViewerId();
        if (viewerId == Guid.Empty) return Unauthorized();
        var viewer = _users.GetUserById(viewerId);
        if (viewer is null) return Unauthorized();
        var isAdmin = SafelyHasPermission(viewer, "IsAdministrator");

        // The shareable URL is not a permission grant: enforce the same member-visibility
        // rule on the API itself so a copied or hand-crafted URL cannot bypass the directory.
        var targetUser = _users.GetUserById(targetId);
        if (targetUser is null && !isAdmin) return NotFound();
        if (!isAdmin && targetId != viewerId && targetUser is not null && IsHiddenOrDisabled(targetUser))
            return NotFound();

        var store = FindReviewStore();
        if (store is null)
            return StatusCode(503, new
            {
                message = "Could not access the Jellyfin Enhanced review store.",
                detail = _reviewStoreDiagnostic ?? "The integration did not return a review store. Check Jellyfin logs."
            });

        try
        {
            var reviewsProp = store.GetType().GetProperty("Reviews", BindingFlags.Public | BindingFlags.Instance);
            if (reviewsProp?.GetValue(store) is not IEnumerable reviewEntries)
                return StatusCode(503, new { message = "Enhanced review store format was not recognized." });

            var rows = new List<ProfileReview>();
            foreach (var entry in reviewEntries)
            {
                var value = entry?.GetType().GetProperty("Value")?.GetValue(entry);
                if (value is null) continue;
                var idText = ReadString(value, "UserId");
                if (!Guid.TryParse(idText, out var authorId) || authorId != targetId) continue;
                var author = _users.GetUserById(authorId);
                if (author is null && !isAdmin) continue;

                // Conservative filtering only. Production use requires parity validation with Enhanced's
                // internal ReviewVisibility implementation for the exact installed Enhanced version.
                if (!isAdmin && authorId != viewerId && author is not null && IsHiddenOrDisabled(author)) continue;
                if (!isAdmin && author is null) continue;

                rows.Add(new ProfileReview(
                    authorId.ToString("N"),
                    author?.Username ?? "Unknown member",
                    ReadString(value, "TmdbId"),
                    ReadString(value, "MediaType"),
                    ReadString(value, "Content"),
                    ReadNullableDouble(value, "Rating"),
                    ReadString(value, "CreatedAt"),
                    ReadString(value, "UpdatedAt")));
            }

            rows = rows
                .OrderByDescending(review => TryParseDate(review.updatedAt) ?? TryParseDate(review.createdAt) ?? DateTimeOffset.MinValue)
                .ToList();

            var ratedValues = rows
                .Where(review => review.rating is > 0)
                .Select(review => review.rating!.Value)
                .ToArray();
            var stats = new
            {
                reviewCount = rows.Count,
                ratedReviewCount = ratedValues.Length,
                unratedReviewCount = rows.Count - ratedValues.Length,
                averageRating = ratedValues.Length > 0 ? Math.Round(ratedValues.Average(), 2) : (double?)null
            };

            var pageRows = rows.Skip(offset).Take(limit).ToArray();

            // Resolve only this page's IDs so a large review history doesn't create a
            // needlessly huge provider-ID query. Enhanced remains the source of truth.
            var mediaByTmdb = ResolveMediaTitles(pageRows);

            var page = pageRows.Select(review =>
            {
                var isShow = IsShowType(review.mediaType);
                mediaByTmdb.TryGetValue((review.tmdbId ?? string.Empty, isShow), out var media);
                return new
                {
                    review.userId,
                    review.userName,
                    review.tmdbId,
                    review.mediaType,
                    title = media.Name,
                    jellyfinItemId = media.Id == Guid.Empty ? null : media.Id.ToString("N"),
                    year = media.ProductionYear,
                    content = review.content,
                    rating = review.rating,
                    createdAt = review.createdAt,
                    updatedAt = review.updatedAt
                };
            }).ToArray();
            return Ok(new { userId = targetId.ToString("N"), total = rows.Count, limit, offset, stats, reviews = page });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to read Jellyfin Enhanced review store for profile {UserId}", targetId);
            return StatusCode(503, new { message = "Could not read Enhanced reviews. Check plugin compatibility and server logs." });
        }
    }

    private Dictionary<(string TmdbId, bool IsShow), (string? Name, Guid Id, int? ProductionYear)> ResolveMediaTitles(IReadOnlyCollection<ProfileReview> reviews)
    {
        var tmdbIds = reviews
            .Select(review => review.tmdbId)
            .Where(id => !string.IsNullOrWhiteSpace(id) && id!.All(char.IsDigit))
            .Select(id => id!)
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        var resolved = new Dictionary<(string TmdbId, bool IsShow), (string? Name, Guid Id, int? ProductionYear)>();
        if (tmdbIds.Length == 0) return resolved;

        try
        {
            var query = new InternalItemsQuery
            {
                HasAnyProviderIds = new Dictionary<string, string[]>
                {
                    ["Tmdb"] = tmdbIds
                },
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                IsVirtualItem = false,
                Recursive = true,
                EnableTotalRecordCount = false
            };

            var items = _libraryManager.GetItemsResult(query).Items;
            foreach (var item in items)
            {
                if (item is null || string.IsNullOrWhiteSpace(item.Name)
                    || !item.ProviderIds.TryGetValue("Tmdb", out var providerId)
                    || string.IsNullOrWhiteSpace(providerId))
                {
                    continue;
                }

                var isShow = string.Equals(item.GetType().Name, "Series", StringComparison.Ordinal);
                resolved.TryAdd((providerId, isShow), (item.Name, item.Id, item.ProductionYear));
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not resolve reviewed TMDB IDs against the local Jellyfin library");
        }

        return resolved;
    }

    private static bool IsShowType(string? mediaType)
    {
        return mediaType?.Contains("tv", StringComparison.OrdinalIgnoreCase) == true
            || mediaType?.Contains("show", StringComparison.OrdinalIgnoreCase) == true
            || mediaType?.Contains("series", StringComparison.OrdinalIgnoreCase) == true;
    }

    private sealed record AchievementActivityItem(
        string ActivityType,
        string UserId,
        string UserName,
        long Timestamp,
        string AchievementId,
        string AchievementName);

    private sealed record ProfileReview(
        string userId,
        string userName,
        string? tmdbId,
        string? mediaType,
        string? content,
        double? rating,
        string? createdAt,
        string? updatedAt);

    private static DateTimeOffset? TryParseDate(string? value)
    {
        return DateTimeOffset.TryParse(
            value,
            System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.AssumeUniversal,
            out var parsed) ? parsed : null;
    }

    private bool IsHiddenOrDisabled(object author)
    {
        try
        {
            var enhanced = FindEnhancedPluginInstance();
            var config = enhanced?.GetType().GetProperty("Configuration", BindingFlags.Public | BindingFlags.Instance)?.GetValue(enhanced);
            var hideHidden = config?.GetType().GetProperty("HideReviewsFromHiddenUsers")?.GetValue(config) is bool h ? h : true;
            var hideDisabled = config?.GetType().GetProperty("HideReviewsFromDisabledUsers")?.GetValue(config) is bool d ? d : true;
            return (hideHidden && HasPermissionNamed(author, "IsHidden")) ||
                   (hideDisabled && HasPermissionNamed(author, "IsDisabled"));
        }
        catch { return true; } // fail closed if privacy configuration cannot be evaluated
    }

    private static bool SafelyHasPermission(object user, string permissionName)
    {
        try { return HasPermissionNamed(user, permissionName); }
        catch { return false; }
    }

    private static bool HasPermissionNamed(object subject, string permissionName)
    {
        // Jellyfin's User.HasPermission(...) is an extension method, not an instance
        // method. Reflecting for an instance method always fails and was causing the
        // fail-closed path to hide every other member. Read the public Permissions
        // collection instead so this works across Jellyfin 12 builds.
        if (subject.GetType().GetProperty("Permissions", BindingFlags.Public | BindingFlags.Instance)?.GetValue(subject)
            is not IEnumerable permissions)
        {
            return false;
        }

        foreach (var permission in permissions)
        {
            if (permission is null) continue;
            var kind = permission.GetType().GetProperty("Kind", BindingFlags.Public | BindingFlags.Instance)?.GetValue(permission)?.ToString();
            if (!string.Equals(kind, permissionName, StringComparison.OrdinalIgnoreCase)) continue;

            return permission.GetType().GetProperty("Value", BindingFlags.Public | BindingFlags.Instance)?.GetValue(permission) is bool granted
                && granted;
        }

        return false;
    }

    private object? FindReviewStore()
    {
        _reviewStoreDiagnostic = null;
        try
        {
            // Resolve the type from the actual loaded Enhanced plugin instance, not
            // from AppDomain.GetAssemblies(). Enhanced is loaded in its own
            // AssemblyLoadContext; enumeration can select a duplicate/stale type
            // identity that is not the one registered in Jellyfin's service provider.
            var enhanced = FindEnhancedPluginInstance();
            if (enhanced is null)
            {
                _reviewStoreDiagnostic = "IPluginManager did not expose an active Jellyfin Enhanced plugin instance.";
                _logger.LogWarning("BeeFlix Profiles could not find an active Jellyfin Enhanced plugin instance.");
                return null;
            }

            var managerType = enhanced.GetType().Assembly.GetType(
                "Jellyfin.Plugin.JellyfinEnhanced.Configuration.UserConfigurationManager",
                throwOnError: false,
                ignoreCase: false);
            if (managerType is null)
            {
                _reviewStoreDiagnostic = "The active Enhanced assembly did not contain UserConfigurationManager.";
                _logger.LogWarning("Jellyfin Enhanced was found, but its UserConfigurationManager type was not present in the same plugin assembly.");
                return null;
            }

            var manager = _services.GetService(managerType);
            if (manager is null)
            {
                _reviewStoreDiagnostic = "UserConfigurationManager was found in the active Enhanced assembly but could not be resolved from Jellyfin's service provider. A service registration/load-context mismatch remains.";
                _logger.LogWarning("Jellyfin Enhanced UserConfigurationManager type was found ({ManagerType}), but it was not resolvable from the current Jellyfin service provider.", managerType.FullName);
                return null;
            }

            var method = managerType.GetMethod("GetAllReviews", BindingFlags.Public | BindingFlags.Instance);
            if (method is null)
            {
                _reviewStoreDiagnostic = "UserConfigurationManager was resolved, but its public GetAllReviews() method was not found.";
                _logger.LogWarning("Jellyfin Enhanced UserConfigurationManager is registered, but its public GetAllReviews() method was not found.");
                return null;
            }

            var store = method.Invoke(manager, null);
            if (store is null)
                _reviewStoreDiagnostic = "GetAllReviews() was invoked successfully but returned null.";
            return store;
        }
        catch (TargetInvocationException ex)
        {
            var inner = ex.InnerException ?? ex;
            _reviewStoreDiagnostic = $"Enhanced GetAllReviews() threw {inner.GetType().Name}: {inner.Message}";
            _logger.LogWarning(inner, "Jellyfin Enhanced GetAllReviews() call failed.");
            return null;
        }
        catch (Exception ex)
        {
            _reviewStoreDiagnostic = $"Review-store discovery threw {ex.GetType().Name}: {ex.Message}";
            _logger.LogWarning(ex, "Enhanced review store discovery failed.");
            return null;
        }
    }

    private MediaBrowser.Common.Plugins.IPlugin? FindEnhancedPluginInstance()
    {
        return _pluginManager.Plugins
            .Where(plugin => plugin.Instance is not null)
            .Select(plugin => plugin.Instance)
            .FirstOrDefault(plugin =>
                plugin is not null
                && (plugin.Id == Guid.Parse("f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b")
                    || string.Equals(plugin.Name, "Jellyfin Enhanced", StringComparison.OrdinalIgnoreCase)));
    }

    private Guid GetViewerId()
    {
        var candidates = new[] { "Jellyfin-UserId", "JellyfinUserId", ClaimTypes.NameIdentifier, "sub" };
        foreach (var key in candidates)
        {
            var raw = User.FindFirst(key)?.Value;
            if (Guid.TryParse(raw, out var id)) return id;
        }
        return Guid.Empty;
    }

    private static string? ReadString(object obj, string property) => obj.GetType().GetProperty(property)?.GetValue(obj)?.ToString();
    private static double? ReadNullableDouble(object obj, string property)
    {
        var value = obj.GetType().GetProperty(property)?.GetValue(obj);
        if (value is null) return null;
        try { return Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture); } catch { return null; }
    }
}

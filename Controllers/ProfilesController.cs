using System.Collections;
using System.Reflection;
using System.Security.Claims;
using MediaBrowser.Controller.Library;
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
    private readonly ILogger<ProfilesController> _logger;

    public ProfilesController(IServiceProvider services, IUserManager users, ILogger<ProfilesController> logger)
    {
        _services = services;
        _users = users;
        _logger = logger;
    }

    [HttpGet("health")]
    public IActionResult Health() => Ok(new { plugin = "BeeFlix Profiles", version = "0.4.0.2", enhancedIntegration = FindReviewStore() != null });

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
                .Select(user => new
                {
                    userId = user.Id.ToString("N"),
                    userName = user.Username
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

        var store = FindReviewStore();
        if (store is null)
            return StatusCode(503, new { message = "Jellyfin Enhanced review store was not found. Confirm Enhanced is installed and restart Jellyfin." });

        try
        {
            var reviewsProp = store.GetType().GetProperty("Reviews", BindingFlags.Public | BindingFlags.Instance);
            if (reviewsProp?.GetValue(store) is not IEnumerable reviewEntries)
                return StatusCode(503, new { message = "Enhanced review store format was not recognized." });

            var rows = new List<object>();
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

                rows.Add(new
                {
                    userId = authorId.ToString("N"),
                    userName = author?.Username ?? "Unknown member",
                    tmdbId = ReadString(value, "TmdbId"),
                    mediaType = ReadString(value, "MediaType"),
                    content = ReadString(value, "Content"),
                    rating = ReadNullableDouble(value, "Rating"),
                    createdAt = ReadString(value, "CreatedAt"),
                    updatedAt = ReadString(value, "UpdatedAt")
                });
            }

            var page = rows.Skip(offset).Take(limit).ToArray();
            return Ok(new { userId = targetId.ToString("N"), total = rows.Count, limit, offset, reviews = page });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to read Jellyfin Enhanced review store for profile {UserId}", targetId);
            return StatusCode(503, new { message = "Could not read Enhanced reviews. Check plugin compatibility and server logs." });
        }
    }

    private bool IsHiddenOrDisabled(object author)
    {
        try
        {
            var enhancedType = AppDomain.CurrentDomain.GetAssemblies()
                .Select(a => a.GetType("Jellyfin.Plugin.JellyfinEnhanced.JellyfinEnhanced", false))
                .FirstOrDefault(t => t is not null);
            var instance = enhancedType?.GetProperty("Instance", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
            var config = enhancedType?.GetProperty("Configuration")?.GetValue(instance);
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
        var method = subject.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(m => m.Name == "HasPermission" && m.GetParameters().Length == 1
                && m.GetParameters()[0].ParameterType.IsEnum);
        if (method is null) throw new MissingMethodException(subject.GetType().FullName, "HasPermission(enum)");
        var enumType = method.GetParameters()[0].ParameterType;
        var permission = Enum.Parse(enumType, permissionName, ignoreCase: false);
        return method.Invoke(subject, new[] { permission }) is bool result && result;
    }

    private object? FindReviewStore()
    {
        try
        {
            var managerType = AppDomain.CurrentDomain.GetAssemblies()
                .Select(a => a.GetType("Jellyfin.Plugin.JellyfinEnhanced.Configuration.UserConfigurationManager", false))
                .FirstOrDefault(t => t is not null);
            if (managerType is null) return null;
            var manager = _services.GetService(managerType);
            return manager?.GetType().GetMethod("GetAllReviews", BindingFlags.Public | BindingFlags.Instance)?.Invoke(manager, null);
        }
        catch (Exception ex) { _logger.LogWarning(ex, "Enhanced review store discovery failed"); return null; }
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

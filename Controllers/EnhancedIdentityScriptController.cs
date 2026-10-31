using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

namespace BeeFlix.Profiles.Controllers;

/// <summary>
/// Serves the optional browser-side integration for Jellyfin Enhanced review cards.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("BeeFlixProfiles")]
public sealed class EnhancedIdentityScriptController : ControllerBase
{
    private readonly ILogger<EnhancedIdentityScriptController> _logger;

    public EnhancedIdentityScriptController(ILogger<EnhancedIdentityScriptController> logger)
    {
        _logger = logger;
    }

    [HttpGet("enhanced-identity.js")]
    public IActionResult GetScript()
    {
        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";

        var stream = typeof(Plugin).Assembly.GetManifestResourceStream("BeeFlix.Profiles.Web.enhanced-identity.js");
        if (stream is null)
        {
            _logger.LogError("The BeeFlix Enhanced identity integration script was not found.");
            return NotFound();
        }

        return File(stream, "application/javascript; charset=utf-8");
    }
}

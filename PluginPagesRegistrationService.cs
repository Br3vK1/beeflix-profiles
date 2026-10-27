using System.Reflection;
using System.Runtime.Loader;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;

namespace BeeFlix.Profiles;

/// <summary>
/// Adds BeeFlix Community to Jellyfin's normal user menu when the optional Plugin Pages
/// plugin is installed. Reflection keeps Plugin Pages an optional dependency and avoids
/// binding BeeFlix Profiles to another plugin's assembly load context.
/// </summary>
public sealed class PluginPagesRegistrationService : IHostedService
{
    private const string PageId = "5ff71e29-a04e-40a8-8a57-0c8f39a616db";
    private const string PluginPagesAssemblyName = "Jellyfin.Plugin.PluginPages";
    private const string FileTransformationAssemblyName = "Jellyfin.Plugin.FileTransformation";
    private const string PluginPagesInterfaceName = "Jellyfin.Plugin.PluginPages.PluginInterface";
    private const string FileTransformationInterfaceName = "Jellyfin.Plugin.FileTransformation.PluginInterface";
    private const string TransformationId = "04c44fb1-2224-4b6c-a66f-f617d07c945f";
    private const string PageUrl = "/BeeFlixProfiles/page";

    public static bool IsRegistered { get; private set; }

    private readonly ILogger<PluginPagesRegistrationService> _logger;
    private MethodInfo? _removePageMethod;
    private MethodInfo? _removeTransformationMethod;

    public PluginPagesRegistrationService(ILogger<PluginPagesRegistrationService> logger)
    {
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            IsRegistered = false;
            var loadedAssemblies = AssemblyLoadContext.All.SelectMany(context => context.Assemblies).ToArray();
            var pluginPagesAssembly = loadedAssemblies.FirstOrDefault(assembly =>
                string.Equals(assembly.GetName().Name, PluginPagesAssemblyName, StringComparison.Ordinal));
            var fileTransformationAssembly = loadedAssemblies.FirstOrDefault(assembly =>
                string.Equals(assembly.GetName().Name, FileTransformationAssemblyName, StringComparison.Ordinal));

            if (fileTransformationAssembly is null)
            {
                _logger.LogWarning(
                    "File Transformation is not installed or could not be found. Install compatible File Transformation and Plugin Pages plugins to expose BeeFlix Community in the normal Jellyfin user menu.");
                return Task.CompletedTask;
            }

            var fileTransformationInterface = fileTransformationAssembly.GetType(
                FileTransformationInterfaceName,
                throwOnError: false,
                ignoreCase: false);
            var registerTransformation = fileTransformationInterface?.GetMethod(
                "RegisterTransformation",
                BindingFlags.Public | BindingFlags.Static);
            _removeTransformationMethod = fileTransformationInterface?.GetMethod(
                "RemoveTransformation",
                BindingFlags.Public | BindingFlags.Static);

            if (registerTransformation is null)
            {
                _logger.LogWarning("File Transformation is loaded but its registration API is unavailable.");
                return Task.CompletedTask;
            }

            var transformationPayload = new JObject
            {
                ["id"] = TransformationId,
                ["fileNamePattern"] = "index.html",
                ["callbackAssembly"] = typeof(WebTransformation).Assembly.FullName,
                ["callbackClass"] = typeof(WebTransformation).FullName,
                ["callbackMethod"] = nameof(WebTransformation.IndexHtml)
            };
            registerTransformation.Invoke(null, new object?[] { transformationPayload });
            _logger.LogInformation("Registered the BeeFlix Profiles loader injection through File Transformation.");

            var pluginInterface = pluginPagesAssembly?.GetType(
                PluginPagesInterfaceName,
                throwOnError: false,
                ignoreCase: false);

            var registerPage = pluginInterface?.GetMethod(
                "RegisterPage",
                BindingFlags.Public | BindingFlags.Static);

            _removePageMethod = pluginInterface?.GetMethod(
                "RemovePage",
                BindingFlags.Public | BindingFlags.Static);

            if (registerPage is null)
            {
                _logger.LogWarning(
                    "Plugin Pages is not installed or its RegisterPage API is unavailable. Install compatible Plugin Pages and File Transformation plugins to expose BeeFlix Community in the normal Jellyfin user menu.");
                return Task.CompletedTask;
            }

            var payload = new JObject
            {
                ["Id"] = PageId,
                ["Url"] = PageUrl,
                ["DisplayText"] = "BeeFlix Community",
                ["Icon"] = "groups"
            };

            registerPage.Invoke(null, new object?[] { payload });
            IsRegistered = true;
            _logger.LogInformation("Registered BeeFlix Community in the Jellyfin user menu through Plugin Pages.");
        }
        catch (Exception ex)
        {
            IsRegistered = false;
            _logger.LogWarning(
                ex,
                "Could not register BeeFlix Community in the Jellyfin user menu. The admin page remains disabled in the sidebar; check Plugin Pages / File Transformation compatibility.");
        }

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        try
        {
            _removePageMethod?.Invoke(null, new object?[] { PageId });
            _removeTransformationMethod?.Invoke(null, new object?[] { TransformationId });
            IsRegistered = false;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not unregister the BeeFlix Community user-menu entry during shutdown.");
        }

        return Task.CompletedTask;
    }
}
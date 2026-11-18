using System.Reflection;

namespace TaskTracker.Presentation.Installation;

/// <summary>The application's version, as shown in the About line of App Settings (§7.13).</summary>
public sealed class AppVersion
{
    private const string UnknownNumber = "unknown";

    public AppVersion(string number)
    {
        Number = number;
    }

    /// <summary>The version number without build metadata, e.g. <c>0.1.0</c>.</summary>
    public string Number { get; }

    /// <summary>The About line text.</summary>
    public string AboutText => $"Task Tracker version {Number}";

    /// <summary>Reads the version an assembly was built with.</summary>
    public static AppVersion FromAssembly(Assembly assembly)
    {
        var informational = assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;

        return FromMetadata(informational, assembly.GetName().Version);
    }

    /// <summary>
    /// Prefers the informational version without its <c>+commit</c> suffix, because it keeps any
    /// pre-release label; falls back to the three-part assembly version.
    /// </summary>
    public static AppVersion FromMetadata(string? informationalVersion, Version? assemblyVersion)
    {
        if (!string.IsNullOrWhiteSpace(informationalVersion))
        {
            var withoutMetadata = informationalVersion.Split('+')[0];

            return new AppVersion(withoutMetadata);
        }

        return new AppVersion(assemblyVersion?.ToString(3) ?? UnknownNumber);
    }
}
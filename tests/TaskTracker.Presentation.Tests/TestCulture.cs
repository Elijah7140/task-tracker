using System.Globalization;
using System.Runtime.CompilerServices;

namespace TaskTracker.Presentation.Tests;

/// <summary>
/// Pins the culture for every test in this assembly, so culture-sensitive text such as
/// "3.5" or "11/19/2026" is the same on every developer machine and CI agent.
/// </summary>
internal static class TestCulture
{
    [ModuleInitializer]
    internal static void Pin()
    {
        var culture = CultureInfo.GetCultureInfo("en-US");
        CultureInfo.DefaultThreadCurrentCulture = culture;
        CultureInfo.DefaultThreadCurrentUICulture = culture;
        CultureInfo.CurrentCulture = culture;
        CultureInfo.CurrentUICulture = culture;
    }
}
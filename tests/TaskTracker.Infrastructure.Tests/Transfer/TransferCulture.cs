using System.Globalization;

namespace TaskTracker.Infrastructure.Tests.Transfer;

/// <summary>Switches the culture of the current and new threads, and restores it when disposed.</summary>
internal sealed class TransferCulture : IDisposable
{
    private readonly CultureInfo previousCurrent = CultureInfo.CurrentCulture;
    private readonly CultureInfo? previousDefault = CultureInfo.DefaultThreadCurrentCulture;

    private TransferCulture(string name)
    {
        var culture = CultureInfo.GetCultureInfo(name);
        CultureInfo.CurrentCulture = culture;
        CultureInfo.DefaultThreadCurrentCulture = culture;
    }

    public static TransferCulture Use(string name)
    {
        return new TransferCulture(name);
    }

    public void Dispose()
    {
        CultureInfo.CurrentCulture = previousCurrent;
        CultureInfo.DefaultThreadCurrentCulture = previousDefault;
    }
}
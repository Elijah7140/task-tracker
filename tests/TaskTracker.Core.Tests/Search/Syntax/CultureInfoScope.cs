using System.Globalization;

namespace TaskTracker.Core.Tests.Search.Syntax;

/// <summary>Switches the current thread culture and restores it when disposed.</summary>
internal sealed class CultureInfoScope : IDisposable
{
    private readonly CultureInfo previous;

    private CultureInfoScope(CultureInfo previous)
    {
        this.previous = previous;
    }

    public static CultureInfoScope Use(string name)
    {
        var scope = new CultureInfoScope(CultureInfo.CurrentCulture);
        CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo(name);
        return scope;
    }

    public void Dispose()
    {
        CultureInfo.CurrentCulture = previous;
    }
}
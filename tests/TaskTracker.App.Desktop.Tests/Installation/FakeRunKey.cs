using TaskTracker.App.Desktop.Installation;

namespace TaskTracker.App.Desktop.Tests.Installation;

/// <summary>An in-memory stand-in for the Windows <c>Run</c> key.</summary>
internal sealed class FakeRunKey : IRunKey
{
    public Dictionary<string, string> Values { get; } = [];

    public void SetValue(string name, string command)
    {
        Values[name] = command;
    }

    public void DeleteValue(string name)
    {
        Values.Remove(name);
    }
}
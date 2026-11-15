namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>A temporary folder for test files, removed when disposed.</summary>
internal sealed class TempDirectory : IDisposable
{
    public TempDirectory()
    {
        Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"tasktracker-transfer-{Guid.CreateVersion7()}");
        Directory.CreateDirectory(Path);
    }

    public string Path { get; }

    public string File(string name)
    {
        return System.IO.Path.Combine(Path, name);
    }

    public void Dispose()
    {
        Directory.Delete(Path, recursive: true);
    }
}
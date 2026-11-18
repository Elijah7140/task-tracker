using TaskTracker.Presentation.Installation;

namespace TaskTracker.Presentation.Tests.Installation;

public sealed class AppVersionTests
{
    [Fact]
    public void About_text_names_the_app_and_its_version()
    {
        var version = new AppVersion("0.1.0");

        Assert.Equal("Task Tracker version 0.1.0", version.AboutText);
    }

    [Fact]
    public void Build_metadata_after_a_plus_sign_is_dropped()
    {
        var version = AppVersion.FromMetadata("0.2.0+4f1c2ab9d", new Version(0, 2, 0, 0));

        Assert.Equal("0.2.0", version.Number);
    }

    [Fact]
    public void A_pre_release_label_is_kept()
    {
        var version = AppVersion.FromMetadata("0.3.0-beta.1+4f1c2ab9d", new Version(0, 3, 0, 0));

        Assert.Equal("0.3.0-beta.1", version.Number);
    }

    [Fact]
    public void Without_an_informational_version_the_three_part_assembly_version_is_used()
    {
        var version = AppVersion.FromMetadata(null, new Version(1, 4, 2, 0));

        Assert.Equal("1.4.2", version.Number);
    }

    [Fact]
    public void Without_any_version_metadata_the_number_is_unknown()
    {
        var version = AppVersion.FromMetadata(" ", null);

        Assert.Equal("unknown", version.Number);
    }

    [Fact]
    public void Reading_an_assembly_uses_the_version_it_was_built_with()
    {
        var assembly = typeof(AppVersion).Assembly;

        var version = AppVersion.FromAssembly(assembly);

        Assert.Equal(assembly.GetName().Version!.ToString(3), version.Number);
    }
}
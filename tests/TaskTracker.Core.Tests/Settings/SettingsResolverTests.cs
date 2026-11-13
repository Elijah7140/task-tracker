using System.Globalization;

using TaskTracker.Core.Settings;

namespace TaskTracker.Core.Tests.Settings;

public sealed class SettingsResolverTests
{
    [Fact]
    public void Empty_stores_use_defaults_with_global_source()
    {
        var empty = new Dictionary<string, string>();

        var settings = SettingsResolver.Resolve(empty, empty);

        Assert.True(settings.AutoCompleteParents.Value);
        Assert.Equal(SettingSource.Global, settings.AutoCompleteParents.Source);
        Assert.Equal(TimeSpan.FromDays(3), settings.UrgencyYellowThreshold.Value);
        Assert.Equal(TimeSpan.FromDays(1), settings.UrgencyRedThreshold.Value);
    }

    [Fact]
    public void Project_override_wins_and_reports_project_source()
    {
        var global = new Dictionary<string, string> { [SettingsCatalogue.AutoCompleteParents.Key] = "false" };
        var project = new Dictionary<string, string> { [SettingsCatalogue.AutoCompleteParents.Key] = "true" };

        var settings = SettingsResolver.Resolve(global, project);

        Assert.True(settings.AutoCompleteParents.Value);
        Assert.Equal(SettingSource.Project, settings.AutoCompleteParents.Source);
    }

    [Fact]
    public void Non_overridable_definition_ignores_project_value()
    {
        var definition = new SettingDefinition<bool>("globalOnly", false, false, new BoolCodec());
        var global = new Dictionary<string, string> { [definition.Key] = "true" };
        var project = new Dictionary<string, string> { [definition.Key] = "false" };

        var value = SettingsResolver.ResolveValue(definition, global, project);

        Assert.True(value.Value);
        Assert.Equal(SettingSource.Global, value.Source);
    }

    [Fact]
    public void Boolean_and_duration_round_trip_under_german_culture()
    {
        var original = CultureInfo.CurrentCulture;

        try
        {
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("de-DE");
            var boolean = SettingsCatalogue.AutoCompleteParents;
            var duration = SettingsCatalogue.UrgencyYellowThreshold;

            Assert.Equal("true", boolean.Format(boolean.Parse("true")));
            Assert.Equal("P2DT3H", duration.Format(duration.Parse("P2DT3H")));
        }
        finally
        {
            CultureInfo.CurrentCulture = original;
        }
    }

    [Fact]
    public void Malformed_values_name_the_setting()
    {
        var booleanError = Assert.Throws<FormatException>(() => SettingsCatalogue.AutoCompleteParents.Parse("maybe"));
        var durationError = Assert.Throws<FormatException>(() => SettingsCatalogue.UrgencyRedThreshold.Parse("tomorrow"));

        Assert.Contains(SettingsCatalogue.AutoCompleteParents.Key, booleanError.Message);
        Assert.Contains(SettingsCatalogue.UrgencyRedThreshold.Key, durationError.Message);
    }
}
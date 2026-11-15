using Microsoft.Extensions.DependencyInjection;

using TaskTracker.Core.Calendar;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;
using TaskTracker.Core.SavedSearches;
using TaskTracker.Core.Search;
using TaskTracker.Core.Search.Syntax;
using TaskTracker.Core.Settings;
using TaskTracker.Core.Trash;

namespace TaskTracker.Core;

/// <summary>Registers application services without storage or UI dependencies.</summary>
public static class DependencyInjection
{
    public static IServiceCollection AddTaskTrackerCore(this IServiceCollection services)
    {
        services.AddSingleton<ProjectService>();
        services.AddSingleton<FolderService>();
        services.AddSingleton<ItemService>();
        services.AddSingleton<CalendarService>();
        services.AddSingleton<ICalendarRescheduler, CalendarRescheduleService>();
        services.AddSingleton<TrashService>();
        services.AddSingleton<ITrashService>(provider => provider.GetRequiredService<TrashService>());
        services.AddSingleton(FieldWriteGate.Shared);
        services.AddSingleton<FieldService>();
        services.AddSingleton<LookupService>();
        services.AddSingleton<SettingsService>();
        services.AddSingleton<IFieldRegistry, FieldRegistry>();
        services.AddSingleton<ItemQueryValidator>();
        services.AddSingleton<ItemSearchService>();
        services.AddSingleton<IItemSearchService>(provider => provider.GetRequiredService<ItemSearchService>());
        services.AddSingleton<SavedSearchService>();
        services.AddSingleton(provider => new ItemQueryParser(
            provider.GetRequiredService<TimeProvider>(), provider.GetRequiredService<TimeZoneInfo>()));
        return services;
    }
}
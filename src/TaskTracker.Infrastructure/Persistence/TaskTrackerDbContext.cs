using Microsoft.EntityFrameworkCore;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;

namespace TaskTracker.Infrastructure.Persistence;

/// <summary>SQLite persistence for the task tracker.</summary>
public sealed class TaskTrackerDbContext(DbContextOptions<TaskTrackerDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();

    public DbSet<Folder> Folders => Set<Folder>();

    public DbSet<TodoItem> TodoItems => Set<TodoItem>();

    public DbSet<ItemType> ItemTypes => Set<ItemType>();

    public DbSet<PriorityLevel> PriorityLevels => Set<PriorityLevel>();

    public DbSet<FieldDefinition> FieldDefinitions => Set<FieldDefinition>();

    public DbSet<FieldChoice> FieldChoices => Set<FieldChoice>();

    public DbSet<ItemFieldValue> ItemFieldValues => Set<ItemFieldValue>();

    public DbSet<GlobalSettingRow> GlobalSettings => Set<GlobalSettingRow>();

    public DbSet<ProjectSettingRow> ProjectSettings => Set<ProjectSettingRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TaskTrackerDbContext).Assembly);
    }
}
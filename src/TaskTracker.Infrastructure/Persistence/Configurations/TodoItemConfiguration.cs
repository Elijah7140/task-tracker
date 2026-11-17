using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.Items;
using TaskTracker.Core.Items.Recurrence;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Projects;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps items, indexes, and row-level date rules.</summary>
public sealed class TodoItemConfiguration : IEntityTypeConfiguration<TodoItem>
{
    public void Configure(EntityTypeBuilder<TodoItem> builder)
    {
        builder.ToTable("TodoItem", table =>
        {
            table.HasCheckConstraint("CK_TodoItem_DueTime", "DueTime IS NULL OR DueDate IS NOT NULL");
            table.HasCheckConstraint("CK_TodoItem_ScheduledEnd", "ScheduledEnd IS NULL OR (ScheduledStart IS NOT NULL AND ScheduledEnd >= ScheduledStart)");
        });
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Title).HasMaxLength(300).IsRequired();
        builder.Property(item => item.TicketNumber).HasMaxLength(100);
        builder.Property(item => item.CreatedAtUtc)
            .HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        builder.Property(item => item.UpdatedAtUtc)
            .HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        builder.Property(item => item.CompletedAtUtc)
            .HasConversion(value => value, value => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null);
        builder.Property(item => item.DeletedAtUtc)
            .HasConversion(value => value, value => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null);
        ConfigureRecurrence(builder);
        builder.HasIndex(item => new { item.ProjectId, item.FolderId });
        builder.HasIndex(item => item.ParentItemId);
        builder.HasIndex(item => item.TicketNumber);
        builder.HasIndex(item => item.DueDate);
        builder.HasOne<Project>().WithMany().HasForeignKey(item => item.ProjectId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Folder>().WithMany().HasForeignKey(item => item.FolderId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<TodoItem>().WithMany().HasForeignKey(item => item.ParentItemId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<ItemType>().WithMany().HasForeignKey(item => item.ItemTypeId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<PriorityLevel>().WithMany().HasForeignKey(item => item.PriorityLevelId).OnDelete(DeleteBehavior.Restrict);
        builder.HasQueryFilter(item => item.DeletedAtUtc == null);
    }

    private static void ConfigureRecurrence(EntityTypeBuilder<TodoItem> builder)
    {
        builder.Ignore(item => item.Recurrence);
        builder.Ignore(item => item.RecurrenceDate);
        builder.Property<RecurrenceFrequency?>("RecurrenceFrequency");
        builder.Property<int?>("RecurrenceInterval");
        builder.Property<RecurrenceWeekdays?>("RecurrenceWeekdays");
        builder.Property<int?>("RecurrenceMonthDay");
        builder.Property<int?>("RecurrenceMonth");
        builder.Property<RecurrenceAnchor?>("RecurrenceAnchor");
        builder.Property<RecurrenceEndKind?>("RecurrenceEndKind");
        builder.Property<DateOnly?>("RecurrenceEndDate");
        builder.Property<int?>("RecurrenceRemaining");
    }
}
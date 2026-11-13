using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.Projects;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps projects and their soft deletion filter.</summary>
public sealed class ProjectConfiguration : IEntityTypeConfiguration<Project>
{
    public void Configure(EntityTypeBuilder<Project> builder)
    {
        builder.ToTable("Project");
        builder.HasKey(project => project.Id);
        builder.Property(project => project.Name).HasMaxLength(300).IsRequired();
        builder.Property(project => project.CreatedAtUtc)
            .HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        builder.Property(project => project.UpdatedAtUtc)
            .HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        builder.Property(project => project.DeletedAtUtc)
            .HasConversion(value => value, value => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null);
        builder.HasQueryFilter(project => project.DeletedAtUtc == null);
    }
}
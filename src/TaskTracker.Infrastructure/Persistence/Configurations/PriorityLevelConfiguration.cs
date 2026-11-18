using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.Lookups;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps priority levels and their built-in seed rows.</summary>
public sealed class PriorityLevelConfiguration : IEntityTypeConfiguration<PriorityLevel>
{
    public void Configure(EntityTypeBuilder<PriorityLevel> builder)
    {
        builder.ToTable("PriorityLevel", table =>
            table.HasCheckConstraint("CK_PriorityLevel_Number", "Number IS NULL OR (typeof(Number) = 'integer' AND Number >= 1)"));
        builder.HasKey(level => level.Id);
        builder.Property(level => level.Name).HasMaxLength(300).IsRequired();
        builder.HasIndex(level => level.Name).IsUnique().HasFilter("Name <> ''");
        builder.HasIndex(level => level.Number).IsUnique().HasFilter("Number IS NOT NULL AND IsArchived = 0");
        builder.HasData(BuiltInLookups.PriorityLevels);
    }
}
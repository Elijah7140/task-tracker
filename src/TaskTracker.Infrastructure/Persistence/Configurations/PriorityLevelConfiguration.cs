using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.Lookups;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps priority levels and their built-in seed rows.</summary>
public sealed class PriorityLevelConfiguration : IEntityTypeConfiguration<PriorityLevel>
{
    public void Configure(EntityTypeBuilder<PriorityLevel> builder)
    {
        builder.ToTable("PriorityLevel");
        builder.HasKey(level => level.Id);
        builder.Property(level => level.Name).HasMaxLength(300).IsRequired();
        builder.HasIndex(level => level.Name).IsUnique();
        builder.HasData(BuiltInLookups.PriorityLevels);
    }
}
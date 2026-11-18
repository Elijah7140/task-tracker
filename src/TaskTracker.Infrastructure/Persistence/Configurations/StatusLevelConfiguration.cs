using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.Lookups;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps workflow statuses and their seed rows.</summary>
public sealed class StatusLevelConfiguration : IEntityTypeConfiguration<StatusLevel>
{
    public void Configure(EntityTypeBuilder<StatusLevel> builder)
    {
        builder.ToTable("StatusLevel", table => table.HasCheckConstraint("CK_StatusLevel_Kind", "Kind IN (0, 1)"));
        builder.HasKey(status => status.Id);
        builder.Property(status => status.Name).HasMaxLength(300).UseCollation("NOCASE").IsRequired();
        builder.HasIndex(status => status.Name).IsUnique();
        builder.HasData(BuiltInLookups.Statuses);
    }
}
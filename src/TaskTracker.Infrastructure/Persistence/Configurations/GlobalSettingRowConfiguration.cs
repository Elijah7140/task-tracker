using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps global setting key/value rows.</summary>
public sealed class GlobalSettingRowConfiguration : IEntityTypeConfiguration<GlobalSettingRow>
{
    public void Configure(EntityTypeBuilder<GlobalSettingRow> builder)
    {
        builder.ToTable("GlobalSetting");
        builder.HasKey(row => row.Key);
        builder.Property(row => row.Value).IsRequired();
    }
}
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.Projects;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps project override key/value rows.</summary>
public sealed class ProjectSettingRowConfiguration : IEntityTypeConfiguration<ProjectSettingRow>
{
    public void Configure(EntityTypeBuilder<ProjectSettingRow> builder)
    {
        builder.ToTable("ProjectSetting");
        builder.HasKey(row => new { row.ProjectId, row.Key });
        builder.Property(row => row.Value).IsRequired();
        builder.HasOne<Project>().WithMany().HasForeignKey(row => row.ProjectId).OnDelete(DeleteBehavior.Restrict);
    }
}
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.Projects;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps folders and hierarchy constraints.</summary>
public sealed class FolderConfiguration : IEntityTypeConfiguration<Folder>
{
    public void Configure(EntityTypeBuilder<Folder> builder)
    {
        builder.ToTable("Folder");
        builder.HasKey(folder => folder.Id);
        builder.Property(folder => folder.Name).HasMaxLength(300).IsRequired();
        builder.Property(folder => folder.CreatedAtUtc)
            .HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        builder.Property(folder => folder.UpdatedAtUtc)
            .HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        builder.Property(folder => folder.DeletedAtUtc)
            .HasConversion(value => value, value => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null);
        builder.HasIndex(folder => new { folder.ProjectId, folder.ParentFolderId });
        builder.HasOne<Project>().WithMany().HasForeignKey(folder => folder.ProjectId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Folder>().WithMany().HasForeignKey(folder => folder.ParentFolderId).OnDelete(DeleteBehavior.Restrict);
        builder.HasQueryFilter(folder => folder.DeletedAtUtc == null);
    }
}
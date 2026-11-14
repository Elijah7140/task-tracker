using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Projects;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps custom field definitions.</summary>
public sealed class FieldDefinitionConfiguration : IEntityTypeConfiguration<FieldDefinition>
{
    public void Configure(EntityTypeBuilder<FieldDefinition> builder)
    {
        builder.ToTable("FieldDefinition");
        builder.HasKey(field => field.Id);
        builder.Property(field => field.Key).HasMaxLength(300).IsRequired();
        builder.Property(field => field.DisplayName).HasMaxLength(300).IsRequired();
        builder.Property(field => field.DataType).HasConversion<string>().HasMaxLength(20);
        builder.HasIndex(field => field.Key).IsUnique();
        builder.HasOne<Project>().WithMany().HasForeignKey(field => field.ProjectId).OnDelete(DeleteBehavior.Restrict);
    }
}
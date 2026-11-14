using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.Fields;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps stable choices and their composite reference key.</summary>
public sealed class FieldChoiceConfiguration : IEntityTypeConfiguration<FieldChoice>
{
    public void Configure(EntityTypeBuilder<FieldChoice> builder)
    {
        builder.ToTable("FieldChoice");
        builder.HasKey(choice => choice.Id);
        builder.HasAlternateKey(choice => new { choice.FieldDefinitionId, choice.Id });
        builder.Property(choice => choice.Label).HasMaxLength(300).IsRequired();
        builder.HasOne<FieldDefinition>().WithMany().HasForeignKey(choice => choice.FieldDefinitionId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
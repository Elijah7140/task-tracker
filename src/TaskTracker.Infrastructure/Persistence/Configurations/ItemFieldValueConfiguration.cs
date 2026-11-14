using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Items;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps typed custom values and row-level integrity checks.</summary>
public sealed class ItemFieldValueConfiguration : IEntityTypeConfiguration<ItemFieldValue>
{
    public void Configure(EntityTypeBuilder<ItemFieldValue> builder)
    {
        builder.ToTable("ItemFieldValue", table => table.HasCheckConstraint(
            "CK_ItemFieldValue_ExactlyOne",
            "(TextValue IS NOT NULL) + (NumberValue IS NOT NULL) + (DateValue IS NOT NULL) + " +
            "(BoolValue IS NOT NULL) + (ChoiceId IS NOT NULL) = 1"));
        builder.HasKey(value => new { value.ItemId, value.FieldDefinitionId });
        builder.Property(value => value.NumberValue).HasColumnType("REAL");
        builder.Property(value => value.DateValue).HasColumnType("TEXT");
        builder.HasIndex(value => new { value.FieldDefinitionId, value.TextValue });
        builder.HasIndex(value => new { value.FieldDefinitionId, value.NumberValue });
        builder.HasIndex(value => new { value.FieldDefinitionId, value.DateValue });
        builder.HasIndex(value => new { value.FieldDefinitionId, value.ChoiceId });
        builder.HasOne<TodoItem>().WithMany().HasForeignKey(value => value.ItemId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<FieldDefinition>().WithMany().HasForeignKey(value => value.FieldDefinitionId)
            .OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<FieldChoice>().WithMany()
            .HasForeignKey(value => new { value.FieldDefinitionId, value.ChoiceId })
            .HasPrincipalKey(choice => new { choice.FieldDefinitionId, choice.Id })
            .OnDelete(DeleteBehavior.Restrict);
    }
}
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.Lookups;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps item types and their built-in seed rows.</summary>
public sealed class ItemTypeConfiguration : IEntityTypeConfiguration<ItemType>
{
    public void Configure(EntityTypeBuilder<ItemType> builder)
    {
        builder.ToTable("ItemType");
        builder.HasKey(itemType => itemType.Id);
        builder.Property(itemType => itemType.Name).HasMaxLength(300).IsRequired();
        builder.HasIndex(itemType => itemType.Name).IsUnique();
        builder.HasData(BuiltInLookups.ItemTypes);
    }
}
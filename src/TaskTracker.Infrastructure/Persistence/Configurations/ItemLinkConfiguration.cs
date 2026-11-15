using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.Items;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>Maps item links; they are removed with their item on a permanent delete.</summary>
public sealed class ItemLinkConfiguration : IEntityTypeConfiguration<ItemLink>
{
    public void Configure(EntityTypeBuilder<ItemLink> builder)
    {
        builder.ToTable("ItemLink");
        builder.HasKey(link => link.Id);
        builder.Property(link => link.Url).HasMaxLength(LinkPolicy.UrlMaxLength).IsRequired();
        builder.Property(link => link.Title).HasMaxLength(LinkPolicy.TitleMaxLength);
        builder.Property(link => link.CreatedAtUtc)
            .HasConversion(value => value, value => DateTime.SpecifyKind(value, DateTimeKind.Utc));
        builder.HasIndex(link => new { link.ItemId, link.SortOrder });
        builder.HasOne<TodoItem>().WithMany().HasForeignKey(link => link.ItemId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
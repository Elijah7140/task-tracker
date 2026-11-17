using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using TaskTracker.Core.SavedSearches;

namespace TaskTracker.Infrastructure.Persistence.Configurations;

/// <summary>
/// Maps saved searches. The project and folder ids are deliberately not foreign keys: a saved
/// search outlives a deleted project and reports it when opened instead.
/// </summary>
public sealed class SavedSearchConfiguration : IEntityTypeConfiguration<SavedSearch>
{
    public void Configure(EntityTypeBuilder<SavedSearch> builder)
    {
        builder.ToTable("SavedSearch");
        builder.HasKey(search => search.Id);
        builder.Property(search => search.Name).HasMaxLength(SavedSearch.NameMaxLength).UseCollation("NOCASE").IsRequired();
        builder.Property(search => search.QueryText).HasMaxLength(SavedSearch.QueryTextMaxLength).IsRequired();
        builder.Property(search => search.ScopeKind).HasConversion<string>().HasMaxLength(20);
        builder.HasIndex(search => search.Name).IsUnique();
    }
}
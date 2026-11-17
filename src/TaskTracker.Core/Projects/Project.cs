
namespace TaskTracker.Core.Projects;

/// <summary>A project containing folders and items.</summary>
public sealed class Project
{
    public const int NameMaxLength = 300;

    private Project()
    {
    }

    public Guid Id { get; private set; }

    public string Name { get; private set; } = string.Empty;

    public string? Description { get; private set; }

    public int SortOrder { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public DateTime UpdatedAtUtc { get; private set; }

    public DateTime? DeletedAtUtc { get; private set; }

    public Guid? DeletionBatchId { get; private set; }

    public static Project Create(string name, TimeProvider clock, int sortOrder = 0)
    {
        var nowUtc = clock.GetUtcNow().UtcDateTime;

        return new Project
        {
            Id = Guid.CreateVersion7(),
            Name = ValidateName(name),
            SortOrder = sortOrder,
            CreatedAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc
        };
    }

    public void Rename(string name, TimeProvider clock)
    {
        Name = ValidateName(name);
        Touch(clock);
    }

    public void SetDescription(string? description, TimeProvider clock)
    {
        Description = description;
        Touch(clock);
    }

    public void SetSortOrder(int order, TimeProvider clock)
    {
        SortOrder = order;
        Touch(clock);
    }

    public void Delete(Guid batchId, TimeProvider clock)
    {
        if (DeletedAtUtc is not null)
        {
            return;
        }

        DeletedAtUtc = clock.GetUtcNow().UtcDateTime;
        DeletionBatchId = batchId;
        Touch(clock);
    }

    public void Restore(TimeProvider clock)
    {
        DeletedAtUtc = null;
        DeletionBatchId = null;
        Touch(clock);
    }

    /// <summary>Restores the stored timestamps when data is imported, instead of stamping the import time.</summary>
    internal void RestoreTimestamps(DateTime createdAtUtc, DateTime updatedAtUtc)
    {
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = updatedAtUtc;
    }

    private void Touch(TimeProvider clock)
    {
        UpdatedAtUtc = clock.GetUtcNow().UtcDateTime;
    }

    private static string ValidateName(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > NameMaxLength)
        {
            throw new DomainRuleException("Name must be 1 to 300 characters.");
        }

        return name.Trim();
    }
}
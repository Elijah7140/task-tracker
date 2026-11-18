using System.Globalization;

namespace TaskTracker.Core.Lookups;

/// <summary>A priority level whose list order determines its rank.</summary>
public sealed class PriorityLevel : LookupEntity
{
    private PriorityLevel()
    {
    }

    /// <summary>An optional whole-number label (1 or more), unique among active levels. Never used for ranking.</summary>
    public int? Number { get; private set; }

    /// <summary>How the level is shown: "7", "7 · Hotfix", or the name alone when it has no number.</summary>
    public string Label
    {
        get
        {
            if (Number is not int number)
            {
                return Name;
            }

            var label = number.ToString(CultureInfo.InvariantCulture);
            return Name.Length == 0 ? label : $"{label} · {Name}";
        }
    }

    public override void Rename(string name)
    {
        SetLabel(name, Number);
    }

    /// <summary>Sets the name and number together; the name may be empty only when there is a number.</summary>
    public void SetLabel(string name, int? number)
    {
        if (number is < 1)
        {
            throw new DomainRuleException("Priority number must be at least 1.");
        }

        if (number.HasValue && string.IsNullOrWhiteSpace(name))
        {
            Name = string.Empty;
        }
        else
        {
            base.Rename(name);
        }

        Number = number;
    }

    public static PriorityLevel Create(string name, int sortOrder = 0, int? number = null)
    {
        var value = new PriorityLevel
        {
            Id = Guid.CreateVersion7(),
            SortOrder = sortOrder
        };

        value.SetLabel(name, number);
        return value;
    }

    internal static PriorityLevel BuiltIn(Guid id, string name, int order)
    {
        return new PriorityLevel
        {
            Id = id,
            Name = name,
            SortOrder = order,
            IsBuiltIn = true
        };
    }
}
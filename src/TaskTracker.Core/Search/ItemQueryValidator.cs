using TaskTracker.Core.Fields;
using TaskTracker.Core.Persistence;

namespace TaskTracker.Core.Search;

/// <summary>Rejects invalid search scopes and field conditions before storage access.</summary>
public sealed class ItemQueryValidator(IUnitOfWorkFactory factory)
{
    public async Task<IReadOnlyList<SearchableField>> ValidateAsync(
        ItemQuery query, CancellationToken cancellationToken = default)
    {
        await using var unit = factory.Begin();
        return await ValidateAsync(query, unit, cancellationToken);
    }

    internal async Task<IReadOnlyList<SearchableField>> ValidateAsync(
        ItemQuery query, IUnitOfWork unit, CancellationToken cancellationToken)
    {
        await ValidateScopeAsync(query.Scope, unit, cancellationToken);
        var fields = await FieldRegistry.GetFieldsAsync(query.Scope, unit, cancellationToken);

        foreach (var filter in query.Filters)
        {
            var field = fields.FirstOrDefault(candidate => candidate.Key == filter.FieldKey);

            if (field is null)
            {
                throw new DomainRuleException($"Unknown search field '{filter.FieldKey}'.");
            }

            await ValidateFilterAsync(field, filter, unit, cancellationToken);
        }

        return fields;
    }

    private static async Task ValidateScopeAsync(SearchScope scope, IUnitOfWork unit,
        CancellationToken cancellationToken)
    {
        if (scope is SearchScope.AllProjects)
        {
            return;
        }

        var projectId = scope is SearchScope.Project project ? project.ProjectId : ((SearchScope.Area)scope).ProjectId;
        if (await unit.Projects.FindAsync(projectId, false, cancellationToken) is null)
        {
            throw new DomainRuleException("Search project does not exist.");
        }

        if (scope is SearchScope.Area { FolderId: Guid folderId })
        {
            var folders = await unit.Folders.ListAsync(projectId, false, cancellationToken);

            if (!folders.Any(folder => folder.Id == folderId))
            {
                throw new DomainRuleException("Search folder does not exist in the project.");
            }
        }
    }

    private static async Task ValidateFilterAsync(SearchableField field, FieldFilter filter,
        IUnitOfWork unit, CancellationToken cancellationToken)
    {
        var operation = filter.Operator;

        if (!SearchOperators.For(field).Contains(operation))
        {
            throw new DomainRuleException($"Invalid operator for search field '{field.Key}'.");
        }

        if (operation is FilterOperator.IsEmpty or FilterOperator.IsNotEmpty)
        {
            if (filter.Value is not null)
            {
                throw new DomainRuleException($"'{field.Key}' does not take a value for {operation}.");
            }

            return;
        }

        if (!HasValidValue(field, filter))
        {
            throw new DomainRuleException($"Invalid operator or value for search field '{field.Key}'.");
        }

        await ValidateChoiceAsync(field, filter.Value, unit, cancellationToken);
    }

    private static bool HasValidValue(SearchableField field, FieldFilter filter)
    {
        return field.DataType switch
        {
            FieldDataType.Text => filter.Value is FilterValue.Text { Value: not null },
            FieldDataType.Number => ValidateOrdered(filter.Operator, filter.Value, true),
            FieldDataType.Date => ValidateOrdered(filter.Operator, filter.Value, false),
            FieldDataType.Boolean => filter.Value is FilterValue.Bool,
            FieldDataType.Choice => ValidateChoiceValue(field, filter),
            _ => false
        };
    }

    private static async Task ValidateChoiceAsync(SearchableField field, FilterValue? value,
        IUnitOfWork unit, CancellationToken cancellationToken)
    {
        if (value is not (FilterValue.Choice or FilterValue.ChoiceRange))
        {
            return;
        }

        var choices = await FieldRegistry.GetChoicesAsync(field, unit, cancellationToken);
        var ids = value is FilterValue.Choice choice
            ? new[] { choice.Id }
            : new[] { ((FilterValue.ChoiceRange)value).Min, ((FilterValue.ChoiceRange)value).Max };

        if (ids.Any(id => !choices.Any(option => option.Id == id)))
        {
            throw new DomainRuleException($"Choice does not belong to search field '{field.Key}'.");
        }

        if (value is FilterValue.ChoiceRange range)
        {
            ValidatePriorityRange(range, choices);
        }
    }

    private static void ValidatePriorityRange(FilterValue.ChoiceRange range,
        IReadOnlyList<SearchChoice> choices)
    {
        var minRank = choices.First(option => option.Id == range.Min).SortOrder;
        var maxRank = choices.First(option => option.Id == range.Max).SortOrder;

        if (minRank > maxRank)
        {
            throw new DomainRuleException("Priority range must run from more important to less important.");
        }
    }

    private static bool ValidateOrdered(FilterOperator operation, FilterValue? value, bool number)
    {
        var isRange = operation is FilterOperator.Between;

        if (number)
        {
            return isRange ? IsValidNumberRange(value) : IsFiniteNumber(value);
        }

        return isRange ? IsValidDateRange(value) : value is FilterValue.Date;
    }

    private static bool IsFiniteNumber(FilterValue? value)
    {
        return value is FilterValue.Number numeric && double.IsFinite(numeric.Value);
    }

    private static bool IsValidNumberRange(FilterValue? value)
    {
        if (value is not FilterValue.NumberRange range)
        {
            return false;
        }

        return double.IsFinite(range.Min) && double.IsFinite(range.Max) && range.Min <= range.Max;
    }

    private static bool IsValidDateRange(FilterValue? value)
    {
        return value is FilterValue.DateRange dates && dates.Min <= dates.Max;
    }

    private static bool ValidateChoiceValue(SearchableField field, FieldFilter filter)
    {
        if (field.Key == "priority" && field.IsBuiltIn && filter.Operator == FilterOperator.Between)
        {
            return filter.Value is FilterValue.ChoiceRange;
        }

        return filter.Value is FilterValue.Choice;
    }
}
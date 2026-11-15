using System.Collections.ObjectModel;
using System.Globalization;
using System.Runtime.CompilerServices;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Fields;
using TaskTracker.Core.Search;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>One editable field condition in the search builder.</summary>
public sealed class SearchFilterRowViewModel : ViewModelBase, IDisposable
{
    private readonly IFieldRegistry registry;
    private readonly Action<Exception> reportError;
    private int choicesVersion;
    private CancellationTokenSource? choicesCancellation;
    private bool disposed;
    private SearchableField? selectedField;
    private SearchOperatorOption? selectedOperator;
    private SearchChoice? selectedChoice;
    private SearchChoice? secondChoice;
    private string firstText = string.Empty;
    private string secondText = string.Empty;
    private DateTime? firstDate;
    private DateTime? secondDate;
    private bool booleanValue;

    /// <summary>Creates a blank row; failures while loading choices go to <paramref name="reportError"/>.</summary>
    public SearchFilterRowViewModel(IFieldRegistry registry, IReadOnlyList<SearchableField> fields,
        Action<SearchFilterRowViewModel> remove, Action<Exception> reportError)
    {
        this.registry = registry;
        this.reportError = reportError;
        Fields = new ObservableCollection<SearchableField>(fields);
        RemoveCommand = new RelayCommand(() => remove(this));
    }

    public ObservableCollection<SearchableField> Fields { get; }

    public ObservableCollection<SearchOperatorOption> Operators { get; } = [];

    public ObservableCollection<SearchChoice> Choices { get; } = [];

    public IReadOnlyList<string> BooleanChoices { get; } = ["No", "Yes"];

    public ICommand RemoveCommand { get; }

    /// <summary>The latest choice load, for callers that must wait for it.</summary>
    public Task ChoicesTask { get; private set; } = Task.CompletedTask;

    public SearchableField? SelectedField
    {
        get => selectedField;
        set
        {
            if (SetProperty(ref selectedField, value))
            {
                ResetValues();
                SetOperators();
                ChoicesTask = LoadChoicesAsync(value);
                NotifyEditor();
            }
        }
    }

    public SearchOperatorOption? SelectedOperator
    {
        get => selectedOperator;
        set
        {
            if (SetProperty(ref selectedOperator, value))
            {
                NotifyEditor();
            }
        }
    }

    public SearchChoice? SelectedChoice
    {
        get => selectedChoice;
        set => SetValue(ref selectedChoice, value);
    }

    public SearchChoice? SecondChoice
    {
        get => secondChoice;
        set => SetValue(ref secondChoice, value);
    }

    public string FirstText
    {
        get => firstText;
        set => SetValue(ref firstText, value);
    }

    public string SecondText
    {
        get => secondText;
        set => SetValue(ref secondText, value);
    }

    public DateTime? FirstDate
    {
        get => firstDate;
        set => SetValue(ref firstDate, value);
    }

    public DateTime? SecondDate
    {
        get => secondDate;
        set => SetValue(ref secondDate, value);
    }

    public bool BooleanValue
    {
        get => booleanValue;
        set
        {
            if (SetProperty(ref booleanValue, value))
            {
                OnPropertyChanged(nameof(SelectedBooleanChoice));
            }
        }
    }

    public string SelectedBooleanChoice
    {
        get => BooleanValue ? "Yes" : "No";
        set => BooleanValue = value == "Yes";
    }

    public bool HasValue => SelectedOperator?.Operator is not (FilterOperator.IsEmpty or FilterOperator.IsNotEmpty);

    public bool IsText => HasValue && SelectedField?.DataType == FieldDataType.Text;

    public bool IsNumber => HasValue && SelectedField?.DataType == FieldDataType.Number;

    public bool IsDate => HasValue && SelectedField?.DataType == FieldDataType.Date;

    public bool IsChoice => HasValue && SelectedField?.DataType == FieldDataType.Choice;

    public bool IsBoolean => HasValue && SelectedField?.DataType == FieldDataType.Boolean;

    public bool IsBetween => SelectedOperator?.Operator == FilterOperator.Between;

    public bool IsSecondNumber => IsNumber && IsBetween;

    public bool IsSecondDate => IsDate && IsBetween;

    public bool IsSecondChoice => IsChoice && IsBetween;

    /// <summary>The message shown beside the row while its value can't be searched, or null.</summary>
    public string? ValueError
    {
        get
        {
            if (HasInvalidNumber())
            {
                return "Enter a valid number.";
            }

            if (HasReversedRange())
            {
                return SelectedField?.DataType == FieldDataType.Choice
                    ? "Put the more important priority first."
                    : "The first value must not be after the second.";
            }

            return null;
        }
    }

    /// <summary>False while a number is not a number or a "between" range runs backwards.</summary>
    public bool IsValid => ValueError is null;

    /// <summary>True when the row has a field, an operator, and every value that operator needs.</summary>
    public bool IsComplete
    {
        get
        {
            if (SelectedField is null || SelectedOperator is null)
            {
                return false;
            }

            return !HasValue || HasCompleteValue(SelectedField.DataType);
        }
    }

    /// <summary>
    /// Brings the field picker in line with a new scope, in place, so the selected field
    /// and the values already entered survive.
    /// </summary>
    public void UpdateFields(IReadOnlyList<SearchableField> available)
    {
        RemoveFieldsMissingFrom(available);
        InsertFieldsMissingFrom(available);
    }

    /// <summary>
    /// Fills the row from a parsed filter: picks its field and operator, waits for the field's
    /// choices to load, then sets the values. Does nothing when the field is not offered.
    /// </summary>
    public async Task ApplyAsync(FieldFilter filter)
    {
        var field = Fields.FirstOrDefault(candidate => candidate.Key == filter.FieldKey);

        if (field is null)
        {
            return;
        }

        SelectedField = field;
        SelectedOperator = Operators.FirstOrDefault(option => option.Operator == filter.Operator);
        await ChoicesTask;
        SetValues(filter.Value);
    }

    /// <summary>Returns the filter this row describes, or null while no field or operator is picked.</summary>
    public FieldFilter? ToFilter()
    {
        if (SelectedField is null || SelectedOperator is null)
        {
            return null;
        }

        return new FieldFilter(SelectedField.Key, SelectedOperator.Operator, CreateValue(SelectedField.DataType));
    }

    /// <summary>Cancels a choice load when this row leaves the page.</summary>
    public void Dispose()
    {
        if (disposed)
        {
            return;
        }

        disposed = true;
        choicesVersion++;
        choicesCancellation?.Cancel();
    }

    private void SetValues(FilterValue? value)
    {
        switch (value)
        {
            case FilterValue.Text text:
                FirstText = text.Value;
                break;

            case FilterValue.Number number:
                FirstText = FormatNumber(number.Value);
                break;

            case FilterValue.NumberRange numbers:
                FirstText = FormatNumber(numbers.Min);
                SecondText = FormatNumber(numbers.Max);
                break;

            case FilterValue.Bool flag:
                BooleanValue = flag.Value;
                break;

            default:
                SetDateAndChoiceValues(value);
                break;
        }
    }

    private void SetDateAndChoiceValues(FilterValue? value)
    {
        switch (value)
        {
            case FilterValue.Date date:
                FirstDate = date.Value.ToDateTime(TimeOnly.MinValue);
                break;

            case FilterValue.DateRange dates:
                FirstDate = dates.Min.ToDateTime(TimeOnly.MinValue);
                SecondDate = dates.Max.ToDateTime(TimeOnly.MinValue);
                break;

            case FilterValue.Choice choice:
                SelectedChoice = Choices.FirstOrDefault(option => option.Id == choice.Id);
                break;

            case FilterValue.ChoiceRange range:
                SelectedChoice = Choices.FirstOrDefault(option => option.Id == range.Min);
                SecondChoice = Choices.FirstOrDefault(option => option.Id == range.Max);
                break;
        }
    }

    private static string FormatNumber(double number)
    {
        return number.ToString("R", CultureInfo.CurrentCulture);
    }

    private void RemoveFieldsMissingFrom(IReadOnlyList<SearchableField> available)
    {
        foreach (var field in Fields.ToArray())
        {
            if (field.Key != SelectedField?.Key && !available.Any(candidate => candidate.Key == field.Key))
            {
                Fields.Remove(field);
            }
        }
    }

    private void InsertFieldsMissingFrom(IReadOnlyList<SearchableField> available)
    {
        for (var index = 0; index < available.Count; index++)
        {
            if (!Fields.Any(field => field.Key == available[index].Key))
            {
                Fields.Insert(Math.Min(index, Fields.Count), available[index]);
            }
        }
    }

    private void SetValue<T>(ref T storage, T value, [CallerMemberName] string? propertyName = null)
    {
        if (SetProperty(ref storage, value, propertyName))
        {
            OnPropertyChanged(nameof(ValueError));
            OnPropertyChanged(nameof(IsValid));
            OnPropertyChanged(nameof(IsComplete));
        }
    }

    private void ResetValues()
    {
        FirstText = string.Empty;
        SecondText = string.Empty;
        FirstDate = null;
        SecondDate = null;
        SelectedChoice = null;
        SecondChoice = null;
        BooleanValue = false;
    }

    private bool HasCompleteValue(FieldDataType dataType)
    {
        switch (dataType)
        {
            case FieldDataType.Text:
                return !string.IsNullOrWhiteSpace(FirstText);

            case FieldDataType.Number:
                return IsValid;

            case FieldDataType.Date:
                return FirstDate is not null && (!IsBetween || SecondDate is not null) && IsValid;

            case FieldDataType.Choice:
                return SelectedChoice is not null && (!IsBetween || SecondChoice is not null) && IsValid;

            case FieldDataType.Boolean:
                return true;

            default:
                return false;
        }
    }

    private FilterValue? CreateValue(FieldDataType dataType)
    {
        if (!HasValue)
        {
            return null;
        }

        return dataType switch
        {
            FieldDataType.Text => new FilterValue.Text(FirstText),
            FieldDataType.Number => NumberValue(),
            FieldDataType.Date => DateValue(),
            FieldDataType.Boolean => new FilterValue.Bool(BooleanValue),
            FieldDataType.Choice => ChoiceValue(),
            _ => null
        };
    }

    private FilterValue? NumberValue()
    {
        if (!TryNumber(FirstText, out var first))
        {
            return null;
        }

        if (!IsBetween)
        {
            return new FilterValue.Number(first);
        }

        if (!TryNumber(SecondText, out var second))
        {
            return null;
        }

        return new FilterValue.NumberRange(first, second);
    }

    private FilterValue? DateValue()
    {
        if (FirstDate is not DateTime first)
        {
            return null;
        }

        var start = DateOnly.FromDateTime(first);

        if (!IsBetween)
        {
            return new FilterValue.Date(start);
        }

        if (SecondDate is not DateTime second)
        {
            return null;
        }

        return new FilterValue.DateRange(start, DateOnly.FromDateTime(second));
    }

    private FilterValue? ChoiceValue()
    {
        if (SelectedChoice is null)
        {
            return null;
        }

        if (!IsBetween)
        {
            return new FilterValue.Choice(SelectedChoice.Id);
        }

        if (SecondChoice is null)
        {
            return null;
        }

        return new FilterValue.ChoiceRange(SelectedChoice.Id, SecondChoice.Id);
    }

    private void SetOperators()
    {
        Operators.Clear();

        if (SelectedField is null)
        {
            SelectedOperator = null;
            return;
        }

        foreach (var operation in SearchOperators.For(SelectedField))
        {
            Operators.Add(SearchOperatorLabels.Option(SelectedField, operation));
        }

        SelectedOperator = Operators.FirstOrDefault();
    }

    /// <summary>
    /// Fills the choice list for the field. Only the newest load may fill it, so switching
    /// fields quickly (A, B, A) cannot add the same choices twice.
    /// </summary>
    private async Task LoadChoicesAsync(SearchableField? field)
    {
        var version = ++choicesVersion;
        choicesCancellation?.Cancel();
        Choices.Clear();

        if (disposed || field is null || field.DataType != FieldDataType.Choice)
        {
            return;
        }

        var cancellation = new CancellationTokenSource();
        choicesCancellation = cancellation;

        try
        {
            await TryFillChoicesAsync(field, version, cancellation);
        }
        finally
        {
            ReleaseChoicesCancellation(cancellation);
        }
    }

    private async Task TryFillChoicesAsync(SearchableField field, int version, CancellationTokenSource cancellation)
    {
        try
        {
            var choices = await registry.GetChoicesAsync(field, cancellation.Token);

            if (IsCurrentChoiceLoad(version))
            {
                AddChoices(choices);
            }
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            if (IsCurrentChoiceLoad(version))
            {
                reportError(exception);
            }
        }
    }

    private bool IsCurrentChoiceLoad(int version)
    {
        return !disposed && version == choicesVersion;
    }

    private void ReleaseChoicesCancellation(CancellationTokenSource finished)
    {
        if (ReferenceEquals(choicesCancellation, finished))
        {
            choicesCancellation = null;
        }

        finished.Dispose();
    }

    private void AddChoices(IReadOnlyList<SearchChoice> choices)
    {
        foreach (var choice in choices)
        {
            Choices.Add(choice);
        }
    }

    private void NotifyEditor()
    {
        OnPropertyChanged(nameof(HasValue));
        OnPropertyChanged(nameof(IsText));
        OnPropertyChanged(nameof(IsNumber));
        OnPropertyChanged(nameof(IsDate));
        OnPropertyChanged(nameof(IsChoice));
        OnPropertyChanged(nameof(IsBoolean));
        OnPropertyChanged(nameof(IsBetween));
        OnPropertyChanged(nameof(IsSecondNumber));
        OnPropertyChanged(nameof(IsSecondDate));
        OnPropertyChanged(nameof(IsSecondChoice));
        OnPropertyChanged(nameof(ValueError));
        OnPropertyChanged(nameof(IsValid));
        OnPropertyChanged(nameof(IsComplete));
    }

    private bool HasInvalidNumber()
    {
        if (!IsNumber)
        {
            return false;
        }

        if (!TryNumber(FirstText, out _))
        {
            return true;
        }

        return IsBetween && !TryNumber(SecondText, out _);
    }

    private bool HasReversedRange()
    {
        if (!IsBetween)
        {
            return false;
        }

        if (IsNumber)
        {
            return NumberValue() is FilterValue.NumberRange numbers && numbers.Min > numbers.Max;
        }

        if (IsDate)
        {
            return DateValue() is FilterValue.DateRange dates && dates.Min > dates.Max;
        }

        // Priority choices are listed most important first, so a lower sort order ranks higher.
        return IsChoice
            && SelectedChoice is not null
            && SecondChoice is not null
            && SelectedChoice.SortOrder > SecondChoice.SortOrder;
    }

    private static bool TryNumber(string text, out double number)
    {
        return double.TryParse(text, NumberStyles.Float, CultureInfo.CurrentCulture, out number)
            && double.IsFinite(number);
    }
}
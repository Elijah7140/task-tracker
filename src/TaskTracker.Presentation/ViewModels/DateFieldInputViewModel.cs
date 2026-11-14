using System.Globalization;
using System.Windows.Input;

using CommunityToolkit.Mvvm.Input;

using TaskTracker.Core.Fields;

namespace TaskTracker.Presentation.ViewModels;

/// <summary>A date chosen with a date picker and cleared with a button.</summary>
public sealed class DateFieldInputViewModel : CustomFieldInputViewModel
{
    private readonly DateOnly? storedDate;
    private DateTime? date;

    public DateFieldInputViewModel(FieldDefinition definition, ItemFieldValue? value)
        : base(definition)
    {
        storedDate = value?.DateValue;
        date = ToPickerDate(storedDate);
        ClearCommand = new RelayCommand(Clear);
    }

    /// <summary>The picker's selected date; its time part is always midnight.</summary>
    public DateTime? Date
    {
        get => date;
        set
        {
            if (SetProperty(ref date, value))
            {
                NotifyValueChanged();
            }
        }
    }

    public ICommand ClearCommand { get; }

    public override string DisplayValue
    {
        get { return Date?.ToString("d", CultureInfo.CurrentCulture) ?? "(none)"; }
    }

    public override FieldValueInput ToInput()
    {
        DateOnly? picked = Date is null ? null : DateOnly.FromDateTime(Date.Value);

        return new FieldValueInput(FieldId, DateValue: picked);
    }

    public override void Revert()
    {
        Date = ToPickerDate(storedDate);
    }

    protected override FieldValueInput OriginalInput()
    {
        return new FieldValueInput(FieldId, DateValue: storedDate);
    }

    private void Clear()
    {
        Date = null;
    }

    private static DateTime? ToPickerDate(DateOnly? value)
    {
        return value?.ToDateTime(TimeOnly.MinValue);
    }
}
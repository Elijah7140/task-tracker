using Avalonia.Controls;
using Avalonia.Controls.Templates;

using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.App.Desktop;

/// <summary>
/// Picks the view for a ViewModel shown in a <see cref="ContentControl"/>.
/// Pairs are registered explicitly (no reflection or naming conventions), because the
/// ViewModels live in a separate, UI-agnostic assembly.
/// </summary>
public sealed class ViewLocator : IDataTemplate
{
    private readonly Dictionary<Type, Func<Control>> _views = new();

    /// <summary>Registers <typeparamref name="TView"/> as the view for <typeparamref name="TViewModel"/>.</summary>
    public ViewLocator Register<TViewModel, TView>()
        where TViewModel : ViewModelBase
        where TView : Control, new()
    {
        _views[typeof(TViewModel)] = () => new TView();
        return this;
    }

    public Control? Build(object? param) =>
        param is not null && _views.TryGetValue(param.GetType(), out var create)
            ? create()
            : new TextBlock { Text = $"No view registered for {param?.GetType().Name}" };

    public bool Match(object? data) => data is ViewModelBase;
}
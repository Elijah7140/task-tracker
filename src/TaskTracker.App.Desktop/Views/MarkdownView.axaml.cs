using System.Windows.Input;

using Avalonia;
using Avalonia.Controls;

using TaskTracker.Presentation.Markdown;

namespace TaskTracker.App.Desktop.Views;

/// <summary>
/// Read-only rendering of parsed Markdown blocks (§7.10). Clicking an openable link runs
/// <see cref="LinkCommand"/> with its address; the view never launches anything itself.
/// </summary>
public partial class MarkdownView : UserControl
{
    /// <summary>The blocks to show.</summary>
    public static readonly StyledProperty<IReadOnlyList<MarkdownBlock>?> BlocksProperty =
        AvaloniaProperty.Register<MarkdownView, IReadOnlyList<MarkdownBlock>?>(nameof(Blocks));

    /// <summary>The command run with a link's address as its parameter.</summary>
    public static readonly StyledProperty<ICommand?> LinkCommandProperty =
        AvaloniaProperty.Register<MarkdownView, ICommand?>(nameof(LinkCommand));

    public MarkdownView()
    {
        InitializeComponent();
    }

    public IReadOnlyList<MarkdownBlock>? Blocks
    {
        get => GetValue(BlocksProperty);
        set => SetValue(BlocksProperty, value);
    }

    public ICommand? LinkCommand
    {
        get => GetValue(LinkCommandProperty);
        set => SetValue(LinkCommandProperty, value);
    }

    protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
    {
        base.OnPropertyChanged(change);

        if (change.Property == BlocksProperty)
        {
            Rebuild();
        }
    }

    private void Rebuild()
    {
        var builder = new MarkdownControlBuilder(OpenLink);
        Host.Content = builder.BuildBlocks(Blocks ?? []);
    }

    private void OpenLink(string url)
    {
        if (LinkCommand?.CanExecute(url) == true)
        {
            LinkCommand.Execute(url);
        }
    }
}
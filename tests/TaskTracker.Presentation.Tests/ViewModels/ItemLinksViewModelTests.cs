using TaskTracker.Core.Items;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

public sealed class ItemLinksViewModelTests
{
    private static readonly Guid FirstId = Guid.CreateVersion7();
    private static readonly Guid SecondId = Guid.CreateVersion7();

    [Fact]
    public void A_new_list_is_not_dirty()
    {
        var links = Stored(("https://a.example", null));

        Assert.False(links.IsDirty);
        Assert.Null(links.ChangedInputs());
    }

    [Fact]
    public void Submitting_a_valid_link_adds_it_and_clears_the_boxes()
    {
        var links = Stored();
        links.NewUrl = "  https://example.com/x  ";
        links.NewTitle = " Spec ";

        links.SubmitCommand.Execute(null);

        var row = Assert.Single(links.Items);
        Assert.Equal("https://example.com/x", row.Url);
        Assert.Equal("Spec", row.Title);
        Assert.Equal(string.Empty, links.NewUrl);
        Assert.Null(links.Error);
        Assert.True(links.IsDirty);
    }

    [Theory]
    [InlineData("", "Enter a link address.")]
    [InlineData("example.com", "A link must be a full http, https or mailto address.")]
    [InlineData("file:///C:/secrets.txt", "A link must be a full http, https or mailto address.")]
    [InlineData("javascript:alert(1)", "A link must be a full http, https or mailto address.")]
    [InlineData("https://a b.example", "A link address cannot contain spaces; write a space as %20.")]
    public void Invalid_addresses_set_a_message_and_add_nothing(string url, string message)
    {
        var links = Stored();
        links.NewUrl = url;

        links.SubmitCommand.Execute(null);

        Assert.Equal(message, links.Error);
        Assert.Empty(links.Items);
    }

    [Fact]
    public void An_address_over_the_limit_is_refused()
    {
        var links = Stored();
        links.NewUrl = "https://example.com/" + new string('a', LinkPolicy.UrlMaxLength);

        links.SubmitCommand.Execute(null);

        Assert.Equal($"A link address must be {LinkPolicy.UrlMaxLength} characters or fewer.", links.Error);
    }

    [Fact]
    public void A_title_over_the_limit_is_refused()
    {
        var links = Stored();
        links.NewUrl = "https://example.com";
        links.NewTitle = new string('t', LinkPolicy.TitleMaxLength + 1);

        links.SubmitCommand.Execute(null);

        Assert.Equal($"A link title must be {LinkPolicy.TitleMaxLength} characters or fewer.", links.Error);
    }

    [Fact]
    public void Mailto_links_are_accepted()
    {
        var links = Stored();
        links.NewUrl = "mailto:team@example.com";

        links.SubmitCommand.Execute(null);

        Assert.Single(links.Items);
    }

    [Fact]
    public void Removing_a_link_makes_the_list_dirty_and_a_changed_list_is_reported()
    {
        var links = Stored(("https://a.example", null), ("https://b.example", null));

        links.Items[0].RemoveCommand.Execute(null);

        var changed = links.ChangedInputs();
        Assert.NotNull(changed);
        Assert.Equal(["https://b.example"], changed.Select(input => input.Url));
        Assert.Equal(SecondId, changed[0].Id);
    }

    [Fact]
    public void Moving_links_reorders_them_and_the_edges_do_nothing()
    {
        var links = Stored(("https://a.example", null), ("https://b.example", null));

        links.Items[0].MoveUpCommand.Execute(null);
        Assert.False(links.IsDirty);
        links.Items[0].MoveDownCommand.Execute(null);

        Assert.Equal(["https://b.example", "https://a.example"], links.Items.Select(row => row.Url));
        Assert.True(links.IsDirty);
    }

    [Fact]
    public void Moving_a_link_back_makes_the_list_clean_again()
    {
        var links = Stored(("https://a.example", null), ("https://b.example", null));
        links.Items[0].MoveDownCommand.Execute(null);

        links.Items[1].MoveUpCommand.Execute(null);

        Assert.False(links.IsDirty);
    }

    [Fact]
    public void Editing_a_link_keeps_its_id_and_replaces_its_row()
    {
        var links = Stored(("https://a.example", "Aye"));
        links.Items[0].EditCommand.Execute(null);
        Assert.True(links.IsEditing);
        Assert.Equal("Update link", links.SubmitText);
        Assert.Equal("https://a.example", links.NewUrl);
        Assert.Equal("Aye", links.NewTitle);

        links.NewUrl = "https://changed.example";
        links.SubmitCommand.Execute(null);

        var row = Assert.Single(links.Items);
        Assert.Equal(FirstId, row.Id);
        Assert.Equal("https://changed.example", row.Url);
        Assert.False(links.IsEditing);
        Assert.Equal("Add link", links.SubmitText);
    }

    [Fact]
    public void Cancelling_an_edit_changes_nothing()
    {
        var links = Stored(("https://a.example", null));
        links.Items[0].EditCommand.Execute(null);
        links.NewUrl = "https://changed.example";

        links.CancelEditCommand.Execute(null);

        Assert.False(links.IsEditing);
        Assert.False(links.IsDirty);
        Assert.Equal("https://a.example", links.Items[0].Url);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void Starting_another_edit_keeps_pending_text_until_it_is_cancelled(bool editingExistingLink)
    {
        var links = Stored(("https://a.example", null), ("https://b.example", "Bee"));

        if (editingExistingLink)
        {
            links.Items[0].EditCommand.Execute(null);
        }

        links.NewUrl = "https://pending.example";
        links.NewTitle = "Pending";

        links.Items[1].EditCommand.Execute(null);

        Assert.Equal("Finish or cancel the link you're editing first.", links.Error);
        Assert.Equal(editingExistingLink, links.IsEditing);
        Assert.Equal("https://pending.example", links.NewUrl);
        Assert.Equal("Pending", links.NewTitle);
        links.CancelEditCommand.Execute(null);
        links.Items[1].EditCommand.Execute(null);
        Assert.Equal("https://b.example", links.NewUrl);
        Assert.Null(links.Error);
    }

    [Fact]
    public void Text_left_in_the_add_box_makes_the_list_dirty()
    {
        var links = Stored();
        links.NewUrl = "https://typed.example";

        Assert.True(links.IsDirty);
    }

    [Fact]
    public void Committing_pending_text_adds_it_or_reports_failure()
    {
        var links = Stored();
        links.NewUrl = "https://typed.example";
        Assert.True(links.TryCommitPending());
        Assert.Single(links.Items);

        links.NewUrl = "nonsense";
        Assert.False(links.TryCommitPending());
        Assert.NotNull(links.Error);
        Assert.Single(links.Items);
    }

    [Fact]
    public void Nothing_pending_commits_trivially()
    {
        Assert.True(Stored().TryCommitPending());
    }

    [Fact]
    public void No_more_than_the_maximum_number_of_links_can_be_added()
    {
        var links = Stored();

        for (var count = 0; count <= LinkPolicy.MaxLinksPerItem; count++)
        {
            links.NewUrl = $"https://example.com/{count}";
            links.SubmitCommand.Execute(null);
        }

        Assert.Equal(LinkPolicy.MaxLinksPerItem, links.Items.Count);
        Assert.NotNull(links.Error);
    }

    [Fact]
    public void Reverted_lists_start_from_the_stored_links()
    {
        var links = Stored(("https://a.example", null));
        links.Items[0].RemoveCommand.Execute(null);
        links.NewUrl = "https://typed.example";

        var reverted = ItemLinksViewModel.Reverted(links);

        Assert.False(reverted.IsDirty);
        Assert.Equal(["https://a.example"], reverted.Items.Select(row => row.Url));
        Assert.Equal(string.Empty, reverted.NewUrl);
    }

    [Fact]
    public void Display_text_prefers_the_title()
    {
        var links = Stored(("https://a.example", "Aye"), ("https://b.example", null));

        Assert.Equal(["Aye", "https://b.example"], links.Items.Select(row => row.DisplayText));
        Assert.Equal([true, false], links.Items.Select(row => row.HasTitle));
    }

    private static ItemLinksViewModel Stored(params (string Url, string? Title)[] stored)
    {
        var ids = new[] { FirstId, SecondId };
        var inputs = stored.Select((link, index) => new ItemLinkInput(ids[index], link.Url, link.Title)).ToList();

        return new ItemLinksViewModel(inputs);
    }
}
using TaskTracker.Core.Items;

namespace TaskTracker.Core.Tests.Items;

public sealed class TodoItemLengthTests
{
    private static readonly TimeProvider Clock = new Microsoft.Extensions.Time.Testing.FakeTimeProvider();

    [Fact]
    public void A_title_is_measured_after_trimming()
    {
        var padded = new string('a', TodoItem.TitleMaxLength) + "   ";

        var item = TodoItem.Create(Guid.NewGuid(), null, null, padded, Clock);

        Assert.Equal(TodoItem.TitleMaxLength, item.Title.Length);
        Assert.True(TodoItem.IsTitleValid(padded));
    }

    [Fact]
    public void A_title_longer_than_the_limit_once_trimmed_is_refused()
    {
        var tooLong = new string('a', TodoItem.TitleMaxLength + 1) + "  ";

        Assert.False(TodoItem.IsTitleValid(tooLong));
        Assert.Throws<ArgumentException>(() => TodoItem.Create(Guid.NewGuid(), null, null, tooLong, Clock));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void A_blank_title_is_refused(string? title)
    {
        Assert.False(TodoItem.IsTitleValid(title));
    }

    [Fact]
    public void A_ticket_number_is_measured_after_trimming()
    {
        Assert.True(TodoItem.IsTicketNumberValid(new string('T', TodoItem.TicketNumberMaxLength) + "  "));
        Assert.False(TodoItem.IsTicketNumberValid(new string('T', TodoItem.TicketNumberMaxLength + 1)));
        Assert.True(TodoItem.IsTicketNumberValid(null));
    }
}
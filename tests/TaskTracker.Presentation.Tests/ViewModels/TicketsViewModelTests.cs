#pragma warning disable xUnit1051
using Microsoft.Extensions.Time.Testing;

using TaskTracker.Core.Items;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Tickets;
using TaskTracker.Presentation.ViewModels;

namespace TaskTracker.Presentation.Tests.ViewModels;

/// <summary>Exercises scope changes, moves, and refreshes on the Tickets page.</summary>
public sealed class TicketsViewModelTests
{
    private static FakeTimeProvider Clock => new(new DateTimeOffset(2026, 11, 13, 12, 0, 0, TimeSpan.Zero));

    [Fact]
    public async Task Project_filter_survives_saves_and_reloads_open_tickets()
    {
        var clock = Clock;
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var first = await store.Projects.CreateAsync("First");
        var second = await store.Projects.CreateAsync("Second");
        var firstTicket = await AddTicketAsync(store, first.Id, "First ticket");
        await AddTicketAsync(store, second.Id, "Second ticket");
        var tickets = new TicketService(store.UnitOfWorkFactory, clock);
        using var page = new TicketsViewModel(tickets, new FakeNavigationService(), store.Saves, new ImmediateDispatcher());
        await page.LoadAsync();

        var scope = page.Projects.Single(project => project.Id == first.Id);
        page.SelectedProject = scope;
        Assert.Equal(firstTicket, Assert.Single(page.Sections.SelectMany(section => section.Rows)).Id);

        await store.Items.SetCompletedAsync(first.Id, null, firstTicket, true);

        Assert.Same(scope, page.SelectedProject);
        Assert.True(page.IsEmpty);
    }

    [Fact]
    public async Task Keyboard_step_can_enter_an_empty_section_and_return_to_no_priority()
    {
        var clock = Clock;
        await using var store = new PresentationTestStore(clock);
        await store.InitializeAsync();
        var project = await store.Projects.CreateAsync("First");
        var itemId = await AddTicketAsync(store, project.Id, "Work");
        var tickets = new TicketService(store.UnitOfWorkFactory, clock);
        using var page = new TicketsViewModel(tickets, new FakeNavigationService(), store.Saves, new ImmediateDispatcher());
        await page.LoadAsync();

        await page.MoveOneAsync(OnlyRow(page), down: true);
        Assert.Equal(BuiltInLookups.CriticalId, OnlyRow(page).PriorityId);
        await page.MoveOneAsync(OnlyRow(page), down: false);

        Assert.Equal(itemId, OnlyRow(page).Id);
        Assert.Null(OnlyRow(page).PriorityId);
        Assert.Equal("Move 'Work'", store.History.UndoDescription);
    }

    private static TicketRowViewModel OnlyRow(TicketsViewModel page)
    {
        return Assert.Single(page.Sections.SelectMany(section => section.Rows));
    }

    private static async Task<Guid> AddTicketAsync(PresentationTestStore store, Guid projectId, string title)
    {
        var item = await store.Items.CreateAsync(projectId, null, null, title);
        await store.Items.EditAsync(item.Id, new ItemEdit(title, null, "T-17", null, null, null, null, null, null));
        return item.Id;
    }
}
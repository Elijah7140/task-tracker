#pragma warning disable xUnit1051
using TaskTracker.Core;
using TaskTracker.Core.CurrentItem;
using TaskTracker.Infrastructure.Tests.Persistence;

namespace TaskTracker.Infrastructure.Tests.CurrentItem;

/// <summary>Exercises choosing and reading the tray card's current item against SQLite.</summary>
public sealed class CurrentItemServiceTests
{
    [Fact]
    public async Task No_card_is_returned_before_an_item_is_chosen()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var service = new CurrentItemService(new TestUnitOfWorkFactory(database));

        var card = await service.GetCardAsync();

        Assert.Null(card);
    }

    [Fact]
    public async Task Chosen_item_card_shows_its_title_and_area_path()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = await store.Projects(database).CreateAsync("Billing");
        var folder = await store.Folders(database).CreateAsync(project.Id, null, "dbo");
        var nested = await store.Folders(database).CreateAsync(project.Id, folder.Id, "Views");
        var item = await store.Items(database).CreateAsync(project.Id, nested.Id, null, "Fix invoice view");
        var service = new CurrentItemService(new TestUnitOfWorkFactory(database));

        await service.SetAsync(item.Id);

        await using var fresh = store.Open();
        var card = await new CurrentItemService(new TestUnitOfWorkFactory(fresh)).GetCardAsync();
        Assert.NotNull(card);
        Assert.Equal(item.Id, card.Id);
        Assert.Equal("Fix invoice view", card.Title);
        Assert.Equal("Billing › dbo › Views", card.AreaPath);
        Assert.False(card.IsCompleted);
    }

    [Fact]
    public async Task Clearing_the_choice_leaves_no_current_item()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = await store.Projects(database).CreateAsync("Project");
        var item = await store.Items(database).CreateAsync(project.Id, null, null, "Item");
        var service = new CurrentItemService(new TestUnitOfWorkFactory(database));
        await service.SetAsync(item.Id);

        await service.SetAsync(null);

        Assert.Null(await service.GetIdAsync());
    }

    [Fact]
    public async Task Deleted_current_item_is_no_longer_returned()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var project = await store.Projects(database).CreateAsync("Project");
        var item = await store.Items(database).CreateAsync(project.Id, null, null, "Item");
        var service = new CurrentItemService(new TestUnitOfWorkFactory(database));
        await service.SetAsync(item.Id);

        await store.Items(database).DeleteAsync(project.Id, null, item.Id);

        Assert.Null(await service.GetCardAsync());
    }

    [Fact]
    public async Task Choosing_a_missing_item_is_refused()
    {
        await using var store = new SqliteTestStore();
        await store.InitializeAsync();
        await using var database = store.Open();
        var service = new CurrentItemService(new TestUnitOfWorkFactory(database));

        var choose = () => service.SetAsync(Guid.NewGuid());

        await Assert.ThrowsAsync<DomainRuleException>(choose);
    }
}
using TaskTracker.Core.Calendar;
using TaskTracker.Core.Fields;
using TaskTracker.Core.Lookups;
using TaskTracker.Core.Persistence;
using TaskTracker.Core.Projects;
using TaskTracker.Core.Search;
using TaskTracker.Core.Trash;

namespace TaskTracker.Core.Tests.Search;

internal sealed class SearchTestUnitOfWork : IUnitOfWork, IUnitOfWorkFactory
{
    public List<Project> ProjectRows { get; } = [];

    public List<FieldDefinition> Definitions { get; } = [];

    public List<FieldChoice> ChoiceRows { get; } = [];

    public List<ItemType> TypeRows { get; } = [];

    public List<PriorityLevel> PriorityRows { get; } = [];

    public IProjectRepository Projects => new ProjectRepository(this);

    public IFolderRepository Folders => new FolderRepository();

    public IItemRepository Items => throw new NotSupportedException();

    public ILookupRepository Lookups => new LookupRepository(this);

    public IFieldRepository Fields => new FieldRepository(this);

    public ISettingsStore Settings => throw new NotSupportedException();

    public IItemSearch Search => throw new NotSupportedException();

    public ICalendarRepository Calendar => throw new NotSupportedException();

    public ITrashRepository Trash => throw new NotSupportedException();


    public TaskTracker.Core.Reminders.IReminderRepository Reminders => throw new NotSupportedException();

    public ISavedSearchRepository SavedSearches => throw new NotSupportedException();

    public IUnitOfWork Begin()
    {
        return this;
    }

    public Task SaveChangesAsync(CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }

    public Task SaveChangesAsync(string undoLabel, CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }

    public ValueTask DisposeAsync()
    {
        return ValueTask.CompletedTask;
    }

    private sealed class ProjectRepository(SearchTestUnitOfWork store) : IProjectRepository
    {
        public Task<IReadOnlyList<Project>> ListAsync(bool includeDeleted, CancellationToken cancellationToken)
        {
            IReadOnlyList<Project> projects = store.ProjectRows
                .Where(project => includeDeleted || project.DeletedAtUtc is null).ToList();
            return Task.FromResult(projects);
        }

        public Task<Project?> FindAsync(Guid id, bool includeDeleted, CancellationToken cancellationToken)
        {
            var project = store.ProjectRows.FirstOrDefault(project => project.Id == id
                && (includeDeleted || project.DeletedAtUtc is null));
            return Task.FromResult(project);
        }

        public void Add(Project project)
        {
            store.ProjectRows.Add(project);
        }
    }

    private sealed class FolderRepository : IFolderRepository
    {
        public Task<IReadOnlyList<Folder>> ListAsync(Guid projectId, bool includeDeleted,
            CancellationToken cancellationToken)
        {
            return Task.FromResult<IReadOnlyList<Folder>>([]);
        }

        public void Add(Folder folder)
        {
            throw new NotSupportedException();
        }
    }

    private sealed class LookupRepository(SearchTestUnitOfWork store) : ILookupRepository
    {
        public Task<IReadOnlyList<StatusLevel>> StatusesAsync(CancellationToken cancellationToken)
        {
            return Task.FromResult(BuiltInLookups.Statuses);
        }

        public void Add(StatusLevel status)
        {
            throw new NotSupportedException();
        }

        public Task<IReadOnlyList<ItemType>> ItemTypesAsync(CancellationToken cancellationToken)
        {
            return Task.FromResult<IReadOnlyList<ItemType>>(store.TypeRows);
        }

        public Task<IReadOnlyList<PriorityLevel>> PriorityLevelsAsync(CancellationToken cancellationToken)
        {
            return Task.FromResult<IReadOnlyList<PriorityLevel>>(store.PriorityRows);
        }

        public void Add(ItemType itemType)
        {
            store.TypeRows.Add(itemType);
        }

        public void Add(PriorityLevel priorityLevel)
        {
            store.PriorityRows.Add(priorityLevel);
        }
    }

    private sealed class FieldRepository(SearchTestUnitOfWork store) : IFieldRepository
    {
        public Task<IReadOnlyList<FieldDefinition>> DefinitionsAsync(CancellationToken cancellationToken)
        {
            IReadOnlyList<FieldDefinition> fields = store.Definitions.OrderBy(field => field.SortOrder).ToList();
            return Task.FromResult(fields);
        }

        public Task<IReadOnlyList<FieldChoice>> ChoicesAsync(Guid fieldId, CancellationToken cancellationToken)
        {
            IReadOnlyList<FieldChoice> choices = store.ChoiceRows
                .Where(choice => choice.FieldDefinitionId == fieldId).OrderBy(choice => choice.SortOrder).ToList();
            return Task.FromResult(choices);
        }

        public Task<IReadOnlyList<ItemFieldValue>> ValuesAsync(Guid itemId, CancellationToken cancellationToken)
        {
            return Task.FromResult<IReadOnlyList<ItemFieldValue>>([]);
        }

        public Task<bool> HasValuesAsync(Guid fieldId, CancellationToken cancellationToken)
        {
            return Task.FromResult(false);
        }

        public Task<IReadOnlyList<FieldChoice>> AllChoicesAsync(CancellationToken cancellationToken)
        {
            IReadOnlyList<FieldChoice> choices = store.ChoiceRows.OrderBy(choice => choice.SortOrder).ToList();
            return Task.FromResult(choices);
        }

        public Task<IReadOnlyList<ItemFieldValue>> ValuesForProjectAsync(Guid projectId, CancellationToken cancellationToken)
        {
            return Task.FromResult<IReadOnlyList<ItemFieldValue>>([]);
        }

        public void Add(FieldDefinition field)
        {
            store.Definitions.Add(field);
        }

        public void Add(FieldChoice choice)
        {
            store.ChoiceRows.Add(choice);
        }

        public void Add(ItemFieldValue value)
        {
            throw new NotSupportedException();
        }

        public void Remove(ItemFieldValue value)
        {
            throw new NotSupportedException();
        }
    }
}
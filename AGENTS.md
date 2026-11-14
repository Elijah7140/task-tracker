# Agent guide

Read `docs/PLAN.md` before changing anything; it is the source of truth for scope,
business rules and architecture. Section numbers (§6.1 etc.) refer to it.

## Commands

```sh
dotnet build                 # must finish with 0 warnings (warnings are errors)
dotnet test                  # Microsoft.Testing.Platform runner (see global.json)
dotnet test --project tests/TaskTracker.Core.Tests
```

On the Linux dev machine, first run `. scripts/dev-env.sh` (puts a user-local .NET SDK
and ICU library on the path when present).

## Rules

- Dependencies point inward: `App.Desktop → Presentation → Core ← Infrastructure`.
  Core references no EF Core and no UI. Presentation references no Avalonia.
- Package versions live only in `Directory.Packages.props`; `PackageReference`s have no `Version`.
- One public type per file; file-scoped namespaces; folder = namespace.
- Readability first: write code a new team member can follow on first read.
  - One statement per line. Blocks with braces on their own lines (Allman style).
  - Expression-bodied members only for one simple expression (a getter, a one-line
    delegate); never to cram logic or a long object initializer onto one line.
  - Methods short and single-purpose (aim ≤ ~25 lines); extract well-named helpers
    instead of nesting local functions or long LINQ chains.
  - Blank line between members. Intention-revealing names; no 1–2 letter names
    except loop indices and lambda parameters in trivial lambdas.
  - XML doc comments on public types and non-obvious members; no comments restating code.
- Run `dotnet format TaskTracker.slnx --verify-no-changes` before finishing.
- Time comes from an injected `TimeProvider`; time zones are passed explicitly (§5.4).
  Never call `DateTime.Now`/`UtcNow` or `TimeZoneInfo.Local` outside the composition root.
- Tests: xUnit v3 with plain `Assert`. One test class per unit under test, in a
  folder mirroring the source namespace (e.g. `Completion/CompletionServiceTests.cs`).
  Arrange / act / assert separated by blank lines. Test names read as sentences
  (`Completing_last_open_sub_item_completes_parent`). Database behaviour is tested
  against real SQLite (in-memory connection), never the EF in-memory provider.
- UI changes follow the testing standard in §11.1: a new shortcut, gesture or dialog
  gets a headless interaction test (simulated input, not a direct command call); a new
  or changed screen gets a reviewed snapshot baseline; interactive controls get an
  `AutomationProperties.AutomationId`. A bug found by hand gets a regression test.
- Do not commit; the project lead reviews and commits.

## Application operations

Application services are singletons. Each public operation opens and disposes one
`IUnitOfWork` from `IUnitOfWorkFactory`; repositories share that operation's fresh
DbContext. Save once after successful validation and domain changes. A failed operation
must leave no tracked changes for the next operation to persist. Tests read results
through a fresh context.

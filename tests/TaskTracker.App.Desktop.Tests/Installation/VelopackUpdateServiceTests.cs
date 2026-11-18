using System.Net;

using TaskTracker.App.Desktop.Installation;
using TaskTracker.Presentation.Installation;

using Velopack.Locators;
using Velopack.Sources;

namespace TaskTracker.App.Desktop.Tests.Installation;

/// <summary>Exercises the real Velopack service with controlled HTTP responses and no installer.</summary>
public sealed class VelopackUpdateServiceTests : IDisposable
{
    private readonly DirectoryInfo packages = Directory.CreateTempSubdirectory("tasktracker-update-");

    [Fact]
    public void A_build_velopack_did_not_install_reports_that_it_is_not_installed()
    {
        var updates = new VelopackUpdateService();

        var installed = updates.IsInstalled;

        Assert.False(installed);
    }

    [Fact]
    public async Task Download_and_restart_without_a_found_update_each_do_nothing()
    {
        var updates = new VelopackUpdateService();

        var downloaded = await updates.DownloadAsync();

        Assert.False(downloaded);
        Assert.False(updates.RestartToUpdate());
    }

    [Fact]
    public void An_uninstalled_build_has_no_start_with_system_entry()
    {
        var entry = StartupEntries.ForInstalledApp(isInstalled: false);

        Assert.Null(entry);
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound, UpdateCheckOutcome.FeedUnavailable)]
    [InlineData(HttpStatusCode.Unauthorized, UpdateCheckOutcome.FeedUnavailable)]
    [InlineData(HttpStatusCode.ServiceUnavailable, UpdateCheckOutcome.Failed)]
    [InlineData(null, UpdateCheckOutcome.Failed)]
    public async Task A_github_request_failure_is_mapped_to_the_appropriate_result(
        HttpStatusCode? statusCode, UpdateCheckOutcome expected)
    {
        var downloader = new StubDownloader(_ => statusCode is { } status
            ? new HttpResponseMessage(status)
            : throw new HttpRequestException(HttpRequestError.ConnectionError, "No connection."));
        var locator = new TestVelopackLocator("TaskTrackerApp", "0.1.0", packages.FullName);
        var updates = new VelopackUpdateService(locator, downloader);

        var result = await updates.CheckAsync();

        Assert.Equal(expected, result.Outcome);
        Assert.NotEmpty(downloader.Requests);
        Assert.All(downloader.Requests, request => Assert.Null(request.Headers.Authorization));
    }

    [Fact]
    public async Task A_github_prerelease_is_ignored_even_when_it_has_a_channel_manifest()
    {
        var downloader = new StubDownloader(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("""
                [{"prerelease":true,"assets":[{"name":"releases.win.json",
                "browser_download_url":"https://example.test/releases.win.json"}]}]
                """),
        });
        var locator = new TestVelopackLocator("TaskTrackerApp", "0.1.0", packages.FullName,
            appDir: null, rootDir: null, updateExe: null, channel: "win");
        var updates = new VelopackUpdateService(locator, downloader);

        var result = await updates.CheckAsync();

        Assert.Equal(UpdateCheckOutcome.UpToDate, result.Outcome);
        Assert.Single(downloader.Requests);
    }

    public void Dispose()
    {
        packages.Delete(recursive: true);
    }

    private sealed class StubDownloader(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpClientFileDownloader
    {
        public List<HttpRequestMessage> Requests { get; } = [];

        protected override HttpClient CreateHttpClient(IDictionary<string, string>? headers, double timeout)
        {
            var client = new HttpClient(new StubHandler(respond, Requests));
            foreach (var header in headers ?? new Dictionary<string, string>())
            {
                client.DefaultRequestHeaders.Add(header.Key, header.Value);
            }

            return client;
        }
    }

    private sealed class StubHandler(
        Func<HttpRequestMessage, HttpResponseMessage> respond, List<HttpRequestMessage> requests) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            requests.Add(request);
            return Task.FromResult(respond(request));
        }
    }
}
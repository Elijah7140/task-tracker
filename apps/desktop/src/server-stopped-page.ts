const markup = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
    <title>Task Tracker</title>
  </head>
  <body style="margin: 3rem; font: 16px system-ui, sans-serif; color: #3f3f46">
    <h1 style="font-size: 1.25rem">The Task Tracker server stopped.</h1>
    <p>Choose Restart in the dialog to continue.</p>
  </body>
</html>`;

/**
 * A static page with no scripts that replaces the renderer while the server is down,
 * so the app stops calling the dead RPC port until it restarts.
 */
export const serverStoppedPage = `data:text/html;charset=utf-8,${encodeURIComponent(markup)}`;

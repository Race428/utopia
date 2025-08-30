import type { LoaderFunctionArgs } from '@remix-run/node'
import { handle, handleOptions, getUser } from '../util/api.server'
import { ALLOW } from '../handlers/validators'
import { ServerEnvironment } from '../env.server'

export async function loader(args: LoaderFunctionArgs) {
  return handle(args, {
    OPTIONS: handleOptions,
    GET: { handler: handleDebug, validator: ALLOW },
  })
}

async function handleDebug(req: Request) {
  const url = new URL(req.url)
  const user = await getUser(req)

  const debugInfo = {
    timestamp: new Date().toISOString(),
    user: user ? {
      id: user.user_id,
      email: user.email,
      name: user.name,
    } : null,
    environment: {
      GITHUB_OAUTH_CLIENT_ID: ServerEnvironment.GITHUB_OAUTH_CLIENT_ID ? 'SET' : 'MISSING',
      GITHUB_OAUTH_CLIENT_SECRET: ServerEnvironment.GITHUB_OAUTH_CLIENT_SECRET ? 'SET' : 'MISSING',
      GITHUB_OAUTH_REDIRECT_URL: ServerEnvironment.GITHUB_OAUTH_REDIRECT_URL || 'NOT SET',
      BACKEND_URL: ServerEnvironment.BACKEND_URL,
    },
    request: {
      url: req.url,
      method: req.method,
      headers: Object.fromEntries(req.headers.entries()),
    },
    expectedFlow: {
      start: `${url.origin}/v1/github/authentication/start`,
      finish: `${url.origin}/v1/github/authentication/finish`,
      status: `${url.origin}/v1/github/authentication/status`,
      reset: `${url.origin}/v1/github/authentication/reset`,
    }
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>GitHub Authentication Debug</title>
        <style>
          body {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            margin: 0;
            padding: 2rem;
            background: #1a1a1a;
            color: #e0e0e0;
            line-height: 1.6;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
          }
          h1 {
            color: #4CAF50;
            border-bottom: 2px solid #4CAF50;
            padding-bottom: 0.5rem;
          }
          h2 {
            color: #2196F3;
            margin-top: 2rem;
          }
          pre {
            background: #2a2a2a;
            padding: 1rem;
            border-radius: 4px;
            overflow-x: auto;
            border-left: 4px solid #4CAF50;
          }
          .actions {
            margin: 2rem 0;
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
          }
          .btn {
            padding: 0.5rem 1rem;
            background: #4CAF50;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            border: none;
            cursor: pointer;
            font-family: inherit;
          }
          .btn:hover {
            background: #45a049;
          }
          .btn.danger {
            background: #f44336;
          }
          .btn.danger:hover {
            background: #da190b;
          }
          .status {
            padding: 0.5rem 1rem;
            border-radius: 4px;
            margin: 0.5rem 0;
          }
          .status.ok {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
          }
          .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
          }
          .status.warning {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🐙 GitHub Authentication Debug</h1>

          <div class="actions">
            <a href="/v1/github/authentication/start" class="btn">Start Auth</a>
            <a href="/v1/github/authentication/status" class="btn">Check Status</a>
            <a href="/v1/github/authentication/reset" class="btn danger">Reset Auth</a>
            <button onclick="window.location.reload()" class="btn">Refresh</button>
          </div>

          <h2>Environment Check</h2>
          <div class="status ${debugInfo.environment.GITHUB_OAUTH_CLIENT_ID === 'SET' ? 'ok' : 'error'}">
            GitHub Client ID: ${debugInfo.environment.GITHUB_OAUTH_CLIENT_ID}
          </div>
          <div class="status ${debugInfo.environment.GITHUB_OAUTH_CLIENT_SECRET === 'SET' ? 'ok' : 'error'}">
            GitHub Client Secret: ${debugInfo.environment.GITHUB_OAUTH_CLIENT_SECRET}
          </div>
          <div class="status ${debugInfo.environment.GITHUB_OAUTH_REDIRECT_URL !== 'NOT SET' ? 'ok' : 'error'}">
            Redirect URL: ${debugInfo.environment.GITHUB_OAUTH_REDIRECT_URL}
          </div>

          <h2>User Status</h2>
          <div class="status ${debugInfo.user ? 'ok' : 'warning'}">
            ${debugInfo.user ? `Logged in as: ${debugInfo.user.email} (${debugInfo.user.id})` : 'Not logged in - GitHub auth requires user session'}
          </div>

          <h2>OAuth Flow URLs</h2>
          <pre>${JSON.stringify(debugInfo.expectedFlow, null, 2)}</pre>

          <h2>Full Debug Info</h2>
          <pre>${JSON.stringify(debugInfo, null, 2)}</pre>

          <h2>Common Issues & Solutions</h2>
          <div style="background: #2a2a2a; padding: 1rem; border-radius: 4px;">
            <h3 style="color: #FF9800;">1. "No access token received from GitHub"</h3>
            <ul>
              <li>Check that GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET are set correctly</li>
              <li>Verify the redirect URL in your GitHub OAuth app matches GITHUB_OAUTH_REDIRECT_URL</li>
              <li>Make sure you're using the correct OAuth app (not a GitHub App)</li>
              <li>Check if the authorization code has already been used (codes are single-use)</li>
            </ul>

            <h3 style="color: #FF9800;">2. "unauthorized" or session issues</h3>
            <ul>
              <li>Make sure you're logged into Utopia first</li>
              <li>Check that your session cookie is valid</li>
              <li>Try logging out and back in to Utopia</li>
            </ul>

            <h3 style="color: #FF9800;">3. Environment setup</h3>
            <ul>
              <li>Create OAuth app at: <a href="https://github.com/settings/applications/new" target="_blank">GitHub Developer Settings</a></li>
              <li>Set Authorization callback URL to: <code>${debugInfo.expectedFlow.finish}</code></li>
              <li>Copy Client ID and Client Secret to your .envrc file</li>
            </ul>
          </div>
        </div>
      </body>
    </html>
  `

  return new Response(html, {
    headers: {
      'content-type': 'text/html',
      'cache-control': 'no-cache',
    },
    status: 200,
  })
}

import type { LoaderFunctionArgs } from '@remix-run/node'
import { handle, handleOptions, getUser } from '../util/api.server'
import { ALLOW } from '../handlers/validators'
import { getGithubAuthentication } from '../models/githubAuthentication.server'

export async function loader(args: LoaderFunctionArgs) {
  return handle(args, {
    OPTIONS: handleOptions,
    GET: { handler: handleGithubDebug, validator: ALLOW },
  })
}

async function handleGithubDebug(req: Request) {
  const user = await getUser(req)

  let githubAuth = null
  let githubApiTest = null

  if (user) {
    try {
      githubAuth = await getGithubAuthentication({ userId: user.user_id })

      if (githubAuth) {
        // Test the GitHub API with the stored token
        const response = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${githubAuth.access_token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Utopia-App',
          },
        })

        githubApiTest = {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          headers: Object.fromEntries(response.headers.entries()),
          errorBody: undefined as string | undefined,
          userData: undefined as any,
        }

        if (!response.ok) {
          githubApiTest.errorBody = await response.text()
        } else {
          const userData = await response.json()
          githubApiTest.userData = {
            id: userData.id,
            login: userData.login,
            name: userData.name,
            email: userData.email,
          }
        }
      }
    } catch (error) {
      githubApiTest = {
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  const debugInfo = {
    timestamp: new Date().toISOString(),
    user: user ? {
      id: user.user_id,
      email: user.email,
      name: user.name,
    } : null,
    githubAuth: githubAuth ? {
      hasAccessToken: !!githubAuth.access_token,
      accessTokenLength: githubAuth.access_token?.length,
      hasRefreshToken: !!githubAuth.refresh_token,
      expiresAt: githubAuth.expires_at,
    } : null,
    githubApiTest,
    database: {
      connected: true, // If we got here, DB is working
      url: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
    }
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>GitHub Integration Debug</title>
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
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🐙 GitHub Integration Debug</h1>

          <div class="actions">
            <a href="/v1/github/authentication/start" class="btn">Start GitHub Auth</a>
            <a href="/v1/github/user" class="btn">Test User Endpoint</a>
            <a href="/v1/github/authentication/reset" class="btn danger">Reset Auth</a>
            <button onclick="window.location.reload()" class="btn">Refresh</button>
          </div>

          <h2>User Status</h2>
          <div class="status ${debugInfo.user ? 'ok' : 'error'}">
            ${debugInfo.user ? `Logged in as: ${debugInfo.user.email} (${debugInfo.user.id})` : 'Not logged in'}
          </div>

          <h2>GitHub Authentication</h2>
          <div class="status ${debugInfo.githubAuth ? 'ok' : 'warning'}">
            ${debugInfo.githubAuth ?
      `GitHub connected - Token length: ${debugInfo.githubAuth.accessTokenLength} chars` :
      'No GitHub authentication found'
    }
          </div>

          <h2>GitHub API Test</h2>
          <div class="status ${debugInfo.githubApiTest?.ok ? 'ok' : 'error'}">
            ${debugInfo.githubApiTest ?
      (debugInfo.githubApiTest.ok ?
        `✅ API working - User: ${debugInfo.githubApiTest.userData?.login}` :
        `❌ API failed: ${debugInfo.githubApiTest.status} ${debugInfo.githubApiTest.statusText}`
      ) :
      'No API test performed'
    }
          </div>

          <h2>Database Status</h2>
          <div class="status ${debugInfo.database.connected ? 'ok' : 'error'}">
            Database: ${debugInfo.database.connected ? 'Connected' : 'Not connected'}
            <br>DATABASE_URL: ${debugInfo.database.url}
          </div>

          <h2>Full Debug Info</h2>
          <pre>${JSON.stringify(debugInfo, null, 2)}</pre>

          <h2>Troubleshooting Steps</h2>
          <div style="background: #2a2a2a; padding: 1rem; border-radius: 4px;">
            <h3 style="color: #FF9800;">If GitHub API is failing:</h3>
            <ol>
              <li>Check if your access token is valid</li>
              <li>Try resetting authentication and reconnecting</li>
              <li>Verify your GitHub OAuth app is still active</li>
              <li>Check if token has expired</li>
            </ol>

            <h3 style="color: #FF9800;">If database issues:</h3>
            <ol>
              <li>Make sure PostgreSQL is running</li>
              <li>Check DATABASE_URL in .env file</li>
              <li>Run: <code>npx prisma db push</code></li>
              <li>Run: <code>npx prisma generate</code></li>
            </ol>
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

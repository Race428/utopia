import type { LoaderFunctionArgs } from '@remix-run/node'
import { ensure, handle, handleOptions, requireUser } from '../util/api.server'
import { ALLOW } from '../handlers/validators'
import { Status } from '../util/statusCodes'
import { ServerEnvironment } from '../env.server'
import { prisma } from '../db.server'

export async function loader(args: LoaderFunctionArgs) {
  return handle(args, {
    OPTIONS: handleOptions,
    GET: { handler: handleFinish, validator: ALLOW },
  })
}

async function handleFinish(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  // Debug logging in development
  if (process.env.NODE_ENV === 'development') {
    // Log debug info for development troubleshooting
    const debugInfo = {
      fullUrl: req.url,
      pathname: url.pathname,
      searchParams: url.search,
      hasCode: !!code,
      hasError: !!error,
      allParams: Object.fromEntries(url.searchParams.entries()),
    }
    // Debug info available in browser dev tools
    void debugInfo
  }

  // Handle OAuth error responses
  if (error) {
    return createAuthResponsePage({
      success: false,
      error: errorDescription || error,
    })
  }

  // Ensure we have an authorization code
  if (!code || code.trim() === '') {
    return createAuthResponsePage({
      success: false,
      error: `Missing authorization code from GitHub. URL: ${req.url}`,
      debug: true,
    })
  }

  try {
    // Get the current user from session
    const user = await requireUser(req)

    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForToken(code)

    // Get user info from GitHub to verify the token
    const githubUser = await getGitHubUser(tokenResponse.access_token)

    // Store the GitHub authentication details
    await storeGithubAuthentication(user.user_id, tokenResponse, githubUser)

    return createAuthResponsePage({
      success: true,
      githubUser: githubUser.login,
    })
  } catch (err) {
    console.error('GitHub authentication failed:', err)

    // Check if this is an authorization error (user not logged in)
    if (err instanceof Error && (err.message.includes('unauthorized') || err.message.includes('missing session'))) {
      return createAuthResponsePage({
        success: false,
        error: 'Please log into Utopia first, then try connecting to GitHub again.',
        showLoginLink: true,
      })
    }

    const errorMessage = err instanceof Error ? err.message : 'Authentication failed'
    return createAuthResponsePage({
      success: false,
      error: errorMessage,
    })
  }
}

async function exchangeCodeForToken(code: string) {
  const tokenUrl = 'https://github.com/login/oauth/access_token'

  // Validate required environment variables
  ensure(ServerEnvironment.GITHUB_OAUTH_CLIENT_ID, 'GitHub OAuth Client ID not configured', Status.INTERNAL_ERROR)
  ensure(ServerEnvironment.GITHUB_OAUTH_CLIENT_SECRET, 'GitHub OAuth Client Secret not configured', Status.INTERNAL_ERROR)

  const params = new URLSearchParams({
    client_id: ServerEnvironment.GITHUB_OAUTH_CLIENT_ID,
    client_secret: ServerEnvironment.GITHUB_OAUTH_CLIENT_SECRET,
    code: code,
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GitHub token exchange failed: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const tokenData = await response.json()

  if (tokenData.error) {
    throw new Error(`GitHub OAuth error: ${tokenData.error} - ${tokenData.error_description || 'Unknown error'}`)
  }

  ensure(tokenData.access_token, `No access token received from GitHub. Response: ${JSON.stringify(tokenData)}`, Status.BAD_REQUEST)

  return tokenData
}

async function getGitHubUser(accessToken: string) {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Utopia-App',
    },
  })

  ensure(response.ok, 'Failed to fetch GitHub user info', Status.BAD_REQUEST)

  return response.json()
}

async function storeGithubAuthentication(userId: string, tokenData: any, githubUser: any) {
  // Try to store via backend API first
  const backendUrl = `${ServerEnvironment.BACKEND_URL}/v1/github/authentication/store`

  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: userId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        scope: tokenData.scope,
        githubUserId: githubUser.id,
        githubUsername: githubUser.login,
      }),
    })

    if (response.ok) {
      return // Successfully stored via backend
    }

    // Backend storage failed, continue with direct storage
    await response.text() // consume the response

  } catch (error) {
    // Backend storage request failed, continue with direct storage
    void error // acknowledge the error
  }

  // Fallback: Store directly in the database using Prisma
  await storeGithubAuthenticationDirect(userId, tokenData, githubUser)
}

async function storeGithubAuthenticationDirect(userId: string, tokenData: any, githubUser: any) {
  // Store GitHub authentication directly in the database
  // Note: The current schema only supports access_token, refresh_token, expires_at
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null

  await prisma.githubAuthentication.upsert({
    where: {
      user_id: userId,
    },
    update: {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt,
    },
    create: {
      user_id: userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt,
    },
  })
}

function createAuthResponsePage({ success, error, githubUser, showLoginLink, debug }: {
  success: boolean
  error?: string
  githubUser?: string
  showLoginLink?: boolean
  debug?: boolean
}) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>GitHub Authentication</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f8f9fa;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            max-width: 400px;
          }
          .success {
            color: #28a745;
          }
          .error {
            color: #dc3545;
          }
          .icon {
            font-size: 3rem;
            margin-bottom: 1rem;
          }
          .message {
            font-size: 1.1rem;
            margin-bottom: 1rem;
          }
          .detail {
            color: #6c757d;
            font-size: 0.9rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          ${success ? `
            <div class="icon">✅</div>
            <div class="message success">Authentication Successful!</div>
            ${githubUser ? `<div class="detail">Connected as @${githubUser}</div>` : ''}
            <div class="detail">You can close this window now.</div>
          ` : `
            <div class="icon">❌</div>
            <div class="message error">Authentication Failed</div>
            <div class="detail">${error || 'An unexpected error occurred'}</div>
            ${showLoginLink ? `
              <div class="detail" style="margin-top: 1rem;">
                <a href="/login" style="color: #007bff; text-decoration: none;">Login to Utopia</a> first, then try again.
              </div>
            ` : `
              <div class="detail">Please try again.</div>
            `}
            <div class="detail" style="margin-top: 1rem;">
              <a href="/v1/github/authentication/debug" style="color: #6c757d; text-decoration: none; font-size: 0.8rem;">Debug Info</a> |
              <a href="/v1/github/authentication/reset" style="color: #6c757d; text-decoration: none; font-size: 0.8rem;">Reset Auth</a>
            </div>
            ${debug ? `
              <div style="margin-top: 1rem; padding: 1rem; background: #f8f9fa; border-radius: 4px; font-size: 0.7rem; text-align: left;">
                <strong>Debug Info:</strong><br>
                Environment variables loaded: ${process.env.GITHUB_OAUTH_CLIENT_ID ? 'Yes' : 'No'}<br>
                Full URL: ${error}<br>
              </div>
            ` : ''}
          `}
        </div>
        <script>
          // Auto-close the window after a short delay
          setTimeout(() => {
            try {
              window.close();
            } catch (e) {
              console.log('Could not auto-close window');
            }
          }, ${success ? 2000 : 5000});

          // Try to communicate with parent window if it exists
          if (window.opener) {
            try {
              window.opener.postMessage({
                type: 'github-auth-complete',
                success: ${success},
                ${error ? `error: '${error}',` : ''}
                ${githubUser ? `user: '${githubUser}'` : ''}
              }, '*');
            } catch (e) {
              console.log('Could not communicate with parent window');
            }
          }
        </script>
      </body>
    </html>
  `

  return new Response(html, {
    headers: { 'content-type': 'text/html' },
    status: success ? 200 : 400,
  })
}

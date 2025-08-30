import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node'
import { handle, handleOptions, getUser } from '../util/api.server'
import { ALLOW } from '../handlers/validators'
import { ServerEnvironment } from '../env.server'

export async function loader(args: LoaderFunctionArgs) {
  return handle(args, {
    OPTIONS: handleOptions,
    GET: { handler: handleReset, validator: ALLOW },
    POST: { handler: handleReset, validator: ALLOW },
  })
}

export async function action(args: ActionFunctionArgs) {
  return handle(args, {
    OPTIONS: handleOptions,
    POST: { handler: handleReset, validator: ALLOW },
  })
}

async function handleReset(req: Request) {
  const user = await getUser(req)

  if (user) {
    console.log('Resetting GitHub authentication for user:', user.user_id)

    try {
      // Call backend to clear GitHub authentication
      const backendUrl = `${ServerEnvironment.BACKEND_URL}/v1/github/authentication/reset`

      const response = await fetch(backendUrl, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.user_id,
        }),
      })

      if (response.ok) {
        console.log('Successfully reset GitHub authentication')
      } else {
        console.warn('Backend reset failed, but continuing with client reset')
      }
    } catch (error) {
      console.warn('Failed to reset backend authentication:', error)
    }
  }

  // Return HTML page that clears all auth-related storage and redirects
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Resetting GitHub Authentication</title>
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
          .icon {
            font-size: 3rem;
            margin-bottom: 1rem;
          }
          .message {
            font-size: 1.1rem;
            margin-bottom: 1rem;
            color: #495057;
          }
          .detail {
            color: #6c757d;
            font-size: 0.9rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">🔄</div>
          <div class="message">Resetting GitHub Authentication...</div>
          <div class="detail">Clearing all cached authentication data</div>
        </div>
        <script>
          console.log('Clearing GitHub authentication state...');

          // Clear all possible storage locations
          try {
            // Clear localStorage
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && (key.includes('github') || key.includes('auth') || key.includes('token'))) {
                keysToRemove.push(key);
              }
            }
            keysToRemove.forEach(key => {
              localStorage.removeItem(key);
              console.log('Removed localStorage key:', key);
            });

            // Clear sessionStorage
            const sessionKeysToRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key && (key.includes('github') || key.includes('auth') || key.includes('token'))) {
                sessionKeysToRemove.push(key);
              }
            }
            sessionKeysToRemove.forEach(key => {
              sessionStorage.removeItem(key);
              console.log('Removed sessionStorage key:', key);
            });

            // Clear any auth-related cookies by setting them to expire
            const cookiesToClear = ['github_token', 'github_user', 'auth_state', 'oauth_state'];
            cookiesToClear.forEach(cookieName => {
              document.cookie = cookieName + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
              document.cookie = cookieName + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=' + window.location.hostname + ';';
              console.log('Cleared cookie:', cookieName);
            });

            console.log('Successfully cleared authentication state');

            // Notify parent window if this was opened as a popup
            if (window.opener) {
              try {
                window.opener.postMessage({
                  type: 'github-auth-reset',
                  success: true
                }, '*');
              } catch (e) {
                console.log('Could not communicate with parent window');
              }
            }

            // Redirect after a short delay
            setTimeout(() => {
              const redirectTo = new URLSearchParams(window.location.search).get('redirect') || '/';
              console.log('Redirecting to:', redirectTo);
              window.location.href = redirectTo;
            }, 2000);

          } catch (error) {
            console.error('Error clearing authentication state:', error);
            setTimeout(() => {
              window.location.href = '/';
            }, 3000);
          }
        </script>
      </body>
    </html>
  `

  return new Response(html, {
    headers: {
      'content-type': 'text/html',
      'cache-control': 'no-cache, no-store, must-revalidate',
    },
    status: 200,
  })
}

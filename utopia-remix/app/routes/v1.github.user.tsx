import type { LoaderFunctionArgs } from '@remix-run/node'
import { handle, handleOptions, requireUser, ensure } from '../util/api.server'
import { ALLOW } from '../handlers/validators'
import { Status } from '../util/statusCodes'
import { getGithubAuthentication } from '../models/githubAuthentication.server'

export async function loader(args: LoaderFunctionArgs) {
  return handle(args, {
    OPTIONS: handleOptions,
    GET: { handler: getGithubUser, validator: ALLOW },
  })
}

async function getGithubUser(req: Request) {
  // Get the current user
  const user = await requireUser(req)

  // Get their GitHub authentication
  const githubAuth = await getGithubAuthentication({ userId: user.user_id })
  ensure(
    githubAuth,
    'GitHub authentication not found. Please connect your GitHub account first.',
    Status.UNAUTHORIZED,
  )

  // Fetch user data from GitHub API
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${githubAuth.access_token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Utopia-App',
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    const errorMessage = `Failed to fetch GitHub user info: ${response.status} ${response.statusText} - ${errorText}`

    // Check if it's an authentication issue
    if (response.status === 401) {
      throw new Error(
        'GitHub access token is invalid or expired. Please reconnect your GitHub account.',
      )
    }

    throw new Error(errorMessage)
  }

  const githubUserData = await response.json()

  return {
    id: githubUserData.id,
    login: githubUserData.login,
    name: githubUserData.name,
    email: githubUserData.email,
    avatar_url: githubUserData.avatar_url,
    html_url: githubUserData.html_url,
    public_repos: githubUserData.public_repos,
    followers: githubUserData.followers,
    following: githubUserData.following,
    created_at: githubUserData.created_at,
  }
}

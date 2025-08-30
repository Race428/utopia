import type { LoaderFunctionArgs } from '@remix-run/node'
import { handle, handleOptions, requireUser, ensure } from '../util/api.server'
import { ALLOW } from '../handlers/validators'
import { Status } from '../util/statusCodes'
import { getGithubAuthentication } from '../models/githubAuthentication.server'

export async function loader(args: LoaderFunctionArgs) {
  return handle(args, {
    OPTIONS: handleOptions,
    GET: { handler: getGithubUserRepositories, validator: ALLOW },
  })
}

async function getGithubUserRepositories(req: Request) {
  // Get the current user
  const user = await requireUser(req)

  // Get their GitHub authentication
  const githubAuth = await getGithubAuthentication({ userId: user.user_id })
  ensure(
    githubAuth,
    'GitHub authentication not found. Please connect your GitHub account first.',
    Status.UNAUTHORIZED,
  )

  // Parse query parameters
  const url = new URL(req.url)
  const page = url.searchParams.get('page') || '1'
  const perPage = url.searchParams.get('per_page') || '30'
  const sort = url.searchParams.get('sort') || 'updated'
  const direction = url.searchParams.get('direction') || 'desc'

  // Fetch repositories from GitHub API
  const apiUrl = `https://api.github.com/user/repos?page=${page}&per_page=${perPage}&sort=${sort}&direction=${direction}`

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${githubAuth.access_token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Utopia-App',
    },
  })

  ensure(response.ok, 'Failed to fetch GitHub repositories', Status.BAD_REQUEST)

  const repositories = await response.json()

  // Return simplified repository data
  return repositories.map((repo: any) => ({
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description,
    private: repo.private,
    html_url: repo.html_url,
    clone_url: repo.clone_url,
    ssh_url: repo.ssh_url,
    default_branch: repo.default_branch,
    language: repo.language,
    stargazers_count: repo.stargazers_count,
    forks_count: repo.forks_count,
    created_at: repo.created_at,
    updated_at: repo.updated_at,
    pushed_at: repo.pushed_at,
  }))
}

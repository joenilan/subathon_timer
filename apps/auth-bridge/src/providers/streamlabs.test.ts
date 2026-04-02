import { describe, expect, it } from 'bun:test'
import { buildStreamlabsAuthorizeUrl, isAllowedStreamlabsRedirectUri } from './streamlabs'

describe('Streamlabs auth bridge helpers', () => {
  it('builds the authorize URL with redirect, scopes, and state', () => {
    const url = new URL(
      buildStreamlabsAuthorizeUrl({
        clientId: 'client-123',
        redirectUri: 'http://127.0.0.1:31847/auth/streamlabs/callback',
        scopes: ['donations.read'],
        state: 'state-abc',
      }),
    )

    expect(url.origin + url.pathname).toBe('https://streamlabs.com/api/v2.0/authorize')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:31847/auth/streamlabs/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('donations.read')
    expect(url.searchParams.get('state')).toBe('state-abc')
  })

  it('only allows loopback callback URLs', () => {
    expect(
      isAllowedStreamlabsRedirectUri(
        'http://127.0.0.1:31847/auth/streamlabs/callback',
        ['127.0.0.1', 'localhost'],
      ),
    ).toBe(true)

    expect(
      isAllowedStreamlabsRedirectUri(
        'http://localhost:31847/auth/streamlabs/callback',
        ['127.0.0.1', 'localhost'],
      ),
    ).toBe(true)

    expect(
      isAllowedStreamlabsRedirectUri(
        'https://example.com/auth/streamlabs/callback',
        ['127.0.0.1', 'localhost'],
      ),
    ).toBe(false)

    expect(
      isAllowedStreamlabsRedirectUri(
        'http://127.0.0.1:31847/other',
        ['127.0.0.1', 'localhost'],
      ),
    ).toBe(false)
  })
})

import type { createBrowserSdk } from "auth-mini/sdk/browser"

export type AuthSdk = ReturnType<typeof createBrowserSdk>

type ApiError = {
  error?: {
    message?: string
    reason?: string
  }
}

export type ApiResult<T> = { data: T; headers: Headers }

/** A Consumer secret as issued by Qwen-LB: `sk-` prefix, no whitespace. */
export function isConsumerSecret(value: string) {
  return value.startsWith("sk-") && value.length > 3 && !/\s/u.test(value)
}

async function accessToken(sdk: AuthSdk, forceRefresh = false) {
  const current = sdk.session.getState()
  if (!forceRefresh && current.accessToken) return current.accessToken
  const refreshed = await sdk.session.refresh()
  if (!refreshed.accessToken) throw new Error("Authentication session is unavailable")
  return refreshed.accessToken
}

async function fetchWithAuth(
  sdk: AuthSdk,
  path: string,
  init: RequestInit | undefined,
  options: { accept: string; jsonBody: boolean }
) {
  async function request(forceRefresh: boolean) {
    return fetch(path, {
      ...init,
      headers: {
        accept: options.accept,
        ...(options.jsonBody && init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
        authorization: `Bearer ${await accessToken(sdk, forceRefresh)}`,
      },
    })
  }

  let response = await request(false)
  if (response.status === 401 && sdk.session.getState().refreshToken) response = await request(true)
  return response
}

function apiError(response: Response, payload: unknown): Error {
  const error = "error" in (payload as object) ? (payload as ApiError).error : undefined
  const requestError = new Error(error?.message || `Request failed (${response.status})`) as Error & {
    reason?: string
  }
  requestError.reason = error?.reason
  return requestError
}

async function readJson<T>(response: Response): Promise<ApiResult<T>> {
  const body = await response.text()
  let payload: T | ApiError
  try {
    payload = JSON.parse(body) as T | ApiError
  } catch {
    throw new Error(
      response.ok
        ? `Response was not JSON (HTTP ${response.status})`
        : `Request failed (${response.status})`
    )
  }
  if (!response.ok) throw apiError(response, payload)
  return { data: payload as T, headers: response.headers }
}

export async function api<T>(sdk: AuthSdk, path: string, init?: RequestInit): Promise<T> {
  return (await apiWithHeaders<T>(sdk, path, init)).data
}

export async function apiWithHeaders<T>(
  sdk: AuthSdk,
  path: string,
  init?: RequestInit
): Promise<ApiResult<T>> {
  const response = await fetchWithAuth(sdk, path, init, {
    accept: "application/json",
    jsonBody: true,
  })
  return readJson<T>(response)
}

export async function apiForm<T>(
  sdk: AuthSdk,
  path: string,
  form: FormData,
  init?: RequestInit
): Promise<T> {
  return (await apiFormWithHeaders<T>(sdk, path, form, init)).data
}

export async function apiFormWithHeaders<T>(
  sdk: AuthSdk,
  path: string,
  form: FormData,
  init?: RequestInit
): Promise<ApiResult<T>> {
  const response = await fetchWithAuth(sdk, path, { ...init, method: "POST", body: form }, {
    accept: "application/json",
    jsonBody: false,
  })
  return readJson<T>(response)
}

/** Posts a JSON body and reads a binary reply (audio bytes) with its headers. */
export async function apiBlob(
  sdk: AuthSdk,
  path: string,
  init?: RequestInit
): Promise<ApiResult<Blob>> {
  const response = await fetchWithAuth(sdk, path, init, {
    accept: "*/*",
    jsonBody: true,
  })
  if (!response.ok) {
    const body = await response.text()
    let payload: unknown
    try {
      payload = JSON.parse(body)
    } catch (cause) {
      throw new Error(`Request failed (${response.status})`, { cause })
    }
    throw apiError(response, payload)
  }
  return { data: await response.blob(), headers: response.headers }
}

import axios, { type InternalAxiosRequestConfig } from 'axios'
import { message } from 'antd'

interface ApiErrorData {
  success: false
  error: {
    code: string
    message: string
    details?: unknown[]
  }
  traceId?: string
  timestamp?: string
}

let csrfToken = ''

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

export async function fetchCsrfToken(): Promise<void> {
  try {
    const res = await api.get<{ data: { token: string } }>('/csrf-token')
    csrfToken = res.data.data.token
  } catch {
    console.error('[CSRF] 無法取得 CSRF Token')
  }
}

const MUTATION_METHODS = new Set(['post', 'put', 'patch', 'delete'])

api.interceptors.request.use((config) => {
  if (config.method && MUTATION_METHODS.has(config.method) && csrfToken) {
    config.headers['x-csrf-token'] = csrfToken
  }
  return config
})

const PERMISSION_ERROR_CODES = new Set([
  'ERR_FORBIDDEN',
  'ERR_USER_DEACTIVATED',
  'ERR_SETUP_INCOMPLETE',
])

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!axios.isAxiosError(error) || !error.response) {
      return Promise.reject(error)
    }

    const { status, data, config: reqConfig } = error.response
    const errorData = data as ApiErrorData | undefined

    if (errorData?.traceId) {
      console.error(`[API Error] traceId: ${errorData.traceId}`, errorData)
    }

    // CSRF retry: 403 且非已知權限錯誤時，重新取得 CSRF Token 後重試一次
    if (status === 403 && error.config) {
      const config = error.config as InternalAxiosRequestConfig & { _csrfRetried?: boolean }
      const isPermissionError =
        errorData?.error?.code != null && PERMISSION_ERROR_CODES.has(errorData.error.code)

      if (!isPermissionError && !config._csrfRetried) {
        config._csrfRetried = true
        await fetchCsrfToken()
        return api(config)
      }
    }

    // 標記了 _skipAuthRedirect 的請求（如 checkAuth）不做 401 跳轉
    const skipRedirect = (reqConfig as Record<string, unknown>)?._skipAuthRedirect === true

    switch (status) {
      case 401:
        if (!skipRedirect) {
          void message.error(errorData?.error?.message ?? 'Session 已過期，請重新登入')
          window.location.href = '/login'
        }
        break
      case 403:
        void message.error(errorData?.error?.message ?? '權限不足')
        break
      case 429:
        void message.warning('操作過於頻繁，請稍後再試')
        break
      case 500:
        void message.error('系統發生錯誤，請稍後再試')
        break
    }

    return Promise.reject(error)
  },
)

export default api

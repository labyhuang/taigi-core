import { create } from 'zustand'
import api from '../utils/api'

interface AuthUser {
  id: string
  email: string
  name: string
  isSetupCompleted: boolean
  permissions: string[]
}

interface AuthState {
  isCheckingAuth: boolean
  isAuthenticated: boolean
  user: AuthUser | null
  checkAuth: () => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  isCheckingAuth: true,
  isAuthenticated: false,
  user: null,

  checkAuth: async () => {
    try {
      const res = await api.get<{ data: AuthUser }>('/auth/me', { _skipAuthRedirect: true } as never)
      set({
        isAuthenticated: true,
        user: res.data.data,
        isCheckingAuth: false,
      })
    } catch {
      set({
        isAuthenticated: false,
        user: null,
        isCheckingAuth: false,
      })
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      set({ isAuthenticated: false, user: null })
      window.location.href = '/login'
    }
  },
}))

import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import { useAuthStore } from './stores/useAuthStore'
import { fetchCsrfToken } from './utils/api'
import { ProtectedRoute } from './components/guards/ProtectedRoute'
import MainLayout from './components/layout/MainLayout'
import { PermissionAction } from '@taigi-core/shared'
import LoginPage from './pages/LoginPage'
import SetupWizard from './pages/SetupWizard'
import Dashboard from './pages/Dashboard'
import UserManagement from './pages/admin/UserManagement'
import QuestionList from './pages/QuestionBank/QuestionList'
import QuestionForm from './pages/QuestionBank/QuestionForm'
import QuestionDetail from './pages/QuestionBank/QuestionDetail'

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth)

  useEffect(() => {
    void fetchCsrfToken()
    void checkAuth()
  }, [checkAuth])

  return (
    <ConfigProvider
      locale={zhTW}
      theme={{ token: { colorPrimary: '#83c060' } }}
    >
      <BrowserRouter>
        <Routes>
          {/* 公開路由 */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupWizard />} />

          {/* 受保護路由（需登入） */}
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route index element={<Dashboard />} />

              {/* 題庫管理 */}
              <Route element={<ProtectedRoute requiredPermission={PermissionAction.QUESTION_READ} />}>
                <Route path="questions" element={<QuestionList />} />
                <Route path="questions/create" element={<QuestionForm />} />
                <Route path="questions/:id" element={<QuestionDetail />} />
                <Route path="questions/:id/edit" element={<QuestionForm />} />
              </Route>

              {/* 需特定權限的路由 */}
              <Route element={<ProtectedRoute requiredPermission={PermissionAction.USER_LIST} />}>
                <Route path="admin/users" element={<UserManagement />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}

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
import BlueprintList from './pages/ExamAssembly/BlueprintList'
import BlueprintForm from './pages/ExamAssembly/BlueprintForm'
import BlueprintDetail from './pages/ExamAssembly/BlueprintDetail'
import PaperList from './pages/ExamAssembly/PaperList'
import PaperDetail from './pages/ExamAssembly/PaperDetail'
import ExamSessionList from './pages/ExamSession/ExamSessionList'
import ExamSessionForm from './pages/ExamSession/ExamSessionForm'
import ExamSessionDetail from './pages/ExamSession/ExamSessionDetail'
import ApiClientManagement from './pages/admin/ApiClients'
import QuestionStats from './pages/Statistics/QuestionStats'
import PaperStats from './pages/Statistics/PaperStats'
import ExploreStats from './pages/Statistics/Explore'

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
                <Route path="questions/:id/stats" element={<QuestionStats />} />
              </Route>

              {/* 組卷管理 */}
              <Route element={<ProtectedRoute requiredPermission={PermissionAction.EXAM_READ} />}>
                <Route path="admin/blueprints" element={<BlueprintList />} />
                <Route path="admin/blueprints/new" element={<BlueprintForm />} />
                <Route path="admin/blueprints/:id" element={<BlueprintDetail />} />
                <Route path="admin/blueprints/:id/edit" element={<BlueprintForm />} />
                <Route path="admin/papers" element={<PaperList />} />
                <Route path="admin/papers/:id" element={<PaperDetail />} />
                <Route path="admin/papers/:id/stats" element={<PaperStats />} />
              </Route>

              {/* 統計 explore（須有 question:read） */}
              <Route element={<ProtectedRoute requiredPermission={PermissionAction.QUESTION_READ} />}>
                <Route path="statistics/explore" element={<ExploreStats />} />
              </Route>

              {/* 考期 / 應答匯入 */}
              <Route element={<ProtectedRoute requiredPermission={PermissionAction.EXAM_SESSION_READ} />}>
                <Route path="admin/exam-sessions" element={<ExamSessionList />} />
                <Route path="admin/exam-sessions/new" element={<ExamSessionForm />} />
                <Route path="admin/exam-sessions/:id" element={<ExamSessionDetail />} />
                <Route path="admin/exam-sessions/:id/edit" element={<ExamSessionForm />} />
              </Route>

              {/* API Client 管理 */}
              <Route element={<ProtectedRoute requiredPermission={PermissionAction.API_CLIENT_MANAGE} />}>
                <Route path="admin/api-clients" element={<ApiClientManagement />} />
              </Route>

              {/* 帳號管理 */}
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

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Spin, Result } from 'antd'
import { useAuthStore } from '../../stores/useAuthStore'

interface ProtectedRouteProps {
  requiredPermission?: string
}

export function ProtectedRoute({ requiredPermission }: ProtectedRouteProps) {
  const { isCheckingAuth, isAuthenticated, user } = useAuthStore()
  const location = useLocation()

  if (isCheckingAuth) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiredPermission && !user.permissions.includes(requiredPermission)) {
    return <Result status="403" title="403" subTitle="抱歉，您沒有權限存取此頁面。" />
  }

  return <Outlet />
}

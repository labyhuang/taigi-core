import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Button, Space, Typography, theme } from 'antd'
import { useAuthStore } from '../../stores/useAuthStore'
import { PermissionAction } from '@taigi-core/shared'
import type { MenuProps } from 'antd'
import { useMemo } from 'react'

const { Header, Content, Sider } = Layout
const { Text } = Typography

export default function MainLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const { token: themeToken } = theme.useToken()

  const menuItems = useMemo<MenuProps['items']>(() => {
    const items: MenuProps['items'] = [
      { key: '/', label: '儀表板' },
    ]

    if (user?.permissions.includes(PermissionAction.QUESTION_READ)) {
      items.push({ key: '/questions', label: '題庫管理' })
    }

    if (user?.permissions.includes(PermissionAction.EXAM_READ)) {
      items.push(
        { key: '/admin/blueprints', label: '組卷藍圖' },
        { key: '/admin/papers', label: '考卷管理' },
      )
    }

    if (user?.permissions.includes(PermissionAction.EXAM_SESSION_READ)) {
      items.push({ key: '/admin/exam-sessions', label: '考期管理' })
    }

    if (user?.permissions.includes(PermissionAction.QUESTION_READ)) {
      items.push({ key: '/statistics/explore', label: '統計探索' })
    }

    if (user?.permissions.includes(PermissionAction.API_CLIENT_MANAGE)) {
      items.push({ key: '/admin/api-clients', label: 'API Client' })
    }

    if (user?.permissions.includes(PermissionAction.USER_LIST)) {
      items.push({ key: '/admin/users', label: '帳號管理' })
    }

    return items
  }, [user?.permissions])

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key)
  }

  return (
    <Layout className="app-shell">
      <Sider className="app-sider" breakpoint="lg" collapsedWidth={0}>
        <div className="app-sider-brand">
          <Text strong style={{ color: themeToken.colorWhite, fontSize: 16 }}>Taigi Core</Text>
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Space>
            <Text>{user?.name ?? user?.email}</Text>
            <Button size="small" onClick={() => void logout()}>登出</Button>
          </Space>
        </Header>
        <Content className="app-content">
          <div className="page-wrap">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

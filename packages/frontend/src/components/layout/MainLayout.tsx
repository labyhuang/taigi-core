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

    if (user?.permissions.includes(PermissionAction.USER_LIST)) {
      items.push({ key: '/admin/users', label: '帳號管理' })
    }

    return items
  }, [user?.permissions])

  const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
    navigate(key)
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={0}>
        <div style={{ height: 48, margin: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text strong style={{ color: themeToken.colorWhite, fontSize: 16 }}>TaigiCore</Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: themeToken.colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <Space>
            <Text>{user?.name ?? user?.email}</Text>
            <Button size="small" onClick={() => void logout()}>登出</Button>
          </Space>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

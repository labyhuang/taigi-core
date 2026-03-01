import { useState, useEffect, useCallback } from 'react'
import {
  Typography, Table, Tag, Switch, Button, Modal, Form, Input, Select,
  Popconfirm, Space, Result, message,
} from 'antd'
import type { TableProps } from 'antd'
import axios from 'axios'
import api from '../../../utils/api'
import { useAuthStore } from '../../../stores/useAuthStore'
import { PermissionAction } from '@taigi-core/shared'

const { Title, Text } = Typography

interface RoleItem {
  id: string
  name: string
}

interface UserItem {
  id: string
  email: string
  name: string | null
  isActive: boolean
  isSetupCompleted: boolean
  isTwoFactorEnabled: boolean
  createdAt: string
  roles: RoleItem[]
}

interface PaginationMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

function hasPermission(permissions: string[], action: string): boolean {
  return permissions.includes(action)
}

export default function UserManagement() {
  const currentUser = useAuthStore((s) => s.user)
  const permissions = currentUser?.permissions ?? []

  const canInvite = hasPermission(permissions, PermissionAction.USER_INVITE)
  const canDeactivate = hasPermission(permissions, PermissionAction.USER_DEACTIVATE)
  const canAssignRole = hasPermission(permissions, PermissionAction.USER_ASSIGN_ROLE)

  const [users, setUsers] = useState<UserItem[]>([])
  const [pagination, setPagination] = useState<PaginationMeta>({ total: 0, page: 1, pageSize: 20, totalPages: 0 })
  const [tableLoading, setTableLoading] = useState(false)
  const [roles, setRoles] = useState<RoleItem[]>([])

  // Invite states
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteForm] = Form.useForm<{ email: string; roleIds: string[] }>()
  const [inviteResultOpen, setInviteResultOpen] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')

  // Edit roles states
  const [editRolesOpen, setEditRolesOpen] = useState(false)
  const [editRolesLoading, setEditRolesLoading] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [editRolesForm] = Form.useForm<{ roleIds: string[] }>()

  // Status toggle loading
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchUsers = useCallback(async (page = 1, pageSize = 20) => {
    setTableLoading(true)
    try {
      const res = await api.get<{ data: UserItem[]; meta: PaginationMeta }>('/admin/users', {
        params: { page, pageSize },
      })
      setUsers(res.data.data)
      setPagination(res.data.meta)
    } catch {
      // 全域攔截器處理
    } finally {
      setTableLoading(false)
    }
  }, [])

  const fetchRoles = useCallback(async () => {
    try {
      const res = await api.get<{ data: RoleItem[] }>('/admin/roles')
      setRoles(res.data.data)
    } catch {
      // 全域攔截器處理
    }
  }, [])

  useEffect(() => {
    void fetchUsers()
    void fetchRoles()
  }, [fetchUsers, fetchRoles])

  async function handleToggleStatus(user: UserItem) {
    setTogglingId(user.id)
    try {
      await api.patch(`/admin/users/${user.id}/status`, { isActive: !user.isActive })
      void message.success(user.isActive ? '已停權' : '已復權')
      await fetchUsers(pagination.page, pagination.pageSize)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } })?.error?.message
        void message.error(msg ?? '操作失敗')
      }
    } finally {
      setTogglingId(null)
    }
  }

  async function handleInvite(values: { email: string; roleIds: string[] }) {
    setInviteLoading(true)
    try {
      const res = await api.post<{ data: { inviteUrl: string } }>('/admin/users/invite', values)
      setInviteUrl(res.data.data.inviteUrl)
      inviteForm.resetFields()
      setInviteOpen(false)
      setInviteResultOpen(true)
      await fetchUsers(pagination.page, pagination.pageSize)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } })?.error?.message
        void message.error(msg ?? '邀請失敗')
      }
    } finally {
      setInviteLoading(false)
    }
  }

  function openEditRoles(user: UserItem) {
    setEditingUser(user)
    editRolesForm.setFieldsValue({ roleIds: user.roles.map((r) => r.id) })
    setEditRolesOpen(true)
  }

  async function handleEditRoles(values: { roleIds: string[] }) {
    if (!editingUser) return
    setEditRolesLoading(true)
    try {
      await api.put(`/admin/users/${editingUser.id}/roles`, values)
      void message.success('角色已更新')
      setEditRolesOpen(false)
      setEditingUser(null)
      await fetchUsers(pagination.page, pagination.pageSize)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } })?.error?.message
        void message.error(msg ?? '更新失敗')
      }
    } finally {
      setEditRolesLoading(false)
    }
  }

  const handleTableChange: TableProps<UserItem>['onChange'] = (pag) => {
    void fetchUsers(pag.current ?? 1, pag.pageSize ?? 20)
  }

  const columns: TableProps<UserItem>['columns'] = [
    {
      title: '姓名',
      dataIndex: 'name',
      render: (name: string | null) => name ?? <Text type="secondary">尚未設定</Text>,
    },
    {
      title: 'Email',
      dataIndex: 'email',
    },
    {
      title: '角色',
      dataIndex: 'roles',
      render: (userRoles: RoleItem[]) => (
        <Space wrap>
          {userRoles.map((r) => <Tag key={r.id}>{r.name}</Tag>)}
        </Space>
      ),
    },
    {
      title: '2FA',
      dataIndex: 'isTwoFactorEnabled',
      width: 80,
      render: (enabled: boolean) => enabled ? <Tag color="green">已啟用</Tag> : <Tag>未啟用</Tag>,
    },
    {
      title: '狀態',
      dataIndex: 'isActive',
      width: 100,
      render: (_: boolean, record: UserItem) => {
        const isSelf = record.id === currentUser?.id
        const disabled = isSelf || !canDeactivate || togglingId === record.id

        if (!record.isActive) {
          return (
            <Popconfirm title="確定要復權此帳號？" onConfirm={() => void handleToggleStatus(record)} disabled={disabled}>
              <Switch checked={false} disabled={disabled} loading={togglingId === record.id} />
            </Popconfirm>
          )
        }

        return (
          <Popconfirm title="確定要停權此帳號？停權後該使用者將立即被登出。" onConfirm={() => void handleToggleStatus(record)} disabled={disabled}>
            <Switch checked disabled={disabled} loading={togglingId === record.id} />
          </Popconfirm>
        )
      },
    },
    {
      title: '操作',
      width: 120,
      render: (_: unknown, record: UserItem) => {
        const isSelf = record.id === currentUser?.id
        return (
          <Button
            size="small"
            onClick={() => openEditRoles(record)}
            disabled={isSelf || !canAssignRole}
          >
            編輯角色
          </Button>
        )
      },
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>帳號管理</Title>
        {canInvite && (
          <Button type="primary" onClick={() => setInviteOpen(true)}>邀請新帳號</Button>
        )}
      </div>

      <Table<UserItem>
        rowKey="id"
        columns={columns}
        dataSource={users}
        loading={tableLoading}
        onChange={handleTableChange}
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 筆`,
        }}
      />

      {/* 邀請 Modal */}
      <Modal
        title="邀請新帳號"
        open={inviteOpen}
        onCancel={() => { setInviteOpen(false); inviteForm.resetFields() }}
        footer={null}
        destroyOnClose
      >
        <Form form={inviteForm} layout="vertical" onFinish={(v) => void handleInvite(v)}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: '請輸入有效的 Email' }]}>
            <Input placeholder="name@example.com" />
          </Form.Item>
          <Form.Item name="roleIds" label="角色" rules={[{ required: true, message: '請至少選擇一個角色' }]}>
            <Select
              mode="multiple"
              placeholder="請選擇角色"
              options={roles.map((r) => ({ label: r.name, value: r.id }))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={inviteLoading}>送出邀請</Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 邀請成功 Result Modal */}
      <Modal
        title="邀請成功"
        open={inviteResultOpen}
        onCancel={() => setInviteResultOpen(false)}
        footer={<Button type="primary" onClick={() => setInviteResultOpen(false)}>關閉</Button>}
      >
        <Result
          status="success"
          title="邀請已送出"
          subTitle="請將以下連結透過安全管道轉交給對方："
        />
        <div style={{ textAlign: 'center', padding: '0 24px 24px' }}>
          <Text copyable={{ text: inviteUrl }} style={{ wordBreak: 'break-all' }}>
            {inviteUrl}
          </Text>
        </div>
      </Modal>

      {/* 編輯角色 Modal */}
      <Modal
        title={`編輯角色 — ${editingUser?.name ?? editingUser?.email ?? ''}`}
        open={editRolesOpen}
        onCancel={() => { setEditRolesOpen(false); setEditingUser(null) }}
        footer={null}
        destroyOnClose
      >
        <Form form={editRolesForm} layout="vertical" onFinish={(v) => void handleEditRoles(v)}>
          <Form.Item name="roleIds" label="角色" rules={[{ required: true, message: '請至少選擇一個角色' }]}>
            <Select
              mode="multiple"
              placeholder="請選擇角色"
              options={roles.map((r) => ({ label: r.name, value: r.id }))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={editRolesLoading}>儲存</Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

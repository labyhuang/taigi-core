import { useEffect, useState, useCallback } from 'react'
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input, Checkbox, Popconfirm,
  Typography, Alert, message,
} from 'antd'
import {
  PlusOutlined, ReloadOutlined, KeyOutlined, StopOutlined, CopyOutlined,
} from '@ant-design/icons'
import api from '../../../utils/api'

const { Text, Paragraph } = Typography

interface ApiClientItem {
  id: string
  name: string
  scopes: string[]
  isActive: boolean
  lastUsedAt: string | null
  createdAt: string
  revokedAt: string | null
  createdBy: { id: string; name: string | null }
}

interface ApiClientWithKey extends ApiClientItem {
  plainKey: string
}

const AVAILABLE_SCOPES = [
  { value: 'import:candidates', label: 'import:candidates（推送考生資料）' },
  { value: 'import:responses', label: 'import:responses（推送應答資料）' },
  { value: 'import:speaking_scores', label: 'import:speaking_scores（推送口說評分）' },
] as const

interface CreateFormShape {
  name: string
  scopes: string[]
}

export default function ApiClientManagement() {
  const [data, setData] = useState<ApiClientItem[]>([])
  const [loading, setLoading] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm<CreateFormShape>()
  const [submitting, setSubmitting] = useState(false)
  const [keyModal, setKeyModal] = useState<{ open: boolean; data: ApiClientWithKey | null; isRotate: boolean }>(
    { open: false, data: null, isRotate: false },
  )

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: ApiClientItem[] }>('/admin/api-clients')
      setData(res.data.data)
    } catch {
      message.error('載入 API client 列表失敗')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleCreate = async (values: CreateFormShape) => {
    setSubmitting(true)
    try {
      const res = await api.post<{ data: ApiClientWithKey }>('/admin/api-clients', values)
      setKeyModal({ open: true, data: res.data.data, isRotate: false })
      createForm.resetFields()
      setCreateOpen(false)
      void fetchData()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '建立失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRevoke = async (id: string) => {
    try {
      await api.patch(`/admin/api-clients/${id}/revoke`)
      message.success('API key 已撤銷')
      void fetchData()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '撤銷失敗')
    }
  }

  const handleRotate = async (id: string) => {
    try {
      const res = await api.post<{ data: ApiClientWithKey }>(`/admin/api-clients/${id}/rotate`)
      setKeyModal({ open: true, data: res.data.data, isRotate: true })
      void fetchData()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? 'Rotate 失敗')
    }
  }

  return (
    <Card
      title="API Client 管理"
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchData()}>
            重新整理
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新增 API Client
          </Button>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="此功能用於外部考試系統推送考生 / 應答 / 口說評分到題庫系統。"
        description="API Key 採 sha256 雜湊儲存，建立或 rotate 時僅顯示一次明文，請務必複製保管。"
      />

      <Table<ApiClientItem>
        rowKey="id"
        loading={loading}
        dataSource={data}
        pagination={{ showTotal: (t) => `共 ${t} 筆` }}
        columns={[
          { title: '名稱', dataIndex: 'name' },
          {
            title: 'Scopes',
            dataIndex: 'scopes',
            render: (s: string[]) =>
              s.length === 0 ? <Text type="secondary">—</Text> : (
                <Space wrap size={[4, 4]}>
                  {s.map((scope) => (
                    <Tag key={scope}>{scope}</Tag>
                  ))}
                </Space>
              ),
          },
          {
            title: '狀態',
            dataIndex: 'isActive',
            width: 100,
            render: (active: boolean, record) =>
              active ? (
                <Tag color="success">啟用中</Tag>
              ) : (
                <Tag color="default">
                  已撤銷
                  {record.revokedAt
                    ? `（${new Date(record.revokedAt).toLocaleDateString('zh-TW')}）`
                    : ''}
                </Tag>
              ),
          },
          {
            title: '最後使用',
            dataIndex: 'lastUsedAt',
            width: 170,
            render: (d: string | null) =>
              d ? new Date(d).toLocaleString('zh-TW') : <Text type="secondary">未使用</Text>,
          },
          {
            title: '建立者',
            dataIndex: 'createdBy',
            width: 120,
            render: (u: { name: string | null }) => u?.name ?? '-',
          },
          {
            title: '建立時間',
            dataIndex: 'createdAt',
            width: 170,
            render: (d: string) => new Date(d).toLocaleString('zh-TW'),
          },
          {
            title: '操作',
            width: 200,
            render: (_, record) => (
              <Space size="small">
                {record.isActive ? (
                  <>
                    <Popconfirm
                      title="Rotate 後舊 key 立即失效，確定要產生新 key？"
                      onConfirm={() => void handleRotate(record.id)}
                    >
                      <Button size="small" icon={<KeyOutlined />}>
                        Rotate
                      </Button>
                    </Popconfirm>
                    <Popconfirm
                      title="撤銷後外部系統推送將被拒，確定？"
                      onConfirm={() => void handleRevoke(record.id)}
                      okText="撤銷"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                    >
                      <Button size="small" danger icon={<StopOutlined />}>
                        撤銷
                      </Button>
                    </Popconfirm>
                  </>
                ) : (
                  <Text type="secondary">已撤銷</Text>
                )}
              </Space>
            ),
          },
        ]}
      />

      {/* 建立 Modal */}
      <Modal
        title="新增 API Client"
        open={createOpen}
        onCancel={() => {
          createForm.resetFields()
          setCreateOpen(false)
        }}
        onOk={() => void createForm.submit()}
        confirmLoading={submitting}
        okText="建立"
        cancelText="取消"
      >
        <Form<CreateFormShape>
          layout="vertical"
          form={createForm}
          onFinish={(v) => void handleCreate(v)}
        >
          <Form.Item
            name="name"
            label="名稱"
            rules={[{ required: true, message: '請輸入名稱' }]}
          >
            <Input placeholder="例如：Production Exam System" />
          </Form.Item>
          <Form.Item
            name="scopes"
            label="授權範圍 (scopes)"
            rules={[{ required: true, message: '至少選擇一個 scope' }]}
          >
            <Checkbox.Group
              options={[...AVAILABLE_SCOPES]}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 顯示明文 key Modal（僅一次） */}
      <Modal
        title={keyModal.isRotate ? '已產生新 API Key' : 'API Client 已建立'}
        open={keyModal.open}
        onCancel={() => setKeyModal({ open: false, data: null, isRotate: false })}
        footer={[
          <Button
            key="close"
            type="primary"
            onClick={() => setKeyModal({ open: false, data: null, isRotate: false })}
          >
            我已複製並保管好
          </Button>,
        ]}
        closable={false}
        maskClosable={false}
        width={680}
      >
        {keyModal.data && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Alert
              type="warning"
              showIcon
              message="此 plainKey 僅顯示一次"
              description="關閉視窗後將無法再次查看。請務必複製到安全位置（密碼管理器等）。"
            />
            <Paragraph>
              <Text strong>名稱：</Text> {keyModal.data.name}
            </Paragraph>
            <Paragraph>
              <Text strong>授權：</Text>{' '}
              <Space wrap>
                {keyModal.data.scopes.map((s) => (
                  <Tag key={s}>{s}</Tag>
                ))}
              </Space>
            </Paragraph>
            <div>
              <Text strong>Plain Key：</Text>
              <Paragraph
                copyable={{
                  text: keyModal.data.plainKey,
                  icon: [<CopyOutlined key="copy" />, <CopyOutlined key="copied" />],
                  tooltips: ['複製', '已複製'],
                }}
                style={{
                  fontFamily: 'ui-monospace, Menlo, monospace',
                  fontSize: 12,
                  background: '#fafafa',
                  padding: 12,
                  borderRadius: 4,
                  wordBreak: 'break-all',
                  marginTop: 4,
                }}
              >
                {keyModal.data.plainKey}
              </Paragraph>
            </div>
            <Paragraph type="secondary" style={{ fontSize: 12 }}>
              使用方式：HTTP Header 加上{' '}
              <code>X-Api-Key: {keyModal.data.plainKey.slice(0, 20)}…</code>，
              並 POST 到{' '}
              <code>/api/exam-sessions/imports/api/&lt;type&gt;</code>。
            </Paragraph>
          </Space>
        )}
      </Modal>
    </Card>
  )
}

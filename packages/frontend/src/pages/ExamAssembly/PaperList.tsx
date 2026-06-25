import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Card, Select, Tag, Space, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import api from '../../utils/api'
import type { PaperListItem } from './types'
import { PAPER_STATUS_LABELS, PAPER_STATUS_COLORS } from './types'

export default function PaperList() {
  const navigate = useNavigate()
  const [data, setData] = useState<PaperListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [status, setStatus] = useState<string | undefined>()

  const fetchData = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page, pageSize }
      if (status) params.status = status
      const res = await api.get<{ data: PaperListItem[]; meta: { total: number } }>(
        '/papers',
        { params },
      )
      setData(res.data.data)
      setPagination({ current: page, pageSize, total: res.data.meta.total })
    } catch {
      message.error('載入考卷列表失敗')
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const columns: ColumnsType<PaperListItem> = [
    {
      title: '名稱',
      dataIndex: 'name',
      render: (name: string, record) => (
        <a onClick={() => navigate(`/admin/papers/${record.id}`)}>{name}</a>
      ),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => (
        <Tag color={PAPER_STATUS_COLORS[s]}>{PAPER_STATUS_LABELS[s] ?? s}</Tag>
      ),
    },
    {
      title: '來源藍圖',
      dataIndex: 'blueprint',
      width: 200,
      render: (bp: { id: string; name: string } | null) =>
        bp ? <a onClick={() => navigate(`/admin/blueprints/${bp.id}`)}>{bp.name}</a> : '-',
    },
    {
      title: '題目數',
      dataIndex: '_count',
      width: 90,
      align: 'center',
      render: (c: { questions: number }) => c.questions,
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
  ]

  return (
    <Card
      title="考卷列表"
      extra={
        <Select
          placeholder="狀態篩選"
          allowClear
          style={{ width: 140 }}
          value={status}
          onChange={(v) => setStatus(v)}
          options={Object.entries(PAPER_STATUS_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
        />
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 筆`,
          onChange: (page, pageSize) => void fetchData(page, pageSize),
        }}
      />
    </Card>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Card, Button, Space, Select, Tag, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '../../utils/api'
import type { ExamSessionListItem } from './types'
import { EXAM_SESSION_STATUS_LABELS, EXAM_SESSION_STATUS_COLORS } from './types'
import { CATEGORY_LABELS } from '../QuestionBank/types'

export default function ExamSessionList() {
  const navigate = useNavigate()
  const [data, setData] = useState<ExamSessionListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [examCategory, setExamCategory] = useState<string | undefined>()
  const [status, setStatus] = useState<string | undefined>()

  const fetchData = useCallback(
    async (page = 1, pageSize = 20) => {
      setLoading(true)
      try {
        const params: Record<string, unknown> = { page, pageSize }
        if (examCategory) params.examCategory = examCategory
        if (status) params.status = status
        const res = await api.get<{
          data: ExamSessionListItem[]
          meta: { total: number }
        }>('/exam-sessions', { params })
        setData(res.data.data)
        setPagination({ current: page, pageSize, total: res.data.meta.total })
      } catch {
        message.error('載入考期列表失敗')
      } finally {
        setLoading(false)
      }
    },
    [examCategory, status],
  )

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const columns: ColumnsType<ExamSessionListItem> = [
    {
      title: '名稱',
      dataIndex: 'name',
      render: (name: string, record) => (
        <a onClick={() => navigate(`/admin/exam-sessions/${record.id}`)}>{name}</a>
      ),
    },
    {
      title: '考試類型',
      dataIndex: 'examCategory',
      width: 140,
      render: (cat: string) => <Tag>{CATEGORY_LABELS[cat] ?? cat}</Tag>,
    },
    {
      title: '考試日期',
      dataIndex: 'examDate',
      width: 130,
      render: (d: string) => new Date(d).toLocaleDateString('zh-TW'),
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 100,
      render: (s: string) => (
        <Tag color={EXAM_SESSION_STATUS_COLORS[s]}>
          {EXAM_SESSION_STATUS_LABELS[s] ?? s}
        </Tag>
      ),
    },
    {
      title: '考卷',
      dataIndex: '_count',
      width: 80,
      align: 'center',
      render: (c: { papers: number }) => c.papers,
    },
    {
      title: '考生',
      dataIndex: '_count',
      width: 80,
      align: 'center',
      render: (c: { candidates: number }) => c.candidates,
    },
    {
      title: '應答',
      dataIndex: '_count',
      width: 80,
      align: 'center',
      render: (c: { responses: number }) => c.responses,
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
      title="考期管理"
      extra={
        <Space>
          <Select
            placeholder="考試類型"
            allowClear
            style={{ width: 160 }}
            value={examCategory}
            onChange={(v) => setExamCategory(v)}
            options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Select
            placeholder="狀態"
            allowClear
            style={{ width: 140 }}
            value={status}
            onChange={(v) => setStatus(v)}
            options={Object.entries(EXAM_SESSION_STATUS_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/admin/exam-sessions/new')}
          >
            新增考期
          </Button>
        </Space>
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

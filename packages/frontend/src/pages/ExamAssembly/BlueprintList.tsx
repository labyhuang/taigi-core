import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Table, Card, Button, Space, Select, Tag, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import api from '../../utils/api'
import type { BlueprintListItem } from './types'
import { CATEGORY_LABELS } from '../QuestionBank/types'

export default function BlueprintList() {
  const navigate = useNavigate()
  const [data, setData] = useState<BlueprintListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })
  const [examCategory, setExamCategory] = useState<string | undefined>()

  const fetchData = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page, pageSize }
      if (examCategory) params.examCategory = examCategory
      const res = await api.get<{ data: BlueprintListItem[]; meta: { total: number } }>(
        '/blueprints',
        { params },
      )
      setData(res.data.data)
      setPagination({ current: page, pageSize, total: res.data.meta.total })
    } catch {
      message.error('載入藍圖列表失敗')
    } finally {
      setLoading(false)
    }
  }, [examCategory])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const columns: ColumnsType<BlueprintListItem> = [
    {
      title: '名稱',
      dataIndex: 'name',
      render: (name: string, record) => (
        <a onClick={() => navigate(`/admin/blueprints/${record.id}`)}>{name}</a>
      ),
    },
    {
      title: '考試類型',
      dataIndex: 'examCategory',
      width: 160,
      render: (cat: string) => <Tag>{CATEGORY_LABELS[cat] ?? cat}</Tag>,
    },
    { title: '總題數', dataIndex: 'totalQuestions', width: 90, align: 'center' },
    { title: '總分', dataIndex: 'totalScore', width: 80, align: 'center' },
    {
      title: '已產生考卷',
      dataIndex: '_count',
      width: 110,
      align: 'center',
      render: (c: { generatedPapers: number }) => c.generatedPapers,
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
      title="雙向細目表藍圖"
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
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/admin/blueprints/new')}
          >
            新增藍圖
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

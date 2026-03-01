import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Typography, Table, Tag, Button, Select, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { TableProps } from 'antd'
import api from '../../utils/api'
import { useAuthStore } from '../../stores/useAuthStore'
import { PermissionAction } from '@taigi-core/shared'
import {
  TYPE_LABELS,
  SUB_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  QuestionType,
  QuestionStatus,
  VALID_TYPE_SUBTYPE_MAP,
  type QuestionListItem,
} from './types'

const { Title } = Typography

interface PaginationMeta {
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export default function QuestionList() {
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const permissions = currentUser?.permissions ?? []
  const canCreate = permissions.includes(PermissionAction.QUESTION_CREATE)

  const [questions, setQuestions] = useState<QuestionListItem[]>([])
  const [pagination, setPagination] = useState<PaginationMeta>({ total: 0, page: 1, pageSize: 20, totalPages: 0 })
  const [loading, setLoading] = useState(false)

  // 篩選器
  const [filterStatus, setFilterStatus] = useState<string | undefined>()
  const [filterType, setFilterType] = useState<string | undefined>()
  const [filterSubType, setFilterSubType] = useState<string | undefined>()

  const fetchQuestions = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = { page, pageSize }
      if (filterStatus) params.status = filterStatus
      if (filterType) params.type = filterType
      if (filterSubType) params.subType = filterSubType

      const res = await api.get<{ data: QuestionListItem[]; meta: PaginationMeta }>('/questions', { params })
      setQuestions(res.data.data)
      setPagination(res.data.meta)
    } catch {
      // 全域攔截器處理
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterType, filterSubType])

  useEffect(() => {
    void fetchQuestions()
  }, [fetchQuestions])

  const handleTableChange: TableProps<QuestionListItem>['onChange'] = (pag) => {
    void fetchQuestions(pag.current ?? 1, pag.pageSize ?? 20)
  }

  const subTypeOptions = filterType
    ? (VALID_TYPE_SUBTYPE_MAP[filterType] ?? []).map((st) => ({ label: SUB_TYPE_LABELS[st] ?? st, value: st }))
    : Object.entries(SUB_TYPE_LABELS).map(([value, label]) => ({ label, value }))

  const columns: TableProps<QuestionListItem>['columns'] = [
    {
      title: '題型',
      dataIndex: 'type',
      width: 80,
      render: (type: string) => <Tag>{TYPE_LABELS[type] ?? type}</Tag>,
    },
    {
      title: '子類型',
      dataIndex: 'subType',
      width: 110,
      render: (subType: string) => SUB_TYPE_LABELS[subType] ?? subType,
    },
    {
      title: '題幹摘要',
      dataIndex: 'stem',
      ellipsis: true,
      render: (stem: string | null, record: QuestionListItem) => {
        const text = stem ?? (record.isGroupParent ? '（題組）' : '—')
        return text.length > 50 ? `${text.slice(0, 50)}...` : text
      },
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status] ?? status}</Tag>
      ),
    },
    {
      title: '出題者',
      dataIndex: 'author',
      width: 100,
      render: (author: { name: string | null }) => author.name ?? '—',
    },
    {
      title: '建立時間',
      dataIndex: 'createdAt',
      width: 170,
      render: (date: string) => new Date(date).toLocaleString('zh-TW'),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>題庫管理</Title>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/questions/create')}>
            新增試題
          </Button>
        )}
      </div>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          placeholder="篩選狀態"
          style={{ width: 140 }}
          value={filterStatus}
          onChange={(v) => setFilterStatus(v)}
          options={Object.values(QuestionStatus).map((s) => ({
            label: STATUS_LABELS[s],
            value: s,
          }))}
        />
        <Select
          allowClear
          placeholder="篩選題型"
          style={{ width: 140 }}
          value={filterType}
          onChange={(v) => {
            setFilterType(v)
            setFilterSubType(undefined)
          }}
          options={Object.values(QuestionType).map((t) => ({
            label: TYPE_LABELS[t],
            value: t,
          }))}
        />
        <Select
          allowClear
          placeholder="篩選子類型"
          style={{ width: 140 }}
          value={filterSubType}
          onChange={(v) => setFilterSubType(v)}
          options={subTypeOptions}
        />
      </Space>

      <Table<QuestionListItem>
        rowKey="id"
        columns={columns}
        dataSource={questions}
        loading={loading}
        onChange={handleTableChange}
        onRow={(record) => ({
          onClick: () => navigate(`/questions/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        pagination={{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 筆`,
        }}
      />
    </div>
  )
}

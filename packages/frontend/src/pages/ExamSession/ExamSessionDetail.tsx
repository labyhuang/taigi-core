import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card, Descriptions, Table, Button, Space, Tag, Popconfirm, Statistic, Row, Col, message,
} from 'antd'
import { EditOutlined, DeleteOutlined, PlusOutlined, CheckCircleOutlined, InboxOutlined, BarChartOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import type { ExamSessionDetail, ExamSessionPaperLink } from './types'
import { EXAM_SESSION_STATUS_LABELS, EXAM_SESSION_STATUS_COLORS } from './types'
import { CATEGORY_LABELS } from '../QuestionBank/types'
import { PAPER_STATUS_LABELS, PAPER_STATUS_COLORS } from '../ExamAssembly/types'
import BindPaperModal from './components/BindPaperModal'
import ImportPanel from './components/ImportPanel'
import ImportHistoryTable from './components/ImportHistoryTable'

export default function ExamSessionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ExamSessionDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [bindOpen, setBindOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get<{ data: ExamSessionDetail }>(`/exam-sessions/${id}`)
      setData(res.data.data)
    } catch {
      message.error('載入考期失敗')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleAction = async (action: 'MARK_IMPORTED' | 'ARCHIVE') => {
    setActionLoading(true)
    try {
      await api.patch(`/exam-sessions/${id}/status`, { action })
      message.success(action === 'MARK_IMPORTED' ? '已標記為已匯入' : '考期已封存')
      void fetchData()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '操作失敗')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/exam-sessions/${id}`)
      message.success('考期已刪除')
      navigate('/admin/exam-sessions')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '刪除失敗')
    }
  }

  const handleUnbind = async (paperId: string) => {
    try {
      await api.delete(`/exam-sessions/${id}/papers/${paperId}`)
      message.success('考卷已解綁')
      void fetchData()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '解綁失敗')
    }
  }

  const handleRecomputeStats = async () => {
    if (!id) return
    try {
      await api.post('/statistics/recompute', { scope: 'all', examSessionId: id })
      message.success('統計重算已排入背景處理')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '觸發失敗')
    }
  }

  if (!data) return <Card loading={loading} />

  const isDraft = data.status === 'DRAFT'
  const isArchived = data.status === 'ARCHIVED'

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title={
          <Space>
            {data.name}
            <Tag color={EXAM_SESSION_STATUS_COLORS[data.status]}>
              {EXAM_SESSION_STATUS_LABELS[data.status] ?? data.status}
            </Tag>
          </Space>
        }
        extra={
          <Space wrap>
            {!isArchived && (
              <Button
                icon={<EditOutlined />}
                onClick={() => navigate(`/admin/exam-sessions/${id}/edit`)}
              >
                編輯
              </Button>
            )}
            {data.status === 'DRAFT' && (
              <Popconfirm
                title="標記為「已匯入」後，將鎖定考卷類別與日期。確定要繼續？"
                onConfirm={() => void handleAction('MARK_IMPORTED')}
                okText="確認"
                cancelText="取消"
              >
                <Button type="primary" icon={<CheckCircleOutlined />} loading={actionLoading}>
                  標記為已匯入
                </Button>
              </Popconfirm>
            )}
            {data.status === 'IMPORTED' && (
              <Popconfirm
                title="封存後將無法再修改與匯入，但既有統計仍保留。確定要封存？"
                onConfirm={() => void handleAction('ARCHIVE')}
                okText="封存"
                cancelText="取消"
              >
                <Button danger icon={<InboxOutlined />} loading={actionLoading}>
                  封存
                </Button>
              </Popconfirm>
            )}
            {!isDraft && (
              <Button
                icon={<BarChartOutlined />}
                onClick={() => void handleRecomputeStats()}
              >
                重新計算此場次統計
              </Button>
            )}
            {isDraft && (
              <Popconfirm
                title="刪除後無法復原，包含已綁定考卷與匯入資料。確定刪除？"
                onConfirm={() => void handleDelete()}
                okText="刪除"
                cancelText="取消"
              >
                <Button danger icon={<DeleteOutlined />}>刪除</Button>
              </Popconfirm>
            )}
          </Space>
        }
        loading={loading}
      >
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="考試類型">
            <Tag>{CATEGORY_LABELS[data.examCategory] ?? data.examCategory}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="考試日期">
            {new Date(data.examDate).toLocaleDateString('zh-TW')}
          </Descriptions.Item>
          <Descriptions.Item label="建立者">{data.createdBy?.name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="建立時間">
            {new Date(data.createdAt).toLocaleString('zh-TW')}
          </Descriptions.Item>
          <Descriptions.Item label="備註" span={2}>
            {data.description ?? '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="匯入摘要" size="small">
        <Row gutter={16}>
          <Col span={6}>
            <Statistic title="考生數" value={data.importsSummary.totalCandidates} />
          </Col>
          <Col span={6}>
            <Statistic title="應答筆數" value={data.importsSummary.totalResponses} />
          </Col>
          <Col span={6}>
            <Statistic
              title="口說已評分"
              value={data.importsSummary.responsesWithSpeakingScore}
              suffix={
                data.importsSummary.totalResponses > 0
                  ? `/ ${data.importsSummary.totalResponses}`
                  : ''
              }
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="最後匯入"
              valueStyle={{ fontSize: 16 }}
              value={
                data.importsSummary.lastImportedAt
                  ? new Date(data.importsSummary.lastImportedAt).toLocaleString('zh-TW')
                  : '—'
              }
            />
          </Col>
        </Row>
      </Card>

      <Card
        title="綁定考卷"
        size="small"
        extra={
          isDraft && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setBindOpen(true)}
            >
              綁定考卷
            </Button>
          )
        }
      >
        <Table<ExamSessionPaperLink>
          rowKey={(r) => r.examPaper.id}
          size="small"
          dataSource={data.papers}
          pagination={false}
          locale={{ emptyText: '尚未綁定任何考卷' }}
          columns={[
            {
              title: '考卷',
              dataIndex: 'examPaper',
              render: (p: ExamSessionPaperLink['examPaper']) => (
                <a onClick={() => navigate(`/admin/papers/${p.id}`)}>{p.name}</a>
              ),
            },
            {
              title: '狀態',
              dataIndex: 'examPaper',
              width: 100,
              render: (p: ExamSessionPaperLink['examPaper']) => (
                <Tag color={PAPER_STATUS_COLORS[p.status]}>
                  {PAPER_STATUS_LABELS[p.status] ?? p.status}
                </Tag>
              ),
            },
            {
              title: '卷別',
              dataIndex: 'paperVariant',
              width: 90,
              align: 'center' as const,
              render: (v: string | null) => v ?? '—',
            },
            {
              title: '綁定時間',
              dataIndex: 'attachedAt',
              width: 170,
              render: (d: string) => new Date(d).toLocaleString('zh-TW'),
            },
            ...(isDraft
              ? [
                  {
                    title: '操作',
                    width: 90,
                    render: (_: unknown, r: ExamSessionPaperLink) => (
                      <Popconfirm
                        title="確定要解綁此考卷？"
                        onConfirm={() => void handleUnbind(r.examPaper.id)}
                      >
                        <Button size="small" danger>
                          解綁
                        </Button>
                      </Popconfirm>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Card>

      <ImportPanel
        sessionId={data.id}
        disabled={isArchived}
        onImported={() => {
          setReloadKey((k) => k + 1)
          void fetchData()
        }}
      />

      <ImportHistoryTable sessionId={data.id} reloadKey={reloadKey} />

      <BindPaperModal
        open={bindOpen}
        sessionId={data.id}
        examCategory={data.examCategory}
        excludePaperIds={data.papers.map((p) => p.examPaper.id)}
        onCancel={() => setBindOpen(false)}
        onSuccess={() => {
          setBindOpen(false)
          void fetchData()
        }}
      />
    </Space>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card, Descriptions, Table, Button, Space, Tag, Modal, Input, Alert, message, Popconfirm, Checkbox, Tooltip, Typography,
} from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'

const { Text } = Typography
import { EditOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import type { BlueprintDetail as BlueprintDetailType, GeneratePaperResult, PaperSummary } from './types'
import { CATEGORY_LABELS, TYPE_LABELS, SUB_TYPE_LABELS } from '../QuestionBank/types'
import { PAPER_STATUS_LABELS, PAPER_STATUS_COLORS } from './types'

export default function BlueprintDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<BlueprintDetailType | null>(null)
  const [loading, setLoading] = useState(false)
  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [paperName, setPaperName] = useState('')
  const [generating, setGenerating] = useState(false)
  // 業務規則：考過題目不再考；spec-export.md §4.5
  const [excludeUsedQuestions, setExcludeUsedQuestions] = useState(true)

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get<{ data: BlueprintDetailType }>(`/blueprints/${id}`)
      setData(res.data.data)
    } catch {
      message.error('載入藍圖失敗')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handleDelete = async () => {
    try {
      await api.delete(`/blueprints/${id}`)
      message.success('藍圖已刪除')
      navigate('/admin/blueprints')
    } catch {
      message.error('刪除失敗')
    }
  }

  const handleGenerate = async () => {
    if (!paperName.trim()) {
      message.warning('請輸入考卷名稱')
      return
    }
    setGenerating(true)
    try {
      const res = await api.post<{ data: GeneratePaperResult }>(`/blueprints/${id}/generate`, {
        name: paperName,
        excludeUsedQuestions,
      })
      const result = res.data.data

      if (result.warnings.length > 0) {
        Modal.warning({
          title: '試卷已產生，但部分條件題數不足',
          width: 560,
          content: (
            <div>
              <p>請通知出題委員補充題庫後重新組卷，或手動微調本試卷。</p>
              {result.warnings.map((w, i) => (
                <Alert key={i} type="warning" message={w} style={{ marginBottom: 8 }} showIcon />
              ))}
            </div>
          ),
          onOk: () => navigate(`/admin/papers/${result.id}`),
        })
      } else {
        message.success('試卷已成功產生')
        navigate(`/admin/papers/${result.id}`)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '組卷失敗')
    } finally {
      setGenerating(false)
      setGenerateModalOpen(false)
      setPaperName('')
      setExcludeUsedQuestions(true)
    }
  }

  if (!data) return <Card loading={loading} />

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title={data.name}
        extra={
          <Space>
            <Button icon={<EditOutlined />} onClick={() => navigate(`/admin/blueprints/${id}/edit`)}>
              編輯
            </Button>
            <Popconfirm title="確定要刪除此藍圖？" onConfirm={() => void handleDelete()} okText="刪除" cancelText="取消">
              <Button danger icon={<DeleteOutlined />}>刪除</Button>
            </Popconfirm>
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={() => setGenerateModalOpen(true)}
            >
              產生試卷
            </Button>
          </Space>
        }
        loading={loading}
      >
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="考試類型">
            <Tag>{CATEGORY_LABELS[data.examCategory] ?? data.examCategory}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="建立者">{data.createdBy?.name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="預期總題數">{data.totalQuestions}</Descriptions.Item>
          <Descriptions.Item label="預期總分">{data.totalScore}</Descriptions.Item>
          <Descriptions.Item label="建立時間" span={2}>
            {new Date(data.createdAt).toLocaleString('zh-TW')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="條件格">
        <Table
          rowKey="id"
          dataSource={data.cells}
          pagination={false}
          size="small"
          columns={[
            { title: '#', dataIndex: 'orderIndex', width: 50 },
            {
              title: '題型',
              dataIndex: 'questionType',
              render: (t: string) => TYPE_LABELS[t] ?? t,
            },
            {
              title: '子類型',
              dataIndex: 'questionSubType',
              render: (st: string) => SUB_TYPE_LABELS[st] ?? st,
            },
            {
              title: '條件',
              dataIndex: 'criteria',
              render: (c: Record<string, string>) => {
                const entries = Object.entries(c ?? {})
                return entries.length > 0
                  ? entries.map(([k, v]) => <Tag key={k}>{k}: {v}</Tag>)
                  : '-'
              },
            },
            { title: '題數', dataIndex: 'questionCount', width: 80, align: 'center' as const },
            { title: '每題配分', dataIndex: 'scorePerQuestion', width: 100, align: 'center' as const },
            {
              title: '小計',
              width: 80,
              align: 'center' as const,
              render: (_: unknown, r: { questionCount: number; scorePerQuestion: number }) =>
                r.questionCount * r.scorePerQuestion,
            },
          ]}
        />
      </Card>

      {data.generatedPapers.length > 0 && (
        <Card title="已產生的考卷">
          <Table<PaperSummary>
            rowKey="id"
            dataSource={data.generatedPapers}
            pagination={false}
            size="small"
            columns={[
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
                  <Tag color={PAPER_STATUS_COLORS[s]}>
                    {PAPER_STATUS_LABELS[s] ?? s}
                  </Tag>
                ),
              },
              {
                title: '建立時間',
                dataIndex: 'createdAt',
                width: 170,
                render: (d: string) => new Date(d).toLocaleString('zh-TW'),
              },
            ]}
          />
        </Card>
      )}

      <Modal
        title="產生試卷"
        open={generateModalOpen}
        onCancel={() => {
          setGenerateModalOpen(false)
          setPaperName('')
          setExcludeUsedQuestions(true)
        }}
        onOk={() => void handleGenerate()}
        confirmLoading={generating}
        okText="產生"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            placeholder="請輸入考卷名稱，例如：2026春季 TSH 模擬考-A卷"
            value={paperName}
            onChange={(e) => setPaperName(e.target.value)}
          />
          <div>
            <Checkbox
              checked={excludeUsedQuestions}
              onChange={(e) => setExcludeUsedQuestions(e.target.checked)}
            >
              排除已被任何「已發布」考卷使用過的題目
            </Checkbox>
            <Tooltip
              title={
                <div>
                  <p style={{ margin: 0 }}>業務規則：考過的題目不再考。</p>
                  <p style={{ margin: '4px 0 0' }}>
                    未來開放隨到隨考時可關閉，讓題目可重覆出現於不同考期。
                  </p>
                </div>
              }
            >
              <QuestionCircleOutlined style={{ marginLeft: 6, color: '#6b7280' }} />
            </Tooltip>
            {!excludeUsedQuestions && (
              <div style={{ marginTop: 6 }}>
                <Text type="warning" style={{ fontSize: 12 }}>
                  ⚠ 已停用此規則：題目可能與既有試卷重覆。
                </Text>
              </div>
            )}
          </div>
        </Space>
      </Modal>
    </Space>
  )
}

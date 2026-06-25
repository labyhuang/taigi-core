import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card, Descriptions, Table, Button, Space, Tag, Modal, Popconfirm, Typography, message, Collapse,
} from 'antd'
import {
  DeleteOutlined, CheckCircleOutlined, EditOutlined,
  FileTextOutlined, DownloadOutlined, EyeOutlined,
  BarChartOutlined,
} from '@ant-design/icons'
import api from '../../utils/api'
import type { PaperDetail as PaperDetailType, PaperQuestionItem } from './types'
import { PAPER_STATUS_LABELS, PAPER_STATUS_COLORS } from './types'
import { TYPE_LABELS, SUB_TYPE_LABELS, CATEGORY_LABELS } from '../QuestionBank/types'

const { Text, Paragraph } = Typography

interface PreviewPayload {
  filename: string
  content: string
  warnings: string[]
}

export default function PaperDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<PaperDetailType | null>(null)
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [editNameOpen, setEditNameOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState<PreviewPayload | null>(null)

  const fetchData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get<{ data: PaperDetailType }>(`/papers/${id}`)
      setData(res.data.data)
    } catch {
      message.error('載入考卷失敗')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const handlePublish = async () => {
    setPublishing(true)
    try {
      await api.patch(`/papers/${id}/status`, { action: 'PUBLISH' })
      message.success('考卷已發布')
      void fetchData()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '發布失敗')
    } finally {
      setPublishing(false)
    }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/papers/${id}`)
      message.success('考卷已刪除')
      navigate('/admin/papers')
    } catch {
      message.error('刪除失敗')
    }
  }

  const handleRename = async () => {
    if (!newName.trim()) return
    try {
      await api.patch(`/papers/${id}`, { name: newName })
      message.success('名稱已更新')
      setEditNameOpen(false)
      void fetchData()
    } catch {
      message.error('更新失敗')
    }
  }

  // ===== 試卷輸出（spec-export.md） =====

  // GET /papers/:id/export.txt：直接觸發瀏覽器下載
  const handleDownloadTxt = () => {
    if (!id) return
    // 透過隱形 a tag 帶 download 屬性，相容 Safari / Firefox
    const a = document.createElement('a')
    a.href = `/api/papers/${id}/export.txt`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // GET /papers/:id/export.zip：用 axios 拉 blob 後再觸發下載，
  // 才能在錯誤時（例如媒體缺檔 ERR_MEDIA_MISSING）正確以 message 提示。
  const handleDownloadZip = async () => {
    if (!id) return
    try {
      const res = await api.get(`/papers/${id}/export.zip`, { responseType: 'blob' })
      const blob = new Blob([res.data as BlobPart], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safe = (data?.name ?? 'paper').replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')
      a.download = `${safe}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      void message.success('ZIP 已下載')
    } catch (err: unknown) {
      // 後端回 JSON 時 axios 會把 blob 當錯誤；嘗試解析
      type ApiErrorBody = { error?: { code?: string; message?: string; details?: unknown[] } }
      const response = (err as { response?: { data?: unknown } })?.response
      const raw = response?.data
      let parsed: ApiErrorBody | null = null
      if (raw instanceof Blob) {
        try {
          const txt = await raw.text()
          parsed = JSON.parse(txt) as ApiErrorBody
        } catch {
          parsed = null
        }
      }
      const msg = parsed?.error?.message ?? '下載失敗'
      void message.error(msg)
    }
  }

  // GET /papers/:id/export/preview：載入預覽
  const handleOpenPreview = async () => {
    if (!id) return
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewData(null)
    try {
      const res = await api.get<{ data: PreviewPayload }>(`/papers/${id}/export/preview`)
      setPreviewData(res.data.data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      void message.error(msg ?? '載入預覽失敗')
      setPreviewOpen(false)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleReplace = async (oldQuestionId: string) => {
    const newId = window.prompt('請輸入替換題目的 UUID：')
    if (!newId) return
    try {
      await api.patch(`/papers/${id}/questions/${oldQuestionId}`, {
        newQuestionId: newId,
      })
      message.success('題目已替換')
      void fetchData()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '替換失敗')
    }
  }

  if (!data) return <Card loading={loading} />

  const isDraft = data.status === 'DRAFT'
  const snapshot = data.blueprintSnapshot as {
    name?: string
    examCategory?: string
    totalQuestions?: number
    totalScore?: number
    cells?: { orderIndex: number; questionType: string; questionSubType: string; criteria: Record<string, string>; questionCount: number; scorePerQuestion: number }[]
  } | null

  const groupedQuestions: { type: string; subType: string; questions: PaperQuestionItem[] }[] = []
  for (const pq of data.questions) {
    const key = `${pq.question.type}_${pq.question.subType}`
    let group = groupedQuestions.find(
      (g) => g.type === pq.question.type && g.subType === pq.question.subType,
    )
    if (!group) {
      group = { type: pq.question.type, subType: pq.question.subType, questions: [] }
      groupedQuestions.push(group)
    }
    group.questions.push(pq)
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title={
          <Space>
            {data.name}
            <Tag color={PAPER_STATUS_COLORS[data.status]}>
              {PAPER_STATUS_LABELS[data.status] ?? data.status}
            </Tag>
          </Space>
        }
        extra={
          <Space wrap>
            <Button icon={<EyeOutlined />} onClick={() => void handleOpenPreview()}>
              預覽純文字
            </Button>
            <Button icon={<FileTextOutlined />} onClick={handleDownloadTxt}>
              下載 .txt
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => void handleDownloadZip()}>
              下載 ZIP
            </Button>
            <Button
              icon={<BarChartOutlined />}
              onClick={() => navigate(`/admin/papers/${id}/stats`)}
            >
              查看試卷統計
            </Button>
            {isDraft && (
              <>
                <Button icon={<EditOutlined />} onClick={() => { setNewName(data.name); setEditNameOpen(true) }}>
                  修改名稱
                </Button>
                <Popconfirm title="確定要刪除此考卷？" onConfirm={() => void handleDelete()} okText="刪除" cancelText="取消">
                  <Button danger icon={<DeleteOutlined />}>刪除</Button>
                </Popconfirm>
                <Popconfirm
                  title="發布後將無法再修改此考卷，確定要發布？"
                  onConfirm={() => void handlePublish()}
                  okText="確認發布"
                  cancelText="取消"
                >
                  <Button type="primary" icon={<CheckCircleOutlined />} loading={publishing}>
                    發布考卷
                  </Button>
                </Popconfirm>
              </>
            )}
          </Space>
        }
        loading={loading}
      >
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="來源藍圖">
            {data.blueprint ? (
              <a onClick={() => navigate(`/admin/blueprints/${data.blueprint!.id}`)}>
                {data.blueprint.name}
              </a>
            ) : (
              <Text type="secondary">藍圖已刪除</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="建立者">{data.createdBy?.name ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="題目數量">{data.questions.length}</Descriptions.Item>
          <Descriptions.Item label="建立時間">
            {new Date(data.createdAt).toLocaleString('zh-TW')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {snapshot && (
        <Collapse
          items={[{
            key: 'snapshot',
            label: '藍圖快照 (產生時的條件設定)',
            children: (
              <div>
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="藍圖名稱">{snapshot.name}</Descriptions.Item>
                  <Descriptions.Item label="考試類型">
                    {CATEGORY_LABELS[snapshot.examCategory ?? ''] ?? snapshot.examCategory}
                  </Descriptions.Item>
                  <Descriptions.Item label="總題數">{snapshot.totalQuestions}</Descriptions.Item>
                  <Descriptions.Item label="總分">{snapshot.totalScore}</Descriptions.Item>
                </Descriptions>
                {snapshot.cells && (
                  <Table
                    rowKey="orderIndex"
                    dataSource={snapshot.cells}
                    pagination={false}
                    size="small"
                    style={{ marginTop: 12 }}
                    columns={[
                      { title: '#', dataIndex: 'orderIndex', width: 50 },
                      { title: '題型', dataIndex: 'questionType', render: (t: string) => TYPE_LABELS[t] ?? t },
                      { title: '子類型', dataIndex: 'questionSubType', render: (st: string) => SUB_TYPE_LABELS[st] ?? st },
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
                    ]}
                  />
                )}
              </div>
            ),
          }]}
        />
      )}

      {groupedQuestions.map((group) => (
        <Card
          key={`${group.type}_${group.subType}`}
          title={`${TYPE_LABELS[group.type] ?? group.type} - ${SUB_TYPE_LABELS[group.subType] ?? group.subType}`}
          size="small"
        >
          <Table<PaperQuestionItem>
            rowKey={(r) => `${r.orderIndex}`}
            dataSource={group.questions}
            pagination={false}
            size="small"
            columns={[
              { title: '#', dataIndex: 'orderIndex', width: 50 },
              {
                title: '題目',
                render: (_: unknown, record: PaperQuestionItem) => {
                  if (record.question.isGroupParent) {
                    return <Tag color="blue">題組父題</Tag>
                  }
                  return record.question.stem ?? <Text type="secondary">（無題幹）</Text>
                },
              },
              { title: '配分', dataIndex: 'score', width: 80, align: 'center' as const },
              {
                title: '題目 ID',
                width: 280,
                render: (_: unknown, record: PaperQuestionItem) => (
                  <Text copyable={{ text: record.question.id }} style={{ fontSize: 12 }}>
                    {record.question.id.slice(0, 8)}...
                  </Text>
                ),
              },
              ...(isDraft
                ? [{
                    title: '操作',
                    width: 100,
                    render: (_: unknown, record: PaperQuestionItem) => {
                      if (record.question.groupId) return null
                      return (
                        <Button
                          size="small"
                          onClick={() => void handleReplace(record.question.id)}
                        >
                          {record.question.isGroupParent ? '替換整組' : '替換'}
                        </Button>
                      )
                    },
                  }]
                : []),
            ]}
          />
        </Card>
      ))}

      <Modal
        title="修改考卷名稱"
        open={editNameOpen}
        onCancel={() => setEditNameOpen(false)}
        onOk={() => void handleRename()}
        okText="儲存"
        cancelText="取消"
      >
        <input
          className="ant-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', border: '1px solid #dfe5eb', borderRadius: 6 }}
        />
      </Modal>

      <Modal
        title="試卷純文字預覽"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        width={920}
        footer={[
          <Button key="close" onClick={() => setPreviewOpen(false)}>關閉</Button>,
          <Button key="dl-txt" icon={<FileTextOutlined />} onClick={handleDownloadTxt}>
            下載 .txt
          </Button>,
          <Button
            key="dl-zip"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => void handleDownloadZip()}
          >
            下載 ZIP
          </Button>,
        ]}
      >
        {previewLoading ? (
          <Paragraph>載入中…</Paragraph>
        ) : previewData ? (
          <>
            {previewData.warnings.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {previewData.warnings.map((w, i) => (
                  <Tag key={i} color="warning" style={{ marginBottom: 4 }}>{w}</Tag>
                ))}
              </div>
            )}
            <pre
              style={{
                maxHeight: '60vh',
                overflow: 'auto',
                background: '#f5f7f9',
                padding: 16,
                borderRadius: 4,
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {previewData.content}
            </pre>
          </>
        ) : null}
      </Modal>
    </Space>
  )
}

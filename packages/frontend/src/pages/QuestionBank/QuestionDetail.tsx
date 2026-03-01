import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Typography, Card, Tag, Descriptions, Button, Space, Modal, Input, Spin, Divider, message,
  Radio,
} from 'antd'
import axios from 'axios'
import api from '../../utils/api'
import { useAuthStore } from '../../stores/useAuthStore'
import { PermissionAction } from '@taigi-core/shared'
import ReviewTimeline from './components/ReviewTimeline'
import {
  TYPE_LABELS,
  SUB_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  TEXT_SYSTEM_LABELS,
  MULTIPLE_CHOICE_SUBTYPES,
  GROUP_SUBTYPES,
  RUBRIC_SUBTYPES,
  QuestionStatus,
  type QuestionDetail as QuestionDetailType,
  type MultipleChoiceContent,
  type MultipleChoiceAnswer,
  type DictationAnswer,
  type SpeakingAnswer,
} from './types'

const { Title, Text, Paragraph } = Typography

export default function QuestionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const permissions = currentUser?.permissions ?? []

  const [question, setQuestion] = useState<QuestionDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectComment, setRejectComment] = useState('')

  const fetchDetail = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get<{ data: QuestionDetailType }>(`/questions/${id}`)
      setQuestion(res.data.data)
    } catch {
      void message.error('載入題目失敗')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void fetchDetail()
  }, [fetchDetail])

  async function handleStatusAction(action: string, comment?: string) {
    setActionLoading(true)
    try {
      await api.patch(`/questions/${id}/status`, { action, comment })
      void message.success('狀態已更新')
      await fetchDetail()
      setRejectOpen(false)
      setRejectComment('')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } })?.error?.message
        void message.error(msg ?? '操作失敗')
      }
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  if (!question) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Text type="secondary">題目不存在</Text></div>
  }

  const isAuthor = question.author.id === currentUser?.id
  const canEdit = isAuthor && (question.status === QuestionStatus.DRAFT || question.status === QuestionStatus.REJECTED)
  const canSubmit = isAuthor && permissions.includes(PermissionAction.QUESTION_SUBMIT)
    && (question.status === QuestionStatus.DRAFT || question.status === QuestionStatus.REJECTED)
  const canApprove = permissions.includes(PermissionAction.QUESTION_APPROVE) && question.status === QuestionStatus.PENDING
  const canReject = permissions.includes(PermissionAction.QUESTION_REJECT) && question.status === QuestionStatus.PENDING
  const canArchive = permissions.includes('system:manage')
    && (question.status === QuestionStatus.APPROVED || question.status === QuestionStatus.REJECTED)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* 標題與操作 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Button onClick={() => navigate('/questions')}>返回列表</Button>
          <Title level={4} style={{ margin: 0 }}>題目詳情</Title>
        </Space>
        <Space>
          {canEdit && (
            <Button onClick={() => navigate(`/questions/${id}/edit`)}>編輯</Button>
          )}
          {canSubmit && (
            <Button type="primary" loading={actionLoading} onClick={() => void handleStatusAction('SUBMIT')}>
              送出審查
            </Button>
          )}
          {canApprove && (
            <Button type="primary" loading={actionLoading} onClick={() => void handleStatusAction('APPROVE')}
              style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}>
              核可入庫
            </Button>
          )}
          {canReject && (
            <Button danger loading={actionLoading} onClick={() => setRejectOpen(true)}>
              退回修改
            </Button>
          )}
          {canArchive && (
            <Button loading={actionLoading} onClick={() => void handleStatusAction('ARCHIVE')}>
              封存
            </Button>
          )}
        </Space>
      </div>

      {/* 基本資訊 */}
      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="題型">
            <Tag>{TYPE_LABELS[question.type] ?? question.type}</Tag>
            <span>{SUB_TYPE_LABELS[question.subType] ?? question.subType}</span>
          </Descriptions.Item>
          <Descriptions.Item label="狀態">
            <Tag color={STATUS_COLORS[question.status]}>{STATUS_LABELS[question.status] ?? question.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="拼音系統">{TEXT_SYSTEM_LABELS[question.textSystem] ?? question.textSystem}</Descriptions.Item>
          <Descriptions.Item label="出題者">{question.author.name ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="建立時間">{new Date(question.createdAt).toLocaleString('zh-TW')}</Descriptions.Item>
          <Descriptions.Item label="更新時間">{new Date(question.updatedAt).toLocaleString('zh-TW')}</Descriptions.Item>
          {question.isGroupParent && (
            <Descriptions.Item label="類型"><Tag color="purple">題組父題</Tag></Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* 預覽區 */}
      <Card title="題目預覽" style={{ marginBottom: 16 }}>
        {/* 媒體 */}
        {question.questionMedia.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {question.questionMedia.filter((m) => m.purpose === 'AUDIO').map((m) => (
              <div key={m.media.id} style={{ marginBottom: 8 }}>
                <Text type="secondary">音檔：{m.media.filename}</Text>
                <audio controls style={{ display: 'block', marginTop: 4 }}>
                  <source src={`/api/media/${m.media.id}/url`} />
                </audio>
              </div>
            ))}
            {question.questionMedia.filter((m) => m.purpose === 'IMAGE').map((m) => (
              <div key={m.media.id} style={{ marginBottom: 8 }}>
                <Text type="secondary">圖片：{m.media.filename}</Text>
                {/* 正式環境用 presigned URL */}
              </div>
            ))}
          </div>
        )}

        {/* 題幹 */}
        {question.stem && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>題幹：</Text>
            <Paragraph style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{question.stem}</Paragraph>
          </div>
        )}

        {/* 單題選擇題內容 */}
        {MULTIPLE_CHOICE_SUBTYPES.includes(question.subType) && !GROUP_SUBTYPES.includes(question.subType) && question.content && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>選項：</Text>
            {renderOptions(
              question.content as MultipleChoiceContent,
              question.answer as MultipleChoiceAnswer | null,
            )}
          </div>
        )}

        {/* 題組子題 */}
        {question.isGroupParent && question.children.length > 0 && (
          <div>
            <Divider orientation="left">子題 ({question.children.length} 題)</Divider>
            {question.children.map((child, idx) => (
              <Card key={child.id} size="small" title={`第 ${idx + 1} 題`} style={{ marginBottom: 12 }}>
                {child.stem && <Paragraph>{child.stem}</Paragraph>}
                {child.content && renderOptions(
                  child.content as MultipleChoiceContent,
                  child.answer as MultipleChoiceAnswer | null,
                )}
              </Card>
            ))}
          </div>
        )}

        {/* 聽寫題答案 */}
        {question.subType === 'DICTATION_FILL' && question.answer && (
          <div>
            <Text strong>正確答案：</Text>
            <Paragraph code>{(question.answer as DictationAnswer).correctText}</Paragraph>
          </div>
        )}

        {/* 口說題評分標準 */}
        {RUBRIC_SUBTYPES.includes(question.subType) && question.answer && (
          <div>
            <Text strong>評分標準：</Text>
            <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{(question.answer as SpeakingAnswer).gradingRubric}</Paragraph>
          </div>
        )}

        {/* 逐字稿 */}
        {question.answer && 'transcript' in (question.answer as Record<string, unknown>) && (question.answer as MultipleChoiceAnswer).transcript && (
          <div style={{ marginTop: 16 }}>
            <Text strong>逐字稿：</Text>
            <Paragraph style={{ whiteSpace: 'pre-wrap' }}>{(question.answer as MultipleChoiceAnswer).transcript}</Paragraph>
          </div>
        )}
      </Card>

      {/* 審查歷程 */}
      <Card title="審查歷程">
        <ReviewTimeline logs={question.reviewLogs} />
      </Card>

      {/* 退回 Modal */}
      <Modal
        title="退回修改"
        open={rejectOpen}
        onCancel={() => { setRejectOpen(false); setRejectComment('') }}
        onOk={() => void handleStatusAction('REJECT', rejectComment)}
        confirmLoading={actionLoading}
        okText="確認退回"
        okButtonProps={{ danger: true, disabled: !rejectComment.trim() }}
      >
        <div style={{ marginBottom: 8 }}>
          <Text>請填寫退回原因（必填）：</Text>
        </div>
        <Input.TextArea
          rows={4}
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
          placeholder="請說明需要修改的地方..."
        />
      </Modal>
    </div>
  )
}

function renderOptions(content: MultipleChoiceContent, answer: MultipleChoiceAnswer | null) {
  if (!content?.options) return null
  const correctIds = answer?.correctOptionIds ?? []

  return (
    <Radio.Group value={correctIds[0]} style={{ display: 'block', marginTop: 8 }}>
      {content.options.map((opt, idx) => (
        <div key={opt.id} style={{ marginBottom: 4 }}>
          <Radio value={opt.id} disabled>
            <span style={{ fontWeight: correctIds.includes(opt.id) ? 'bold' : 'normal' }}>
              {String.fromCharCode(65 + idx)}. {opt.text}
              {correctIds.includes(opt.id) && <Tag color="green" style={{ marginLeft: 8 }}>正確答案</Tag>}
            </span>
          </Radio>
        </div>
      ))}
    </Radio.Group>
  )
}

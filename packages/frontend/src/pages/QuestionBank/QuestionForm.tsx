import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Typography, Form, Input, Select, Button, Card, Space, Radio, Divider, message, Spin,
} from 'antd'
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons'
import axios from 'axios'
import api from '../../utils/api'
import MediaUpload from './components/MediaUpload'
import {
  QuestionType,
  TextSystem,
  VALID_TYPE_SUBTYPE_MAP,
  MULTIPLE_CHOICE_SUBTYPES,
  AUDIO_REQUIRED_SUBTYPES,
  IMAGE_REQUIRED_SUBTYPES,
  GROUP_SUBTYPES,
  RUBRIC_SUBTYPES,
  STEM_REQUIRED_SUBTYPES,
  TYPE_LABELS,
  SUB_TYPE_LABELS,
  TEXT_SYSTEM_LABELS,
  type QuestionDetail,
  type MediaLinkItem,
} from './types'

const { Title } = Typography
const { TextArea } = Input

// nanoid 簡易替代：產生 8 字元隨機 ID
function generateOptionId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

interface OptionField {
  id: string
  text: string
}

interface SubQuestionField {
  stem: string
  options: OptionField[]
  correctOptionId: string
}

interface FormValues {
  type: string
  subType: string
  textSystem: string
  stem?: string
  options?: OptionField[]
  correctOptionId?: string
  transcript?: string
  correctText?: string
  acceptableAlternatives?: string[]
  gradingRubric?: string
  audioMedia?: MediaLinkItem[]
  imageMedia?: MediaLinkItem[]
  subQuestions?: SubQuestionField[]
}

export default function QuestionForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [form] = Form.useForm<FormValues>()

  const [loading, setLoading] = useState(false)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(false)
  const [typeLocked, setTypeLocked] = useState(false)

  const selectedType = Form.useWatch('type', form)
  const selectedSubType = Form.useWatch('subType', form)
  const watchedOptions = Form.useWatch('options', form) as OptionField[] | undefined

  const isMultipleChoice = MULTIPLE_CHOICE_SUBTYPES.includes(selectedSubType ?? '')
  const isGroup = GROUP_SUBTYPES.includes(selectedSubType ?? '')
  const needsAudio = AUDIO_REQUIRED_SUBTYPES.includes(selectedSubType ?? '')
  const needsImage = IMAGE_REQUIRED_SUBTYPES.includes(selectedSubType ?? '')
  const needsRubric = RUBRIC_SUBTYPES.includes(selectedSubType ?? '')
  const needsStem = STEM_REQUIRED_SUBTYPES.includes(selectedSubType ?? '') || isGroup

  const subTypeOptions = selectedType
    ? (VALID_TYPE_SUBTYPE_MAP[selectedType] ?? []).map((st) => ({ label: SUB_TYPE_LABELS[st] ?? st, value: st }))
    : []

  // 編輯模式：載入既有資料
  const fetchQuestion = useCallback(async () => {
    if (!id) return
    setFetchLoading(true)
    try {
      const res = await api.get<{ data: QuestionDetail }>(`/questions/${id}`)
      const q = res.data.data
      const values: Partial<FormValues> = {
        type: q.type,
        subType: q.subType,
        textSystem: q.textSystem,
        stem: q.stem ?? undefined,
      }

      if (MULTIPLE_CHOICE_SUBTYPES.includes(q.subType) && !GROUP_SUBTYPES.includes(q.subType)) {
        const content = q.content as { options?: OptionField[] } | null
        const answer = q.answer as { correctOptionIds?: string[]; transcript?: string } | null
        values.options = content?.options ?? []
        values.correctOptionId = answer?.correctOptionIds?.[0]
        values.transcript = answer?.transcript
      }

      if (GROUP_SUBTYPES.includes(q.subType) && q.children) {
        const answer = q.answer as { transcript?: string } | null
        values.transcript = answer?.transcript
        values.subQuestions = q.children.map((child) => {
          const cContent = child.content as { options?: OptionField[] } | null
          const cAnswer = child.answer as { correctOptionIds?: string[] } | null
          return {
            stem: child.stem ?? '',
            options: cContent?.options ?? [],
            correctOptionId: cAnswer?.correctOptionIds?.[0] ?? '',
          }
        })
      }

      if (q.subType === 'DICTATION_FILL') {
        const answer = q.answer as { correctText?: string; acceptableAlternatives?: string[] } | null
        values.correctText = answer?.correctText
        values.acceptableAlternatives = answer?.acceptableAlternatives
      }

      if (RUBRIC_SUBTYPES.includes(q.subType)) {
        const answer = q.answer as { gradingRubric?: string } | null
        values.gradingRubric = answer?.gradingRubric
      }

      // 媒體
      const audioMedia = q.questionMedia.filter((m) => m.purpose === 'AUDIO').map((m) => ({ mediaId: m.media.id, purpose: 'AUDIO' }))
      const imageMedia = q.questionMedia.filter((m) => m.purpose === 'IMAGE').map((m) => ({ mediaId: m.media.id, purpose: 'IMAGE' }))
      if (audioMedia.length > 0) values.audioMedia = audioMedia
      if (imageMedia.length > 0) values.imageMedia = imageMedia

      form.setFieldsValue(values)
      setTypeLocked(true)
    } catch {
      void message.error('載入題目資料失敗')
    } finally {
      setFetchLoading(false)
    }
  }, [id, form])

  useEffect(() => {
    void fetchQuestion()
  }, [fetchQuestion])

  function buildPayload(values: FormValues) {
    const mediaIds: MediaLinkItem[] = [
      ...(values.audioMedia ?? []),
      ...(values.imageMedia ?? []),
    ]

    // 單題選擇題
    if (isMultipleChoice && !isGroup) {
      return {
        type: values.type,
        subType: values.subType,
        textSystem: values.textSystem,
        stem: values.stem,
        content: { options: values.options ?? [] },
        answer: {
          correctOptionIds: values.correctOptionId ? [values.correctOptionId] : [],
          ...(values.transcript ? { transcript: values.transcript } : {}),
        },
        mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
      }
    }

    // 聽寫題
    if (values.subType === 'DICTATION_FILL') {
      return {
        type: values.type,
        subType: values.subType,
        textSystem: values.textSystem,
        content: undefined,
        answer: {
          correctText: values.correctText ?? '',
          ...(values.acceptableAlternatives?.length ? { acceptableAlternatives: values.acceptableAlternatives } : {}),
        },
        mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
      }
    }

    // 口說題
    if (needsRubric) {
      return {
        type: values.type,
        subType: values.subType,
        textSystem: values.textSystem,
        stem: values.stem,
        content: undefined,
        answer: { gradingRubric: values.gradingRubric ?? '' },
        mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
      }
    }

    // 題組父題
    if (isGroup) {
      return {
        type: values.type,
        subType: values.subType,
        textSystem: values.textSystem,
        stem: values.stem,
        mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
      }
    }

    return {
      type: values.type,
      subType: values.subType,
      textSystem: values.textSystem,
      stem: values.stem,
      mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
    }
  }

  async function handleSaveDraft() {
    try {
      const values = await form.validateFields()
      setLoading(true)
      const payload = buildPayload(values)

      if (isEdit) {
        await api.patch(`/questions/${id}`, payload)
        void message.success('草稿已更新')
      } else {
        const res = await api.post<{ data: { id: string } }>('/questions', payload)

        // 題組：建立子題
        if (isGroup && values.subQuestions) {
          for (const sq of values.subQuestions) {
            await api.post('/questions', {
              type: values.type,
              subType: values.subType,
              textSystem: values.textSystem,
              stem: sq.stem,
              content: { options: sq.options },
              answer: { correctOptionIds: sq.correctOptionId ? [sq.correctOptionId] : [] },
              groupId: res.data.data.id,
            })
          }
        }

        void message.success('草稿已建立')
        navigate(`/questions/${res.data.data.id}`)
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } })?.error?.message
        void message.error(msg ?? '儲存失敗')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmitForReview() {
    try {
      const values = await form.validateFields()
      setSubmitLoading(true)

      const payload = buildPayload(values)
      let questionId = id

      if (isEdit) {
        await api.patch(`/questions/${id}`, payload)
      } else {
        const res = await api.post<{ data: { id: string } }>('/questions', payload)
        questionId = res.data.data.id

        if (isGroup && values.subQuestions) {
          for (const sq of values.subQuestions) {
            await api.post('/questions', {
              type: values.type,
              subType: values.subType,
              textSystem: values.textSystem,
              stem: sq.stem,
              content: { options: sq.options },
              answer: { correctOptionIds: sq.correctOptionId ? [sq.correctOptionId] : [] },
              groupId: questionId,
            })
          }
        }
      }

      await api.patch(`/questions/${questionId}/status`, { action: 'SUBMIT' })
      void message.success('已送出審查')
      navigate(`/questions/${questionId}`)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } })?.error?.message
        void message.error(msg ?? '送審失敗')
      }
    } finally {
      setSubmitLoading(false)
    }
  }

  if (fetchLoading) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Title level={4}>{isEdit ? '編輯試題' : '新增試題'}</Title>

      <Form form={form} layout="vertical" requiredMark="optional">
        {/* 第一段：基本類型選擇 */}
        <Card title="題型設定" style={{ marginBottom: 16 }}>
          <Space wrap style={{ width: '100%' }}>
            <Form.Item name="type" label="主類型" rules={[{ required: true, message: '請選擇主類型' }]} style={{ minWidth: 160 }}>
              <Select
                placeholder="請選擇"
                disabled={typeLocked}
                options={Object.values(QuestionType).map((t) => ({ label: TYPE_LABELS[t], value: t }))}
                onChange={() => form.setFieldValue('subType', undefined)}
              />
            </Form.Item>
            <Form.Item name="subType" label="子類型" rules={[{ required: true, message: '請選擇子類型' }]} style={{ minWidth: 160 }}>
              <Select
                placeholder="請選擇"
                disabled={typeLocked || !selectedType}
                options={subTypeOptions}
              />
            </Form.Item>
            <Form.Item name="textSystem" label="拼音系統" rules={[{ required: true, message: '請選擇拼音系統' }]} style={{ minWidth: 160 }}>
              <Select
                placeholder="請選擇"
                disabled={typeLocked}
                options={Object.entries(TEXT_SYSTEM_LABELS).map(([v, l]) => ({ label: l, value: v }))}
              />
            </Form.Item>
          </Space>
        </Card>

        {/* 第二段：依題型動態渲染 */}
        {selectedSubType && (
          <>
            {/* 媒體上傳 */}
            {needsAudio && (
              <Card title="音檔上傳" style={{ marginBottom: 16 }}>
                <Form.Item name="audioMedia" label="音檔 (.mp3)">
                  <MediaUpload accept=".mp3" purpose="AUDIO" maxSizeMB={20} label="上傳音檔" />
                </Form.Item>
              </Card>
            )}

            {needsImage && (
              <Card title="圖片上傳" style={{ marginBottom: 16 }}>
                <Form.Item name="imageMedia" label="圖片 (.jpg/.png)">
                  <MediaUpload accept=".jpg,.jpeg,.png" purpose="IMAGE" maxCount={5} maxSizeMB={5} label="上傳圖片" />
                </Form.Item>
              </Card>
            )}

            {/* 題幹 */}
            {needsStem && (
              <Card title="題幹" style={{ marginBottom: 16 }}>
                <Form.Item name="stem" label="題幹文字">
                  <TextArea rows={4} placeholder="請輸入題幹..." />
                </Form.Item>
              </Card>
            )}

            {/* 單題選擇題 */}
            {isMultipleChoice && !isGroup && (
              <Card title="選項與答案" style={{ marginBottom: 16 }}>
                <Form.Item name="correctOptionId" label="請點選正確答案" rules={[{ required: true, message: '請選擇正確答案' }]}>
                  <Radio.Group style={{ display: 'block' }}>
                    <Form.List name="options" initialValue={[
                      { id: generateOptionId(), text: '' },
                      { id: generateOptionId(), text: '' },
                      { id: generateOptionId(), text: '' },
                      { id: generateOptionId(), text: '' },
                    ]}>
                      {(fields) => (
                        <>
                          {fields.map((field, index) => (
                            <div key={field.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                              <Radio value={watchedOptions?.[index]?.id ?? ''} />
                              <span style={{ fontWeight: 'bold' }}>{String.fromCharCode(65 + index)}.</span>
                              <Form.Item name={[field.name, 'id']} hidden><Input /></Form.Item>
                              <Form.Item name={[field.name, 'text']} noStyle rules={[{ required: true, message: '請填寫選項' }]}>
                                <Input placeholder={`選項 ${String.fromCharCode(65 + index)}`} style={{ flex: 1 }} />
                              </Form.Item>
                            </div>
                          ))}
                        </>
                      )}
                    </Form.List>
                  </Radio.Group>
                </Form.Item>

                {selectedSubType && ['CONVERSATION', 'SPEECH'].includes(selectedSubType) && (
                  <Form.Item name="transcript" label="逐字稿">
                    <TextArea rows={3} placeholder="請輸入音檔逐字稿..." />
                  </Form.Item>
                )}
              </Card>
            )}

            {/* 題組 */}
            {isGroup && (
              <Card title="子題" style={{ marginBottom: 16 }}>
                {selectedSubType && ['CONVERSATION', 'SPEECH'].includes(selectedSubType) && (
                  <Form.Item name="transcript" label="逐字稿">
                    <TextArea rows={3} placeholder="請輸入音檔逐字稿..." />
                  </Form.Item>
                )}
                <Divider />
                <Form.List name="subQuestions" initialValue={[{
                  stem: '',
                  options: [
                    { id: generateOptionId(), text: '' },
                    { id: generateOptionId(), text: '' },
                    { id: generateOptionId(), text: '' },
                    { id: generateOptionId(), text: '' },
                  ],
                  correctOptionId: '',
                }]}>
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map((field, idx) => {
                        const subQs = form.getFieldValue('subQuestions') as SubQuestionField[] | undefined
                        const currentOpts = subQs?.[idx]?.options ?? []
                        return (
                          <Card
                            key={field.key}
                            size="small"
                            title={`子題 ${idx + 1}`}
                            style={{ marginBottom: 12 }}
                            extra={fields.length > 1 && (
                              <MinusCircleOutlined onClick={() => remove(field.name)} style={{ color: 'red' }} />
                            )}
                          >
                            <Form.Item name={[field.name, 'stem']} label="子題題幹">
                              <Input placeholder="請輸入子題題幹..." />
                            </Form.Item>

                            <Form.Item name={[field.name, 'correctOptionId']} label="請點選正確答案">
                              <Radio.Group style={{ display: 'block' }}>
                                {[0, 1, 2, 3].map((optIdx) => (
                                  <div key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                    <Radio value={currentOpts[optIdx]?.id ?? ''} />
                                    <span style={{ fontWeight: 'bold' }}>{String.fromCharCode(65 + optIdx)}.</span>
                                    <Form.Item name={[field.name, 'options', optIdx, 'id']} hidden><Input /></Form.Item>
                                    <Form.Item name={[field.name, 'options', optIdx, 'text']} noStyle>
                                      <Input placeholder={`選項 ${String.fromCharCode(65 + optIdx)}`} style={{ flex: 1 }} />
                                    </Form.Item>
                                  </div>
                                ))}
                              </Radio.Group>
                            </Form.Item>
                          </Card>
                        )
                      })}
                      <Button
                        type="dashed"
                        onClick={() => add({
                          stem: '',
                          options: [
                            { id: generateOptionId(), text: '' },
                            { id: generateOptionId(), text: '' },
                            { id: generateOptionId(), text: '' },
                            { id: generateOptionId(), text: '' },
                          ],
                          correctOptionId: '',
                        })}
                        block
                        icon={<PlusOutlined />}
                      >
                        新增子題
                      </Button>
                    </>
                  )}
                </Form.List>
              </Card>
            )}

            {/* 聽寫題 */}
            {selectedSubType === 'DICTATION_FILL' && (
              <Card title="正確答案" style={{ marginBottom: 16 }}>
                <Form.Item name="correctText" label="標準台羅拼音答案" rules={[{ required: true, message: '請填寫正確答案' }]}>
                  <Input placeholder="例如：bí-phang" />
                </Form.Item>
              </Card>
            )}

            {/* 口說題 */}
            {needsRubric && (
              <Card title="評分標準" style={{ marginBottom: 16 }}>
                <Form.Item name="gradingRubric" label="評分標準" rules={[{ required: true, message: '請填寫評分標準' }]}>
                  <TextArea rows={5} placeholder="請輸入評分標準..." />
                </Form.Item>
              </Card>
            )}
          </>
        )}

        {/* 操作按鈕 */}
        {selectedSubType && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 16 }}>
            <Button onClick={() => navigate(-1)}>取消</Button>
            <Button onClick={() => void handleSaveDraft()} loading={loading}>
              儲存草稿
            </Button>
            <Button type="primary" onClick={() => void handleSubmitForReview()} loading={submitLoading}>
              送出審查
            </Button>
          </div>
        )}
      </Form>
    </div>
  )
}

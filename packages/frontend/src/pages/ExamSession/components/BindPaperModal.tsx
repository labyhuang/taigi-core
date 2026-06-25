import { useEffect, useState } from 'react'
import { Modal, Form, Select, Input, message } from 'antd'
import api from '../../../utils/api'
import type { PaperListItem } from '../../ExamAssembly/types'

interface FormShape {
  examPaperId: string
  paperVariant?: string
}

export default function BindPaperModal(props: {
  open: boolean
  sessionId: string
  examCategory: string
  /** 已綁過的 paperId，過濾掉 */
  excludePaperIds: string[]
  onCancel: () => void
  onSuccess: () => void
}) {
  const { open, sessionId, examCategory, excludePaperIds, onCancel, onSuccess } = props
  const [form] = Form.useForm<FormShape>()
  const [submitting, setSubmitting] = useState(false)
  const [papers, setPapers] = useState<PaperListItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void (async () => {
      try {
        // 撈所有 PUBLISHED 考卷；前端再依 examCategory 過濾
        const res = await api.get<{ data: PaperListItem[] }>('/papers', {
          params: { status: 'PUBLISHED', pageSize: 100 },
        })
        setPapers(res.data.data)
      } catch {
        message.error('載入考卷列表失敗')
      } finally {
        setLoading(false)
      }
    })()
  }, [open])

  const handleSubmit = async (values: FormShape) => {
    setSubmitting(true)
    try {
      await api.post(`/exam-sessions/${sessionId}/papers`, values)
      message.success('考卷已綁定')
      form.resetFields()
      onSuccess()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '綁定失敗')
    } finally {
      setSubmitting(false)
    }
  }

  // 候選清單：PUBLISHED + 未綁過 + (snapshot 比對未實作，由後端再驗 examCategory)
  const candidatePapers = papers.filter((p) => !excludePaperIds.includes(p.id))

  return (
    <Modal
      title={`綁定考卷（考期類別 ${examCategory}）`}
      open={open}
      onCancel={() => {
        form.resetFields()
        onCancel()
      }}
      onOk={() => void form.submit()}
      confirmLoading={submitting}
      okText="綁定"
      cancelText="取消"
    >
      <Form<FormShape>
        layout="vertical"
        form={form}
        onFinish={(v) => void handleSubmit(v)}
      >
        <Form.Item
          name="examPaperId"
          label="考卷"
          rules={[{ required: true, message: '請選擇考卷' }]}
        >
          <Select
            loading={loading}
            placeholder="只列出 PUBLISHED 狀態的考卷"
            options={candidatePapers.map((p) => ({
              value: p.id,
              label: `${p.name}（${p.blueprint?.name ?? '藍圖已刪除'}）`,
            }))}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
        <Form.Item
          name="paperVariant"
          label="卷別 (paperVariant)"
          tooltip="A/B 卷防作弊。同 session 內 paperVariant 必須唯一。可留空。"
        >
          <Input placeholder="例如：A、B" maxLength={8} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

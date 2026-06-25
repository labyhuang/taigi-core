import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card, Form, Input, Select, Button, Space, DatePicker, message } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import api from '../../utils/api'
import type { ExamSessionDetail } from './types'
import { CATEGORY_LABELS } from '../QuestionBank/types'

interface FormShape {
  name: string
  examCategory: string
  examDate: Dayjs
  description?: string
}

export default function ExamSessionForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [form] = Form.useForm<FormShape>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [readonlyCategory, setReadonlyCategory] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    void (async () => {
      try {
        const res = await api.get<{ data: ExamSessionDetail }>(`/exam-sessions/${id}`)
        const s = res.data.data
        form.setFieldsValue({
          name: s.name,
          examCategory: s.examCategory,
          examDate: dayjs(s.examDate),
          description: s.description ?? undefined,
        })
        // IMPORTED：examCategory / examDate 鎖定
        if (s.status === 'IMPORTED' || s.status === 'ARCHIVED') {
          setReadonlyCategory(true)
        }
      } catch {
        message.error('載入考期失敗')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, form])

  const handleSubmit = async (values: FormShape) => {
    setSubmitting(true)
    try {
      const payload = {
        name: values.name,
        examCategory: values.examCategory,
        examDate: values.examDate.format('YYYY-MM-DD'),
        description: values.description ?? undefined,
      }
      if (id) {
        await api.patch(`/exam-sessions/${id}`, payload)
        message.success('考期已更新')
        navigate(`/admin/exam-sessions/${id}`)
      } else {
        const res = await api.post<{ data: { id: string } }>('/exam-sessions', payload)
        message.success('考期已建立')
        navigate(`/admin/exam-sessions/${res.data.data.id}`)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '儲存失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card title={id ? '編輯考期' : '新增考期'} loading={loading}>
      <Form<FormShape>
        layout="vertical"
        form={form}
        onFinish={(v) => void handleSubmit(v)}
        style={{ maxWidth: 720 }}
      >
        <Form.Item
          name="name"
          label="場次名稱"
          rules={[{ required: true, message: '請輸入場次名稱' }]}
        >
          <Input placeholder="例如：2026 春季全民台語檢定" />
        </Form.Item>
        <Form.Item
          name="examCategory"
          label="考試類型"
          rules={[{ required: true, message: '請選擇考試類型' }]}
        >
          <Select
            disabled={readonlyCategory}
            options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="examDate"
          label="考試日期"
          rules={[{ required: true, message: '請選擇考試日期' }]}
        >
          <DatePicker style={{ width: '100%' }} disabled={readonlyCategory} />
        </Form.Item>
        <Form.Item name="description" label="備註">
          <Input.TextArea rows={3} placeholder="(選填)" />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting}>
              {id ? '儲存' : '建立'}
            </Button>
            <Button onClick={() => navigate(-1)}>取消</Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  )
}

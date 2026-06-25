import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Card, Form, Input, InputNumber, Select, Button, Space, Alert, Divider, message,
} from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import type { BlueprintFormValues, AttributeDefinitionItem, BlueprintDetail } from './types'
import {
  CATEGORY_LABELS,
  VALID_CATEGORY_TYPE_SUBTYPE_MAP,
  TYPE_LABELS,
  SUB_TYPE_LABELS,
} from '../QuestionBank/types'

export default function BlueprintForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [form] = Form.useForm<BlueprintFormValues>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [attributes, setAttributes] = useState<AttributeDefinitionItem[]>([])

  const examCategory = Form.useWatch('examCategory', form)
  const cells = Form.useWatch('cells', form) as BlueprintFormValues['cells'] | undefined

  const sumQuestions = cells?.reduce((s, c) => s + (c?.questionCount ?? 0), 0) ?? 0
  const sumScore = cells?.reduce(
    (s, c) => s + (c?.questionCount ?? 0) * (c?.scorePerQuestion ?? 0), 0,
  ) ?? 0

  const totalQuestions = Form.useWatch('totalQuestions', form) as number | undefined
  const totalScore = Form.useWatch('totalScore', form) as number | undefined

  const mismatchQ = totalQuestions !== undefined && sumQuestions !== totalQuestions
  const mismatchS = totalScore !== undefined && Math.abs(sumScore - (totalScore ?? 0)) > 0.001

  useEffect(() => {
    void (async () => {
      try {
        const params: Record<string, string> = {}
        if (examCategory) params.examCategory = examCategory
        const res = await api.get<{ data: AttributeDefinitionItem[] }>('/attributes', { params })
        setAttributes(res.data.data)
      } catch { /* ignore */ }
    })()
  }, [examCategory])

  useEffect(() => {
    if (!id) return
    setLoading(true)
    void (async () => {
      try {
        const res = await api.get<{ data: BlueprintDetail }>(`/blueprints/${id}`)
        const bp = res.data.data
        form.setFieldsValue({
          name: bp.name,
          examCategory: bp.examCategory,
          totalQuestions: bp.totalQuestions,
          totalScore: bp.totalScore,
          cells: bp.cells.map((c) => ({
            orderIndex: c.orderIndex,
            questionType: c.questionType,
            questionSubType: c.questionSubType,
            criteria: c.criteria ?? {},
            questionCount: c.questionCount,
            scorePerQuestion: c.scorePerQuestion,
          })),
        })
      } catch {
        message.error('載入藍圖失敗')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, form])

  const getValidTypes = () => {
    if (!examCategory) return []
    const map = VALID_CATEGORY_TYPE_SUBTYPE_MAP[examCategory]
    return map ? Object.keys(map) : []
  }

  const getValidSubTypes = (type: string) => {
    if (!examCategory) return []
    return VALID_CATEGORY_TYPE_SUBTYPE_MAP[examCategory]?.[type] ?? []
  }

  const handleSubmit = async (values: BlueprintFormValues) => {
    if (mismatchQ || mismatchS) {
      message.error('條件格數量/配分不一致，請修正')
      return
    }
    setSubmitting(true)
    try {
      const payload = {
        ...values,
        cells: values.cells.map((c, i) => ({
          ...c,
          orderIndex: i + 1,
          criteria: c.criteria && Object.keys(c.criteria).length > 0 ? c.criteria : undefined,
        })),
      }
      if (id) {
        await api.patch(`/blueprints/${id}`, payload)
        message.success('藍圖已更新')
      } else {
        await api.post('/blueprints', payload)
        message.success('藍圖已建立')
      }
      navigate('/admin/blueprints')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '操作失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card title={id ? '編輯藍圖' : '新增藍圖'} loading={loading}>
      <Form
        form={form}
        layout="vertical"
        onFinish={(v) => void handleSubmit(v)}
        initialValues={{ cells: [{}] }}
      >
        <Space style={{ width: '100%' }} direction="vertical" size="middle">
          <Space wrap>
            <Form.Item name="name" label="藍圖名稱" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
              <Input placeholder="e.g. TSH 中小學生模擬測驗標準版" style={{ width: 320 }} />
            </Form.Item>
            <Form.Item name="examCategory" label="考試類型" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
              <Select
                placeholder="選擇考試類型"
                style={{ width: 180 }}
                options={Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              />
            </Form.Item>
            <Form.Item name="totalQuestions" label="預期總題數" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
              <InputNumber min={1} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="totalScore" label="預期總分" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
          </Space>

          <Divider>條件格 (Blueprint Cells)</Divider>

          <Form.List name="cells">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name }) => (
                  <Card
                    key={key}
                    size="small"
                    style={{ marginBottom: 12 }}
                    extra={
                      fields.length > 1 && (
                        <Button danger size="small" icon={<DeleteOutlined />} onClick={() => remove(name)} />
                      )
                    }
                    title={`條件 #${name + 1}`}
                  >
                    <Space wrap>
                      <Form.Item name={[name, 'questionType']} label="題型" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                        <Select
                          placeholder="主類型"
                          style={{ width: 140 }}
                          disabled={!examCategory}
                          options={getValidTypes().map((t) => ({
                            value: t,
                            label: TYPE_LABELS[t] ?? t,
                          }))}
                          onChange={() => form.setFieldValue(['cells', name, 'questionSubType'], undefined)}
                        />
                      </Form.Item>
                      <Form.Item
                        noStyle
                        shouldUpdate={(prev, cur) =>
                          prev?.cells?.[name]?.questionType !== cur?.cells?.[name]?.questionType
                        }
                      >
                        {() => {
                          const qType = form.getFieldValue(['cells', name, 'questionType']) as string | undefined
                          return (
                            <Form.Item name={[name, 'questionSubType']} label="子類型" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                              <Select
                                placeholder="子類型"
                                style={{ width: 150 }}
                                disabled={!qType}
                                options={(qType ? getValidSubTypes(qType) : []).map((st) => ({
                                  value: st,
                                  label: SUB_TYPE_LABELS[st] ?? st,
                                }))}
                              />
                            </Form.Item>
                          )
                        }}
                      </Form.Item>
                      <Form.Item name={[name, 'questionCount']} label="題數" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                        <InputNumber min={1} style={{ width: 80 }} />
                      </Form.Item>
                      <Form.Item name={[name, 'scorePerQuestion']} label="每題配分" rules={[{ required: true }]} style={{ marginBottom: 0 }}>
                        <InputNumber min={0} step={0.5} style={{ width: 100 }} />
                      </Form.Item>
                    </Space>
                    {attributes.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <Space wrap>
                          {attributes.map((attr) => (
                            <Form.Item
                              key={attr.key}
                              name={[name, 'criteria', attr.key]}
                              label={attr.name}
                              style={{ marginBottom: 0 }}
                            >
                              <Select
                                placeholder={`選擇${attr.name}`}
                                allowClear
                                style={{ width: 120 }}
                                options={attr.values.map((v) => ({
                                  value: v.value,
                                  label: v.label,
                                }))}
                              />
                            </Form.Item>
                          ))}
                        </Space>
                      </div>
                    )}
                  </Card>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  新增條件格
                </Button>
              </>
            )}
          </Form.List>

          <Card size="small" style={{ marginTop: 16 }}>
            <Space size="large">
              <span>條件格題數總和：<strong>{sumQuestions}</strong></span>
              <span>條件格配分總和：<strong>{sumScore}</strong></span>
            </Space>
            {(mismatchQ || mismatchS) && (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 8 }}
                message={
                  <>
                    {mismatchQ && <div>題數總和 ({sumQuestions}) ≠ 預期總題數 ({totalQuestions})</div>}
                    {mismatchS && <div>配分總和 ({sumScore}) ≠ 預期總分 ({totalScore})</div>}
                  </>
                }
              />
            )}
          </Card>

          <Space style={{ marginTop: 16 }}>
            <Button type="primary" htmlType="submit" loading={submitting} disabled={mismatchQ || mismatchS}>
              {id ? '儲存變更' : '建立藍圖'}
            </Button>
            <Button onClick={() => navigate('/admin/blueprints')}>取消</Button>
          </Space>
        </Space>
      </Form>
    </Card>
  )
}

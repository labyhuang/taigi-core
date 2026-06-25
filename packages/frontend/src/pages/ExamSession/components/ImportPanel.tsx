import { useState } from 'react'
import { Card, Tabs, Upload, Button, Radio, Checkbox, Space, Alert, Typography, message, Tag, Table } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { UploadFile } from 'antd/es/upload/interface'
import api from '../../../utils/api'
import type { ImportResult } from '../types'

type ImportType = 'candidates' | 'responses' | 'speaking-scores'

interface ImportTabState {
  fileList: UploadFile[]
  format: 'csv' | 'json'
  dryRun: boolean
  result: ImportResult | null
  uploading: boolean
}

const initialState: ImportTabState = {
  fileList: [],
  format: 'csv',
  dryRun: false,
  result: null,
  uploading: false,
}

const TAB_LABELS: Record<ImportType, string> = {
  candidates: '考生資料',
  responses: '應答資料',
  'speaking-scores': '口說評分',
}

const TAB_HINTS: Record<ImportType, string> = {
  candidates: '欄位：externalCandidateId, paperVariant, ageGroup, schoolType, totalScore, demographic_json',
  responses: '欄位：externalCandidateId, questionId, selectedOptionId, writtenAnswer, isCorrect, pointsEarned',
  'speaking-scores': '欄位：externalCandidateId, questionId, speakingScore, pointsEarned',
}

const { Text, Paragraph } = Typography

export default function ImportPanel(props: {
  sessionId: string
  /** session 為 ARCHIVED 時鎖定 */
  disabled: boolean
  onImported: () => void
}) {
  const { sessionId, disabled, onImported } = props
  const [states, setStates] = useState<Record<ImportType, ImportTabState>>({
    candidates: { ...initialState },
    responses: { ...initialState },
    'speaking-scores': { ...initialState },
  })

  const update = (tab: ImportType, patch: Partial<ImportTabState>) => {
    setStates((s) => ({ ...s, [tab]: { ...s[tab], ...patch } }))
  }

  const handleUpload = async (tab: ImportType) => {
    const state = states[tab]
    const file = state.fileList[0]?.originFileObj
    if (!file) {
      message.warning('請先選擇檔案')
      return
    }

    update(tab, { uploading: true, result: null })
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('format', state.format)
      formData.append('dryRun', state.dryRun ? 'true' : 'false')

      const res = await api.post<{ data: ImportResult }>(
        `/exam-sessions/${sessionId}/imports/${tab}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      update(tab, { result: res.data.data })
      message.success(state.dryRun ? '驗證完成（dryRun，未寫入）' : '匯入完成')
      if (!state.dryRun) onImported()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
      message.error(msg ?? '匯入失敗')
    } finally {
      update(tab, { uploading: false })
    }
  }

  const renderTab = (tab: ImportType) => {
    const state = states[tab]
    return (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert type="info" message={TAB_HINTS[tab]} showIcon />

        <Radio.Group
          value={state.format}
          onChange={(e) => update(tab, { format: e.target.value as 'csv' | 'json' })}
        >
          <Radio.Button value="csv">CSV</Radio.Button>
          <Radio.Button value="json">JSON</Radio.Button>
        </Radio.Group>

        <Upload
          beforeUpload={() => false}
          maxCount={1}
          fileList={state.fileList}
          onChange={(info) => update(tab, { fileList: info.fileList.slice(-1) })}
          accept={state.format === 'csv' ? '.csv,text/csv' : '.json,application/json'}
        >
          <Button icon={<UploadOutlined />} disabled={disabled}>
            選擇 {state.format.toUpperCase()} 檔
          </Button>
        </Upload>

        <Checkbox
          checked={state.dryRun}
          onChange={(e) => update(tab, { dryRun: e.target.checked })}
        >
          只驗證不寫入 (dryRun)
        </Checkbox>

        <Button
          type="primary"
          loading={state.uploading}
          onClick={() => void handleUpload(tab)}
          disabled={disabled || state.fileList.length === 0}
        >
          開始匯入
        </Button>

        {state.result && <ResultBlock result={state.result} />}
      </Space>
    )
  }

  return (
    <Card title="資料匯入" size="small">
      {disabled && (
        <Alert
          type="warning"
          showIcon
          message="此考期已封存，無法再匯入資料"
          style={{ marginBottom: 12 }}
        />
      )}
      <Tabs
        items={(['candidates', 'responses', 'speaking-scores'] as const).map((tab) => ({
          key: tab,
          label: TAB_LABELS[tab],
          children: renderTab(tab),
        }))}
      />
    </Card>
  )
}

function ResultBlock(props: { result: ImportResult }) {
  const { result } = props
  return (
    <Card size="small" type="inner" title="匯入結果">
      <Paragraph>
        <Space wrap>
          <Tag>總列數：{result.totalRows}</Tag>
          <Tag color="success">新增：{result.inserted}</Tag>
          <Tag color="processing">更新：{result.updated}</Tag>
          <Tag color="warning">跳過：{result.skipped}</Tag>
        </Space>
      </Paragraph>
      {result.errors.length > 0 && (
        <>
          <Text strong>錯誤明細（{result.errors.length} 筆）：</Text>
          <Table
            size="small"
            rowKey={(r, i) => `${r.row ?? ''}-${r.externalCandidateId ?? ''}-${i ?? ''}`}
            dataSource={result.errors}
            pagination={{ pageSize: 10 }}
            style={{ marginTop: 8 }}
            columns={[
              { title: '列', dataIndex: 'row', width: 60 },
              { title: '考生 ID', dataIndex: 'externalCandidateId', width: 160 },
              { title: '欄位', dataIndex: 'field', width: 120 },
              { title: '訊息', dataIndex: 'message' },
            ]}
          />
        </>
      )}
    </Card>
  )
}

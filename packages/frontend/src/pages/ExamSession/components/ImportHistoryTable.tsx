import { useEffect, useState, useCallback } from 'react'
import { Card, Table, Tag, Button, Space, Modal, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import api from '../../../utils/api'
import type { ImportLogItem } from '../types'

const { Text } = Typography

const IMPORT_TYPE_LABELS: Record<string, string> = {
  candidates: '考生',
  responses: '應答',
  speaking_scores: '口說評分',
}

const ACTOR_TYPE_LABELS: Record<string, string> = {
  user: 'Web UI',
  api_client: 'API Key',
}

export default function ImportHistoryTable(props: { sessionId: string; reloadKey?: number }) {
  const { sessionId, reloadKey } = props
  const [data, setData] = useState<ImportLogItem[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get<{ data: ImportLogItem[] }>(
        `/exam-sessions/${sessionId}/imports`,
      )
      setData(res.data.data)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void fetchData()
  }, [fetchData, reloadKey])

  const showErrors = (item: ImportLogItem) => {
    Modal.info({
      title: `匯入錯誤明細（${item.errors.length} 筆）`,
      width: 720,
      content: (
        <Table
          size="small"
          rowKey={(_, i) => `${i}`}
          dataSource={item.errors}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '列', dataIndex: 'row', width: 60 },
            { title: '考生 ID', dataIndex: 'externalCandidateId', width: 160 },
            { title: '欄位', dataIndex: 'field', width: 120 },
            { title: '訊息', dataIndex: 'message' },
          ]}
        />
      ),
    })
  }

  return (
    <Card
      title="匯入歷程"
      size="small"
      extra={
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void fetchData()}>
          重新整理
        </Button>
      }
    >
      <Table<ImportLogItem>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={data}
        pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 筆` }}
        columns={[
          {
            title: '時間',
            dataIndex: 'createdAt',
            width: 170,
            render: (d: string) => new Date(d).toLocaleString('zh-TW'),
          },
          {
            title: '類型',
            dataIndex: 'importType',
            width: 100,
            render: (t: string) => <Tag>{IMPORT_TYPE_LABELS[t] ?? t}</Tag>,
          },
          {
            title: '格式',
            dataIndex: 'sourceFormat',
            width: 80,
            render: (f: string) => <Tag>{f.toUpperCase()}</Tag>,
          },
          {
            title: '來源',
            dataIndex: 'actorType',
            width: 100,
            render: (t: string) => <Tag>{ACTOR_TYPE_LABELS[t] ?? t}</Tag>,
          },
          { title: '總列', dataIndex: 'totalRows', width: 70, align: 'center' },
          {
            title: '新增',
            dataIndex: 'inserted',
            width: 70,
            align: 'center',
            render: (n: number) => <Text type="success">{n}</Text>,
          },
          {
            title: '更新',
            dataIndex: 'updated',
            width: 70,
            align: 'center',
            render: (n: number) => <Text style={{ color: '#1677ff' }}>{n}</Text>,
          },
          {
            title: '跳過',
            dataIndex: 'skipped',
            width: 70,
            align: 'center',
            render: (n: number) => (n > 0 ? <Text type="warning">{n}</Text> : n),
          },
          {
            title: '錯誤',
            width: 90,
            align: 'center',
            render: (_: unknown, r) =>
              r.errors.length > 0 ? (
                <Space>
                  <Tag color="error">{r.errors.length}</Tag>
                  <Button type="link" size="small" onClick={() => showErrors(r)}>
                    檢視
                  </Button>
                </Space>
              ) : (
                <Text type="secondary">—</Text>
              ),
          },
        ]}
      />
    </Card>
  )
}

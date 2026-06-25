/**
 * 多維度交叉儀表板
 *
 * spec-statistics.md §6.4：
 *   - 控制列：groupBy / metric / aggregation / examSession
 *   - 1 維 → 長條圖；2 維 → 簡化版熱力圖（用顏色標記）
 *   - 下方明細表
 */

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from 'antd'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import api from '../../utils/api'
import { type ExploreResponse, formatNumber } from './types'

const { Title } = Typography

const GROUP_BY_OPTIONS = [
  { label: '題型 (subType)', value: 'subType' },
  { label: '考試類別 (category)', value: 'category' },
  { label: '文字系統 (textSystem)', value: 'textSystem' },
  { label: '出題者 (author)', value: 'author' },
  { label: '屬性：難度', value: 'attributes.difficulty' },
  { label: '屬性：教學面向', value: 'attributes.skill' },
]

interface SessionOption {
  id: string
  name: string
}

export default function Explore() {
  const [groupBy, setGroupBy] = useState<string[]>(['subType'])
  const [metric, setMetric] = useState<'difficulty' | 'discrimination'>('difficulty')
  const [aggregation, setAggregation] = useState<'mean' | 'median'>('mean')
  const [examSessionId, setExamSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionOption[]>([])
  const [data, setData] = useState<ExploreResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void api
      .get<{ data: { items: SessionOption[] } }>('/exam-sessions', {
        params: { pageSize: 100 },
      })
      .then((res) => {
        setSessions(res.data.data.items ?? [])
      })
      .catch(() => {
        // 略
      })
  }, [])

  const fetchData = async () => {
    if (groupBy.length === 0) {
      message.warning('請至少選擇一個分群維度')
      return
    }
    setLoading(true)
    try {
      const res = await api.get<{ data: ExploreResponse }>('/statistics/explore', {
        params: {
          groupBy: groupBy.join(','),
          examSessionId: examSessionId ?? undefined,
          metric,
          aggregation,
        },
      })
      setData(res.data.data)
    } finally {
      setLoading(false)
    }
  }

  const oneDimChartData = useMemo(() => {
    if (!data || data.groupBy.length !== 1) return []
    const key = aliasField(data.groupBy[0] ?? '')
    return data.rows.map((row) => ({
      name: String(row[key] ?? '—'),
      value: Number(((row.value as number) * 100).toFixed(2)),
      questionCount: row.questionCount,
    }))
  }, [data])

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Title level={3} className="page-title">多維度交叉分析</Title>

      <Card>
        <Form layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="分群維度（最多 2 個）">
                <Select
                  mode="multiple"
                  value={groupBy}
                  onChange={(v) => setGroupBy((v as string[]).slice(0, 2))}
                  options={GROUP_BY_OPTIONS}
                />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item label="指標">
                <Select
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { label: '難度 P', value: 'difficulty' },
                    { label: '鑑別度 D', value: 'discrimination' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={4}>
              <Form.Item label="聚合">
                <Select
                  value={aggregation}
                  onChange={setAggregation}
                  options={[
                    { label: '平均', value: 'mean' },
                    { label: '中位數', value: 'median' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="考期（不選為跨考期累積）">
                <Select
                  allowClear
                  value={examSessionId}
                  onChange={(v) => setExamSessionId(v ?? null)}
                  options={sessions.map((s) => ({ label: s.name, value: s.id }))}
                  placeholder="cumulative"
                />
              </Form.Item>
            </Col>
            <Col span={2} style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Form.Item>
                <Button type="primary" onClick={fetchData}>
                  查詢
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {loading && <Spin size="large" />}

      {!loading && data && data.rows.length === 0 && (
        <Alert type="info" message="沒有符合條件的統計資料" showIcon />
      )}

      {!loading && data && data.rows.length > 0 && data.groupBy.length === 1 && (
        <Card title={`${labelOfMetric(metric)} 一維分布`}>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={oneDimChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(v) => `${Number(v)}%`}
                labelFormatter={(l) => `${l}`}
              />
              <Bar dataKey="value" fill="#28A06B" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {!loading && data && data.rows.length > 0 && data.groupBy.length === 2 && (
        <Card title={`${labelOfMetric(metric)} 二維熱力圖`}>
          <HeatmapView data={data} />
        </Card>
      )}

      {!loading && data && data.rows.length > 0 && (
        <Card title="明細列表">
          <Table
            size="small"
            rowKey={(r, i) => `${i}`}
            pagination={{ pageSize: 30 }}
            columns={buildColumns(data)}
            dataSource={data.rows}
          />
        </Card>
      )}
    </Space>
  )
}

function labelOfMetric(m: 'difficulty' | 'discrimination'): string {
  return m === 'difficulty' ? '難度 P' : '鑑別度 D'
}

function aliasField(field: string): string {
  if (field.startsWith('attributes.')) {
    return `${field.slice('attributes.'.length)}_attr`
  }
  return field
}

function buildColumns(data: ExploreResponse) {
  const cols = data.groupBy.map((field) => ({
    title: field,
    dataIndex: aliasField(field),
    key: aliasField(field),
    render: (v: unknown) => (v == null ? '—' : String(v)),
  }))
  cols.push({
    title: labelOfMetric(data.metric),
    dataIndex: 'value',
    key: 'value',
    render: (v: unknown) => formatNumber(v as number, 3),
  })
  cols.push({
    title: '題數',
    dataIndex: 'questionCount',
    key: 'questionCount',
    render: (v: unknown) => String(v),
  })
  return cols
}

/**
 * 簡化版熱力圖：rows = 第一維 / cols = 第二維 / cell 顏色 = value
 */
function HeatmapView({ data }: { data: ExploreResponse }) {
  const field1 = data.groupBy[0] ?? ''
  const field2 = data.groupBy[1] ?? ''
  const k1 = aliasField(field1)
  const k2 = aliasField(field2)

  const rowKeys = Array.from(new Set(data.rows.map((r) => String(r[k1] ?? '—'))))
  const colKeys = Array.from(new Set(data.rows.map((r) => String(r[k2] ?? '—'))))

  const cellMap = new Map<string, { value: number; count: number }>()
  for (const r of data.rows) {
    cellMap.set(`${String(r[k1] ?? '—')}|${String(r[k2] ?? '—')}`, {
      value: r.value as number,
      count: r.questionCount,
    })
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={cellStyle()} />
            {colKeys.map((c) => (
              <th key={c} style={cellStyle(true)}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((r) => (
            <tr key={r}>
              <th style={cellStyle(true)}>{r}</th>
              {colKeys.map((c) => {
                const cell = cellMap.get(`${r}|${c}`)
                return (
                  <td
                    key={c}
                    style={{
                      ...cellStyle(),
                      background: cell ? colorScale(cell.value) : '#f5f7f9',
                      color: cell && cell.value > 0.6 ? '#fff' : '#000',
                    }}
                  >
                    {cell ? (
                      <>
                        <div>{formatNumber(cell.value, 2)}</div>
                        <div style={{ fontSize: 11, opacity: 0.7 }}>
                          n={cell.count}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function cellStyle(header = false): CSSProperties {
  return {
    border: '1px solid #e6e9ed',
    padding: '6px 10px',
    textAlign: 'center' as const,
    fontWeight: header ? 600 : 400,
    minWidth: 80,
  }
}

function colorScale(value: number): string {
  // 0 → 紅, 0.5 → 黃, 1 → 綠（適用 P 和 D，雖然 D 範圍 [-1,1]，這裡 clamp 到 [0,1]）
  const v = Math.max(0, Math.min(1, value))
  const hue = v * 120
  return `hsl(${hue}, 70%, 50%)`
}

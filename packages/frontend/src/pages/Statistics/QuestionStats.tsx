/**
 * 單題統計頁
 *
 * spec-statistics.md §6.2：
 *   1. 題目卡片
 *   2. 指標摘要 (P / D)
 *   3. 跨場次趨勢圖
 *   4. 選項分析表 + 條圖
 *   5. 重新計算按鈕
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Row,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import api from '../../utils/api'
import {
  type QuestionStatsResponse,
  type MultipleChoiceOptionStats,
  formatNumber,
  formatPercent,
} from './types'
import { DifficultyBadge } from './components/DifficultyBadge'
import { DiscriminationBadge } from './components/DiscriminationBadge'
import { OptionStatsTable } from './components/OptionStatsTable'
import { DistractorChart } from './components/DistractorChart'

const { Title, Text } = Typography

export default function QuestionStats() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<QuestionStatsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ data: QuestionStatsResponse }>(
        `/statistics/questions/${id}`,
        { params: { view: 'by-session' } },
      )
      setData(res.data.data)
    } catch (err) {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })
        .response?.data?.error?.code
      if (code === 'ERR_STATS_NOT_READY') {
        setError('此題目尚未計算過統計，請先觸發重算')
      } else {
        setError('載入統計失敗')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleRecompute = async () => {
    try {
      await api.post('/statistics/recompute', { scope: 'cumulative' })
      message.success('已排入背景重算（cumulative），完成後請手動重整')
    } catch {
      // global handler 已顯示錯誤
    }
  }

  if (loading) {
    return <Spin size="large" />
  }

  if (error) {
    return (
      <>
        <Alert type="warning" message={error} showIcon />
        <Button style={{ marginTop: 16 }} type="primary" onClick={handleRecompute}>
          觸發 cumulative 重算
        </Button>
      </>
    )
  }

  if (!data) return null

  const cumulative = data.cumulative
  const bySession = data.bySession ?? []

  const trendData = bySession
    .slice()
    .reverse()
    .map((row) => ({
      label: row.examSession.name,
      examDate: new Date(row.examSession.examDate).toLocaleDateString(),
      difficulty: row.stats.difficulty,
      discrimination: row.stats.discrimination,
    }))

  const mcOptions =
    cumulative?.optionStats &&
    'options' in (cumulative.optionStats as MultipleChoiceOptionStats)
      ? (cumulative.optionStats as MultipleChoiceOptionStats).options
      : null

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Breadcrumb
        items={[
          { title: '題庫' },
          { title: '單題統計' },
          { title: data.question.id.slice(0, 8) },
        ]}
      />

      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>
              {data.question.stem ?? '（無題幹）'}
            </Title>
            <Tag>{data.question.subType}</Tag>
            <Tag color="blue">{data.question.category}</Tag>
          </Space>
        }
        extra={
          <Button onClick={handleRecompute}>觸發 cumulative 重算</Button>
        }
      >
        <Descriptions column={2} size="small">
          <Descriptions.Item label="作者">
            {data.question.author?.name ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="題型">
            {data.question.type} / {data.question.subType}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="跨考期累積指標">
        {cumulative ? (
          <Row gutter={24}>
            <Col span={6}>
              <Statistic
                title="作答人數"
                value={cumulative.totalAnswered}
                suffix={
                  cumulative.totalCorrect !== null
                    ? `（答對 ${cumulative.totalCorrect}）`
                    : ''
                }
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="難度 P"
                value={formatNumber(cumulative.difficulty, 3)}
              />
              <DifficultyBadge value={cumulative.difficulty} />
            </Col>
            <Col span={6}>
              <Statistic
                title="鑑別度 D"
                value={
                  cumulative.discrimination === null
                    ? '—'
                    : formatNumber(cumulative.discrimination, 3)
                }
              />
              <DiscriminationBadge value={cumulative.discrimination} />
            </Col>
            <Col span={6}>
              <Statistic
                title="高/低分組人數"
                value={`${cumulative.highGroupSize} / ${cumulative.lowGroupSize}`}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                最後更新 {new Date(cumulative.computedAt).toLocaleString()}
              </Text>
            </Col>
          </Row>
        ) : (
          <Alert type="info" message="尚未計算累積統計" showIcon />
        )}
      </Card>

      {trendData.length > 0 && (
        <Card title="跨場次趨勢">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
              <Tooltip
                formatter={(v) => formatPercent(Number(v), 1)}
                labelFormatter={(l, p) => {
                  const item = p[0]?.payload as { examDate?: string }
                  return `${l}（${item?.examDate ?? ''}）`
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="difficulty"
                name="難度 P"
                stroke="#1677ff"
              />
              <Line
                type="monotone"
                dataKey="discrimination"
                name="鑑別度 D"
                stroke="#ff7875"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {mcOptions && mcOptions.length > 0 && (
        <Card title="選項誘答分析">
          <DistractorChart options={mcOptions} />
          <Divider />
          <OptionStatsTable optionStats={cumulative?.optionStats} />
        </Card>
      )}

      {cumulative?.optionStats &&
        !('options' in (cumulative.optionStats as object)) && (
          <Card title="常見答案分布（聽寫題）">
            <OptionStatsTable optionStats={cumulative.optionStats} />
          </Card>
        )}
    </Space>
  )
}

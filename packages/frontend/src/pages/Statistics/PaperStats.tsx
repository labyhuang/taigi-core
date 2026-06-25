/**
 * 試卷統計頁
 *
 * spec-statistics.md §6.3：
 *   1. 試卷概要 Card
 *   2. 依題型分組 Table
 *   3. 問題題目列表（D 低 / P 極端排序）
 *   4. 重新計算按鈕
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Col,
  Row,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import api from '../../utils/api'
import {
  type PaperStatsResponse,
  formatNumber,
  classifyDifficulty,
} from './types'
import { DifficultyBadge } from './components/DifficultyBadge'
import { DiscriminationBadge } from './components/DiscriminationBadge'

const { Title } = Typography

type QRow = PaperStatsResponse['questions'][number]

function isProblemQuestion(row: QRow): boolean {
  if (row.discrimination !== null && row.discrimination < 0.2) return true
  if (row.difficulty !== null) {
    const cls = classifyDifficulty(row.difficulty)
    if (cls === 'too-easy' || cls === 'too-hard') return true
  }
  return false
}

function problemPriority(row: QRow): number {
  // 越大越「有問題」，排序時用降序
  let score = 0
  if (row.discrimination !== null) {
    if (row.discrimination < 0) score += 100
    else if (row.discrimination < 0.2) score += 50
  }
  if (row.difficulty !== null) {
    if (row.difficulty > 0.95 || row.difficulty < 0.15) score += 30
  }
  return score
}

export default function PaperStats() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<PaperStatsResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.get<{ data: PaperStatsResponse }>(
        `/statistics/papers/${id}`,
      )
      setData(res.data.data)
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
      message.success('已排入背景重算，完成後請手動重整')
    } catch {
      // global handler
    }
  }

  if (loading || !data) {
    return <Spin size="large" />
  }

  const { paper, summary, bySubType, questions } = data

  const sortedQuestions = [...questions].sort(
    (a, b) => problemPriority(b) - problemPriority(a) || a.orderIndex - b.orderIndex,
  )
  const problemList = sortedQuestions.filter(isProblemQuestion)

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Breadcrumb
        items={[
          { title: <Link to="/exam-assembly/papers">試卷</Link> },
          { title: <Link to={`/exam-assembly/papers/${paper.id}`}>{paper.name}</Link> },
          { title: '統計' },
        ]}
      />

      <Card
        title={
          <Space>
            <Title level={4} style={{ margin: 0 }}>
              {paper.name}
            </Title>
            {paper.status && <Tag color="blue">{paper.status}</Tag>}
          </Space>
        }
        extra={<Button onClick={handleRecompute}>觸發 cumulative 重算</Button>}
      >
        <Row gutter={24}>
          <Col span={4}>
            <Statistic title="題目總數" value={summary.totalQuestions} />
          </Col>
          <Col span={4}>
            <Statistic
              title="已計算題目"
              value={summary.questionsWithStats}
              suffix={`/ ${summary.totalQuestions}`}
            />
          </Col>
          <Col span={4}>
            <Statistic
              title="平均難度 P"
              value={formatNumber(summary.meanDifficulty, 3)}
            />
          </Col>
          <Col span={4}>
            <Statistic
              title="平均鑑別度 D"
              value={formatNumber(summary.meanDiscrimination, 3)}
            />
          </Col>
          <Col span={4}>
            <Statistic
              title="低 D 題數 (<0.2)"
              value={summary.questionsBelowDiscriminationThreshold}
              valueStyle={
                summary.questionsBelowDiscriminationThreshold > 0
                  ? { color: '#cf1322' }
                  : {}
              }
            />
          </Col>
          <Col span={4}>
            <Statistic
              title="極端 P 題數"
              value={summary.questionsTooEasy + summary.questionsTooHard}
              suffix={`(易 ${summary.questionsTooEasy} / 難 ${summary.questionsTooHard})`}
            />
          </Col>
        </Row>
      </Card>

      <Card title="依題型分組">
        <Table
          rowKey="subType"
          size="small"
          pagination={false}
          columns={
            [
              { title: '題型', dataIndex: 'subType' },
              {
                title: '題數',
                dataIndex: 'count',
                align: 'right',
              },
              {
                title: '平均 P',
                dataIndex: 'meanDifficulty',
                align: 'right',
                render: (v) => formatNumber(v, 3),
              },
              {
                title: '平均 D',
                dataIndex: 'meanDiscrimination',
                align: 'right',
                render: (v) => formatNumber(v, 3),
              },
            ] as ColumnsType<PaperStatsResponse['bySubType'][number]>
          }
          dataSource={bySubType}
        />
      </Card>

      {problemList.length > 0 && (
        <Card title={`需關注題目（${problemList.length}）`}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="這些題目的鑑別度過低或難度過於極端，建議檢視內容後改寫或淘汰"
          />
          <QuestionTable
            rows={problemList}
            highlight
          />
        </Card>
      )}

      <Card title="所有題目明細">
        <QuestionTable rows={sortedQuestions} />
      </Card>
    </Space>
  )
}

function QuestionTable({
  rows,
  highlight,
}: {
  rows: QRow[]
  highlight?: boolean
}) {
  const columns: ColumnsType<QRow> = [
    {
      title: '#',
      dataIndex: 'orderIndex',
      width: 60,
      render: (v: number) => v + 1,
    },
    { title: '題型', dataIndex: 'subType', width: 140 },
    {
      title: '題幹',
      dataIndex: 'stem',
      render: (text, record) => (
        <Link to={`/questions/${record.questionId}/stats`}>
          {text ?? '（無題幹）'}
        </Link>
      ),
    },
    {
      title: '作答人數',
      dataIndex: 'totalAnswered',
      align: 'right',
      width: 100,
    },
    {
      title: '難度 P',
      dataIndex: 'difficulty',
      width: 180,
      render: (v: number | null) => <DifficultyBadge value={v} />,
    },
    {
      title: '鑑別度 D',
      dataIndex: 'discrimination',
      width: 180,
      render: (v: number | null) => <DiscriminationBadge value={v} />,
    },
  ]
  return (
    <Table
      rowKey="questionId"
      size="small"
      pagination={{ pageSize: 20 }}
      columns={columns}
      dataSource={rows}
      rowClassName={(r) => (highlight && isProblemQuestion(r) ? 'problem-row' : '')}
    />
  )
}

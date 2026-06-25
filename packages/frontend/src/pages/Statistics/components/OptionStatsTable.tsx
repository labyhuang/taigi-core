import { Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type {
  MultipleChoiceOptionStats,
  DictationDistinctAnswerStats,
  OptionStatRow,
} from '../types'
import { formatPercent } from '../types'

interface Props {
  optionStats:
    | MultipleChoiceOptionStats
    | DictationDistinctAnswerStats
    | null
    | undefined
}

export function OptionStatsTable({ optionStats }: Props) {
  if (!optionStats) return null

  if ('options' in optionStats) {
    return <MultipleChoiceTable options={optionStats.options} />
  }
  if ('distinctAnswers' in optionStats) {
    return <DictationTable rows={optionStats.distinctAnswers} />
  }
  return null
}

function MultipleChoiceTable({ options }: { options: OptionStatRow[] }) {
  const columns: ColumnsType<OptionStatRow> = [
    {
      title: '選項',
      dataIndex: 'label',
      key: 'label',
      render: (text, record) => (
        <span>
          {text}
          {record.isCorrect && (
            <Tag color="green" style={{ marginLeft: 8 }}>
              正解
            </Tag>
          )}
        </span>
      ),
    },
    {
      title: '整體選擇率',
      dataIndex: 'selectionRate',
      key: 'selectionRate',
      align: 'right',
      render: (v: number) => formatPercent(v),
      sorter: (a, b) => a.selectionRate - b.selectionRate,
    },
    {
      title: '高分組',
      dataIndex: 'selectionRateHigh',
      key: 'selectionRateHigh',
      align: 'right',
      render: (v: number) => formatPercent(v),
    },
    {
      title: '低分組',
      dataIndex: 'selectionRateLow',
      key: 'selectionRateLow',
      align: 'right',
      render: (v: number) => formatPercent(v),
    },
    {
      title: '誘答評估',
      key: 'distractorQuality',
      render: (_, record) => evaluateDistractor(record),
    },
  ]
  return (
    <Table
      rowKey="optionId"
      size="small"
      pagination={false}
      columns={columns}
      dataSource={options}
    />
  )
}

function evaluateDistractor(o: OptionStatRow) {
  if (o.isCorrect) {
    return <Tag color="green">—</Tag>
  }
  if (o.selectionRateHigh < 0.05 && o.selectionRateLow < 0.05) {
    return <Tag color="default">無效誘答</Tag>
  }
  if (o.selectionRateLow > o.selectionRateHigh) {
    return <Tag color="blue">良好誘答</Tag>
  }
  if (o.selectionRateHigh > o.selectionRateLow) {
    return <Tag color="red">反向誘答</Tag>
  }
  return <Tag color="default">中性</Tag>
}

function DictationTable({
  rows,
}: {
  rows: Array<{ answer: string; count: number; isCorrect: boolean }>
}) {
  const columns: ColumnsType<{ answer: string; count: number; isCorrect: boolean }> = [
    {
      title: '答案內容',
      dataIndex: 'answer',
      key: 'answer',
      render: (text, record) => (
        <span>
          <code>{text}</code>
          {record.isCorrect && (
            <Tag color="green" style={{ marginLeft: 8 }}>
              判為正確
            </Tag>
          )}
        </span>
      ),
    },
    {
      title: '次數',
      dataIndex: 'count',
      key: 'count',
      align: 'right',
      sorter: (a, b) => a.count - b.count,
    },
  ]
  return (
    <Table
      rowKey="answer"
      size="small"
      pagination={false}
      columns={columns}
      dataSource={rows}
    />
  )
}

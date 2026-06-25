import { Tag, Tooltip } from 'antd'
import {
  classifyDifficulty,
  DIFFICULTY_LABELS,
  DIFFICULTY_COLORS,
  formatNumber,
} from '../types'

interface Props {
  value: number | null | undefined
}

export function DifficultyBadge({ value }: Props) {
  if (value === null || value === undefined) {
    return <Tag>未計算</Tag>
  }
  const cls = classifyDifficulty(value)
  return (
    <Tooltip title={`P 值 = ${formatNumber(value, 3)}（${DIFFICULTY_LABELS[cls]}）`}>
      <Tag color={DIFFICULTY_COLORS[cls]}>
        P {formatNumber(value, 2)} · {DIFFICULTY_LABELS[cls]}
      </Tag>
    </Tooltip>
  )
}

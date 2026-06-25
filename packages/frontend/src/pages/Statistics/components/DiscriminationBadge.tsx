import { Tag, Tooltip } from 'antd'
import {
  classifyDiscrimination,
  DISCRIMINATION_LABELS,
  DISCRIMINATION_COLORS,
  formatNumber,
} from '../types'

interface Props {
  value: number | null | undefined
}

export function DiscriminationBadge({ value }: Props) {
  if (value === null || value === undefined) {
    return <Tag>人數不足</Tag>
  }
  const cls = classifyDiscrimination(value)
  if (!cls) return <Tag>—</Tag>
  return (
    <Tooltip
      title={`D 值 = ${formatNumber(value, 3)}（${DISCRIMINATION_LABELS[cls]}）`}
    >
      <Tag color={DISCRIMINATION_COLORS[cls]}>
        D {formatNumber(value, 2)} · {DISCRIMINATION_LABELS[cls]}
      </Tag>
    </Tooltip>
  )
}

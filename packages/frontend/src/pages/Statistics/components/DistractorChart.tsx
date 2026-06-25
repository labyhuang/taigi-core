/**
 * 選項誘答分析條圖：高分組 vs 低分組選擇率對比
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { OptionStatRow } from '../types'

interface Props {
  options: OptionStatRow[]
  height?: number
}

export function DistractorChart({ options, height = 280 }: Props) {
  const data = options.map((o) => ({
    name: `${o.label}${o.isCorrect ? ' ✓' : ''}`,
    high: Math.round(o.selectionRateHigh * 1000) / 10,
    low: Math.round(o.selectionRateLow * 1000) / 10,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
        <Tooltip formatter={(v) => `${Number(v)}%`} />
        <Legend />
        <Bar dataKey="high" name="高分組選擇率" fill="#28A06B" />
        <Bar dataKey="low" name="低分組選擇率" fill="#ff7875" />
      </BarChart>
    </ResponsiveContainer>
  )
}

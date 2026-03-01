import { Timeline, Typography } from 'antd'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons'
import type { ReviewLogItem } from '../types'

const { Text } = Typography

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  SUBMIT: { label: '送審', color: 'blue', icon: <SendOutlined /> },
  APPROVE: { label: '核可入庫', color: 'green', icon: <CheckCircleOutlined /> },
  REJECT: { label: '退回', color: 'red', icon: <CloseCircleOutlined /> },
  ARCHIVE: { label: '封存', color: 'gray', icon: <StopOutlined /> },
}

interface ReviewTimelineProps {
  logs: ReviewLogItem[]
}

export default function ReviewTimeline({ logs }: ReviewTimelineProps) {
  if (logs.length === 0) {
    return <Text type="secondary">尚無審查歷程</Text>
  }

  const items = logs.map((log) => {
    const config = ACTION_CONFIG[log.action] ?? { label: log.action, color: 'gray', icon: null }
    const time = new Date(log.createdAt).toLocaleString('zh-TW')
    const userName = log.user.name ?? '未知使用者'

    return {
      key: log.id,
      color: config.color,
      dot: config.icon,
      children: (
        <div>
          <Text strong>{userName}</Text>
          <Text type="secondary"> 於 {time} </Text>
          <Text>{config.label}</Text>
          {log.comment && (
            <div style={{ marginTop: 4 }}>
              <Text type="secondary">原因：{log.comment}</Text>
            </div>
          )}
        </div>
      ),
    }
  })

  return <Timeline items={items} />
}

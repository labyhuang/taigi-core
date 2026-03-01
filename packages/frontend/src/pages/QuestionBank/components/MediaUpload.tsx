import { useState } from 'react'
import { Upload, message, Button } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import type { UploadFile, UploadProps } from 'antd'
import api from '../../../utils/api'
import type { MediaLinkItem } from '../types'

interface MediaUploadProps {
  accept: string
  purpose: string
  maxCount?: number
  maxSizeMB: number
  value?: MediaLinkItem[]
  onChange?: (mediaLinks: MediaLinkItem[]) => void
  label?: string
}

interface UploadedMedia {
  id: string
  filename: string
}

export default function MediaUpload({
  accept,
  purpose,
  maxCount = 1,
  maxSizeMB,
  value = [],
  onChange,
  label = '上傳檔案',
}: MediaUploadProps) {
  const [fileList, setFileList] = useState<UploadFile[]>(
    value.map((v) => ({
      uid: v.mediaId,
      name: v.mediaId,
      status: 'done' as const,
    })),
  )

  const customUpload: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options
    const formData = new FormData()
    formData.append('file', file as Blob)

    try {
      const res = await api.post<{ data: UploadedMedia }>('/media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const uploaded = res.data.data
      const newLink: MediaLinkItem = { mediaId: uploaded.id, purpose }
      const updated = [...value, newLink]
      onChange?.(updated)
      onSuccess?.(uploaded)
    } catch (err) {
      onError?.(err as Error)
      void message.error('檔案上傳失敗')
    }
  }

  const handleRemove = (file: UploadFile) => {
    const mediaId = (file.response as UploadedMedia | undefined)?.id ?? file.uid
    const updated = value.filter((v) => v.mediaId !== mediaId)
    onChange?.(updated)
  }

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > maxSizeMB) {
      void message.error(`檔案大小不得超過 ${maxSizeMB}MB`)
      return Upload.LIST_IGNORE
    }
    return true
  }

  const handleChange: UploadProps['onChange'] = ({ fileList: newFileList }) => {
    setFileList(newFileList)
  }

  return (
    <Upload
      accept={accept}
      maxCount={maxCount}
      fileList={fileList}
      customRequest={customUpload}
      onRemove={handleRemove}
      beforeUpload={beforeUpload}
      onChange={handleChange}
    >
      {fileList.length < maxCount && (
        <Button icon={<UploadOutlined />}>{label}</Button>
      )}
    </Upload>
  )
}

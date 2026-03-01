import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Card, Steps, Form, Input, Button, Result, Spin, Typography, message } from 'antd'
import { QRCodeSVG } from 'qrcode.react'
import axios from 'axios'
import api from '../../utils/api'
import { useAuthStore } from '../../stores/useAuthStore'

const { Title, Text } = Typography

interface ProfileForm {
  name: string
  password: string
  confirmPassword: string
}

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/

export default function SetupWizard() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const checkAuth = useAuthStore((s) => s.checkAuth)

  const [currentStep, setCurrentStep] = useState(0)
  const [token, setToken] = useState('')
  const [email, setEmail] = useState('')
  const [otpauthUrl, setOtpauthUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [profileForm] = Form.useForm<ProfileForm>()
  const tokenExtracted = useRef(false)

  const verifyToken = useCallback(async (plainToken: string) => {
    try {
      const res = await api.post<{ data: { email: string } }>('/users/setup/verify-token', { token: plainToken })
      setEmail(res.data.data.email)
      setToken(plainToken)
      setCurrentStep(1)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } })?.error?.message
        setError(msg ?? '邀請連結無效或已過期')
      } else {
        setError('發生未預期的錯誤')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tokenExtracted.current) return
    tokenExtracted.current = true

    const urlToken = searchParams.get('token')
    if (!urlToken) {
      setError('缺少邀請 Token，請確認連結是否正確')
      setLoading(false)
      return
    }

    window.history.replaceState({}, '', '/setup')
    void verifyToken(urlToken)
  }, [searchParams, verifyToken])

  async function handleProfile(values: ProfileForm) {
    setLoading(true)
    try {
      await api.post('/users/setup/profile', {
        token,
        name: values.name,
        password: values.password,
      })

      const res = await api.post<{ data: { otpauthUrl: string } }>('/users/setup/2fa-generate', { token })
      setOtpauthUrl(res.data.data.otpauthUrl)
      setCurrentStep(2)
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } })?.error?.message
        void message.error(msg ?? '設定失敗')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify2FA(code: string) {
    setLoading(true)
    try {
      await api.post('/users/setup/2fa-verify', { token, code })
      void message.success('帳號開通完成！')
      await checkAuth()
      navigate('/', { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } })?.error?.message
        void message.error(msg ?? '驗證碼錯誤')
      }
      setLoading(false)
    }
  }

  if (error) {
    return (
      <CenteredCard>
        <Result status="error" title="連結無效" subTitle={error} />
      </CenteredCard>
    )
  }

  if (loading && currentStep === 0) {
    return (
      <CenteredCard>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
          <Text style={{ display: 'block', marginTop: 16 }}>驗證邀請連結中...</Text>
        </div>
      </CenteredCard>
    )
  }

  return (
    <CenteredCard>
      <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>帳號開通</Title>
      {email && <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>{email}</Text>}

      <Steps
        current={currentStep - 1}
        items={[
          { title: '設定基本資料' },
          { title: '綁定 2FA' },
        ]}
        style={{ marginBottom: 32 }}
      />

      {currentStep === 1 && (
        <Form form={profileForm} layout="vertical" onFinish={(v) => void handleProfile(v)}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '請輸入姓名' }]}>
            <Input placeholder="請輸入姓名" autoFocus />
          </Form.Item>
          <Form.Item
            name="password"
            label="設定密碼"
            rules={[
              { required: true, message: '請輸入密碼' },
              {
                pattern: PASSWORD_REGEX,
                message: '密碼至少 8 字元，須包含大寫字母、小寫字母、數字各一',
              },
            ]}
          >
            <Input.Password placeholder="請設定密碼" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="確認密碼"
            dependencies={['password']}
            rules={[
              { required: true, message: '請再次輸入密碼' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('兩次輸入的密碼不一致'))
                },
              }),
            ]}
          >
            <Input.Password placeholder="請再次輸入密碼" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>下一步</Button>
          </Form.Item>
        </Form>
      )}

      {currentStep === 2 && (
        <div style={{ textAlign: 'center' }}>
          <Text style={{ display: 'block', marginBottom: 16 }}>
            請使用驗證器應用程式（如 Google Authenticator）掃描以下 QR Code
          </Text>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
            <QRCodeSVG value={otpauthUrl} size={200} />
          </div>
          <Text style={{ display: 'block', marginBottom: 16 }}>掃描完成後，請輸入 6 位數驗證碼</Text>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Input.OTP
              length={6}
              onChange={(code) => {
                if (code.length === 6) {
                  void handleVerify2FA(code)
                }
              }}
              disabled={loading}
            />
          </div>
        </div>
      )}
    </CenteredCard>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 480 }}>{children}</Card>
    </div>
  )
}

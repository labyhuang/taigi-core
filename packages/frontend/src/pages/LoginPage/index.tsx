import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Card, Form, Input, Button, Typography, message } from 'antd'
import axios from 'axios'
import api from '../../utils/api'
import { useAuthStore } from '../../stores/useAuthStore'

const { Title, Text } = Typography

interface LoginForm {
  email: string
  password: string
}

interface LoginResponse {
  data: { requiresTwoFactor: true; challengeId: string }
}

interface Verify2FAResponse {
  data: { id: string; email: string; name: string }
  message?: string
}

type Stage = 'credentials' | 'totp'

export default function LoginPage() {
  const [stage, setStage] = useState<Stage>('credentials')
  const [challengeId, setChallengeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [loginForm] = Form.useForm<LoginForm>()
  const navigate = useNavigate()
  const location = useLocation()
  const checkAuth = useAuthStore((s) => s.checkAuth)
  const otpRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (stage === 'totp') {
      const firstInput = otpRef.current?.querySelector('input')
      firstInput?.focus()
    }
  }, [stage])

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'

  async function handleLogin(values: LoginForm) {
    setLoading(true)
    try {
      const res = await api.post<LoginResponse>('/auth/login', {
        email: values.email,
        password: values.password,
      })
      setChallengeId(res.data.data.challengeId)
      setStage('totp')
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } })?.error?.message
        void message.error(msg ?? '登入失敗')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify2FA(totpCode: string) {
    setLoading(true)
    try {
      const res = await api.post<Verify2FAResponse>('/auth/verify-2fa', {
        challengeId,
        totpCode,
      })
      if (res.data.message) {
        void message.success(res.data.message)
      }
      await checkAuth()
      navigate(from, { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: { message?: string } })?.error?.message
        void message.error(msg ?? '驗證失敗')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundImage: 'url(/login-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.65)',
        }}
      />
      <Card style={{ width: 400, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ marginBottom: 4 }}>TaigiCore</Title>
          <Text type="secondary">台語檢定題庫管理系統</Text>
        </div>

        {stage === 'credentials' ? (
          <Form form={loginForm} layout="vertical" onFinish={(v) => void handleLogin(v)}>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: '請輸入有效的 Email' }]}>
              <Input placeholder="name@example.com" autoFocus />
            </Form.Item>
            <Form.Item name="password" label="密碼" rules={[{ required: true, message: '請輸入密碼' }]}>
              <Input.Password placeholder="請輸入密碼" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>登入</Button>
            </Form.Item>
          </Form>
        ) : (
          <div>
            <Text style={{ display: 'block', textAlign: 'center', marginBottom: 24 }}>
              請開啟驗證器應用程式，輸入 6 位數驗證碼
            </Text>
            <div ref={otpRef} className="login-otp-wrap" style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <style>{`
                .login-otp-wrap .ant-input-otp-input {
                  width: 48px !important;
                  height: 48px !important;
                  font-size: 24px !important;
                }
              `}</style>
              <Input.OTP
                length={6}
                size="large"
                style={{ gap: 12 }}
                onChange={(code) => {
                  if (code.length === 6) {
                    void handleVerify2FA(code)
                  }
                }}
                disabled={loading}
              />
            </div>
            <Button block onClick={() => { setStage('credentials'); setChallengeId('') }}>
              返回登入
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}

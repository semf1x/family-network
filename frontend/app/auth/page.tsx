"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api } from "@/lib/api"
import { Mail } from "lucide-react"

type Screen = "auth" | "verify"

export default function AuthPage() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>("auth")

  useEffect(() => {
    if (localStorage.getItem("token")) router.replace("/chats")
  }, [router])
  const [pendingEmail, setPendingEmail] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const [loginData, setLoginData] = useState({ email: "", password: "" })
  const [registerData, setRegisterData] = useState({ display_name: "", username: "", email: "", password: "" })
  const [usernameHint, setUsernameHint] = useState("")

  // OTP state
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const [resendCooldown, setResendCooldown] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startCooldown() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setResendCooldown(60)
    intervalRef.current = setInterval(() => {
      setResendCooldown(c => {
        if (c <= 1) {
          clearInterval(intervalRef.current!)
          intervalRef.current = null
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  function saveAndRedirect(res: { access_token: string; user: any }) {
    localStorage.setItem("token", res.access_token)
    localStorage.setItem("user", JSON.stringify(res.user))
    router.push("/feed")
  }

  async function handleLogin(e: React.SyntheticEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      saveAndRedirect(await api.login(loginData))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const USERNAME_RE = /^[a-z][a-z0-9_]{3,19}$/

  function handleUsernameInput(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, "")
    setRegisterData(d => ({ ...d, username: cleaned }))
    if (!cleaned) { setUsernameHint(""); return }
    if (cleaned.length < 4) { setUsernameHint("Минимум 4 символа"); return }
    if (!/^[a-z]/.test(cleaned)) { setUsernameHint("Должен начинаться с буквы"); return }
    setUsernameHint("")
  }

  async function handleRegister(e: React.SyntheticEvent) {
    e.preventDefault()
    setError("")
    if (!USERNAME_RE.test(registerData.username)) {
      setError("Username: 4-20 символов, строчные буквы, цифры и _")
      return
    }
    setLoading(true)
    try {
      await api.register({
        username: registerData.username,
        display_name: registerData.display_name.trim() || undefined,
        email: registerData.email,
        password: registerData.password,
      })
      setPendingEmail(registerData.email)
      setScreen("verify")
      startCooldown()
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1)
    const next = [...otp]
    next[index] = digit
    setOtp(next)
    if (digit && index < 5) otpRefs.current[index + 1]?.focus()
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (pasted.length === 6) {
      setOtp(pasted.split(""))
      otpRefs.current[5]?.focus()
    }
    e.preventDefault()
  }

  async function handleVerify(e: React.SyntheticEvent) {
    e.preventDefault()
    const code = otp.join("")
    if (code.length < 6) return
    setError("")
    setLoading(true)
    try {
      saveAndRedirect(await api.verifyEmail({ email: pendingEmail, code }))
    } catch (err: any) {
      setError(err.message)
      setOtp(["", "", "", "", "", ""])
      otpRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    try {
      await api.resendCode(pendingEmail)
      startCooldown()
      setOtp(["", "", "", "", "", ""])
      otpRefs.current[0]?.focus()
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (screen === "verify") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold tracking-tight">Семейная сеть</h1>
            <p className="text-muted-foreground mt-2">Только для своих</p>
          </div>

          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Проверьте почту</CardTitle>
              <CardDescription>
                Мы отправили 6-значный код на<br />
                <span className="font-medium text-foreground">{pendingEmail}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerify} className="space-y-6">
                <div className="flex justify-center gap-2">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => { otpRefs.current[i] = el }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      onPaste={i === 0 ? handleOtpPaste : undefined}
                      className="h-12 w-10 rounded-lg border border-input bg-background text-center text-xl font-bold
                                 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent
                                 transition-all"
                    />
                  ))}
                </div>

                {error && <p className="text-destructive text-sm text-center">{error}</p>}

                <Button type="submit" className="w-full" disabled={loading || otp.join("").length < 6}>
                  {loading ? "Проверяем..." : "Подтвердить"}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Не пришёл код?{" "}
                  {resendCooldown > 0 ? (
                    <span>Повторить через {resendCooldown}с</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResend}
                      className="text-primary hover:underline font-medium"
                    >
                      Отправить снова
                    </button>
                  )}
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight">Семейная сеть</h1>
          <p className="text-muted-foreground mt-2">Только для своих</p>
        </div>

        <Tabs defaultValue="login" onValueChange={() => setError("")}>
          <TabsList className="w-full">
            <TabsTrigger value="login" className="flex-1">Войти</TabsTrigger>
            <TabsTrigger value="register" className="flex-1">Зарегистрироваться</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle>Добро пожаловать</CardTitle>
                <CardDescription>Введите свои данные для входа</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginData.email}
                      onChange={e => setLoginData({ ...loginData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Пароль</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginData.password}
                      onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                      required
                    />
                  </div>
                  {error && <p className="text-destructive text-sm">{error}</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Входим..." : "Войти"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle>Создать аккаунт</CardTitle>
                <CardDescription>Присоединитесь к семейной сети</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-name">Ваше имя</Label>
                    <Input
                      id="reg-name"
                      placeholder="Иван Петров"
                      value={registerData.display_name}
                      onChange={e => setRegisterData({ ...registerData, display_name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-username">Username</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground select-none">@</span>
                      <Input
                        id="reg-username"
                        placeholder="ivan_petrov"
                        className="pl-7"
                        value={registerData.username}
                        onChange={e => handleUsernameInput(e.target.value)}
                        maxLength={20}
                        required
                      />
                    </div>
                    {usernameHint
                      ? <p className="text-xs text-amber-500">{usernameHint}</p>
                      : <p className="text-xs text-muted-foreground">4-20 символов, буквы, цифры и _</p>
                    }
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="you@example.com"
                      value={registerData.email}
                      onChange={e => setRegisterData({ ...registerData, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Пароль</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      placeholder="••••••••"
                      value={registerData.password}
                      onChange={e => setRegisterData({ ...registerData, password: e.target.value })}
                      required
                    />
                  </div>
                  {error && <p className="text-destructive text-sm">{error}</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Создаём..." : "Зарегистрироваться"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/api"
import { CheckCircle2, XCircle, Loader2, ArrowLeft, Smartphone } from "lucide-react"

type Screen = "auth" | "verify"
type Tab = "login" | "register"

export default function AuthPage() {
  const router = useRouter()
  const [screen, setScreen] = useState<Screen>("auth")
  const [tab, setTab] = useState<Tab>("login")

  useEffect(() => {
    if (localStorage.getItem("token")) router.replace("/chats")
  }, [router])

  const [pendingPhone, setPendingPhone] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const [loginData, setLoginData] = useState({ phone: "", password: "" })
  const [registerData, setRegisterData] = useState({
    display_name: "", username: "", phone: "", password: "",
  })

  // Username check
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "ok" | "taken">("idle")
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const USERNAME_RE = /^[a-z][a-z0-9_]{3,19}$/

  // OTP
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const [resendCooldown, setResendCooldown] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startCooldown() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setResendCooldown(60)
    intervalRef.current = setInterval(() => {
      setResendCooldown(c => {
        if (c <= 1) { clearInterval(intervalRef.current!); intervalRef.current = null; return 0 }
        return c - 1
      })
    }, 1000)
  }

  function saveAndRedirect(res: { access_token: string; user: any }) {
    localStorage.setItem("token", res.access_token)
    localStorage.setItem("user", JSON.stringify(res.user))
    router.push("/chats")
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (loginData.phone.length < 10) { setError("Введите полный номер телефона (10 цифр)"); return }
    setLoading(true)
    try {
      saveAndRedirect(await api.login({ phone: "+7" + loginData.phone, password: loginData.password }))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleUsernameInput(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, "")
    setRegisterData(d => ({ ...d, username: cleaned }))
    setUsernameStatus("idle")
    if (!USERNAME_RE.test(cleaned)) return
    if (usernameTimer.current) clearTimeout(usernameTimer.current)
    setUsernameStatus("checking")
    usernameTimer.current = setTimeout(async () => {
      try {
        const res = await api.checkUsernamePublic(cleaned)
        setUsernameStatus(res.available ? "ok" : "taken")
      } catch { setUsernameStatus("idle") }
    }, 500)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!USERNAME_RE.test(registerData.username)) { setError("Username: 4-20 символов, строчные буквы и _"); return }
    if (usernameStatus === "taken") { setError("Этот username уже занят"); return }
    if (registerData.phone.length < 10) { setError("Введите полный номер телефона (10 цифр)"); return }
    setLoading(true)
    const fullPhone = "+7" + registerData.phone
    try {
      await api.register({
        username: registerData.username,
        display_name: registerData.display_name.trim() || undefined,
        phone: fullPhone,
        password: registerData.password,
      })
      setPendingPhone(fullPhone)
      setScreen("verify")
      startCooldown()
      setTimeout(() => otpRefs.current[0]?.focus(), 100)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleOtpChange(i: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1)
    const next = [...otp]; next[i] = digit; setOtp(next)
    if (digit && i < 5) otpRefs.current[i + 1]?.focus()
  }

  function handleOtpKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus()
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (pasted.length === 6) { setOtp(pasted.split("")); otpRefs.current[5]?.focus() }
    e.preventDefault()
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    const code = otp.join("")
    if (code.length < 6) return
    setError(""); setLoading(true)
    try {
      saveAndRedirect(await api.verifyPhone({ phone: pendingPhone, code }))
    } catch (err: any) {
      setError(err.message)
      setOtp(["", "", "", "", "", ""])
      otpRefs.current[0]?.focus()
    } finally { setLoading(false) }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    try {
      await api.resendCode(pendingPhone)
      startCooldown()
      setOtp(["", "", "", "", "", ""])
      otpRefs.current[0]?.focus()
    } catch (err: any) { setError(err.message) }
  }

  // ── Verify screen ──────────────────────────────────────
  if (screen === "verify") {
    return (
      <Layout>
        <div className="space-y-6">
          <div>
            <div className="h-11 w-11 rounded-2xl bg-gradient-brand-short flex items-center justify-center mb-4">
              <Smartphone size={20} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Введите код</h2>
            <p className="text-sm text-white/40 mt-1">
              Отправили SMS на <span className="text-white/70 font-medium">{pendingPhone}</span>
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-5">
            <div className="flex gap-2 justify-between">
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
                  className="h-14 w-full rounded-2xl auth-input-wrap bg-transparent
                             text-center text-2xl font-bold text-white outline-none
                             caret-primary selection:bg-primary/30"
                  style={{ background: "rgba(10,10,14,0.7)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              ))}
            </div>

            {error && (
              <p className="text-[13px] text-red-400 bg-red-400/10 rounded-xl px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || otp.join("").length < 6}
              className="w-full h-12 rounded-2xl bg-gradient-brand-short text-white font-semibold text-[15px]
                         hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 size={18} className="animate-spin mx-auto" /> : "Подтвердить"}
            </button>

            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => { setScreen("auth"); setOtp(["", "", "", "", "", ""]); setError("") }}
                className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
              >
                <ArrowLeft size={14} /> Назад
              </button>
              {resendCooldown > 0 ? (
                <span className="text-sm text-white/30">Повторить через {resendCooldown}с</span>
              ) : (
                <button type="button" onClick={handleResend}
                  className="text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                  Отправить снова
                </button>
              )}
            </div>
          </form>
        </div>
      </Layout>
    )
  }

  // ── Auth screen ────────────────────────────────────────
  return (
    <Layout>
      <div className="space-y-6">
        {/* Heading */}
        <div>
          <h2 className="text-xl font-bold text-white">
            {tab === "login" ? "С возвращением" : "Создать аккаунт"}
          </h2>
          <p className="text-sm text-white/40 mt-0.5">
            {tab === "login" ? "Войдите по номеру телефона" : "Присоединитесь к Kofka"}
          </p>
        </div>

        {/* Pill tab switcher */}
        <div className="flex rounded-2xl p-1" style={{ background: "rgba(10,10,14,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {(["login", "register"] as Tab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(""); setUsernameStatus("idle") }}
              className={`flex-1 h-9 rounded-xl text-sm font-medium transition-all duration-200 ${
                tab === t
                  ? "bg-gradient-brand-short text-white shadow-sm"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {t === "login" ? "Войти" : "Регистрация"}
            </button>
          ))}
        </div>

        {/* Forms */}
        {tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <PhoneField
              digits={loginData.phone}
              onChange={d => setLoginData({ ...loginData, phone: d })}
            />

            <Field label="Пароль">
              <input
                type="password"
                placeholder="••••••••"
                value={loginData.password}
                onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                className="w-full bg-transparent outline-none text-sm text-white placeholder:text-white/25"
                required
              />
            </Field>

            {error && <ErrorMsg>{error}</ErrorMsg>}

            <SubmitBtn loading={loading}>Войти</SubmitBtn>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <Field label="Ваше имя">
              <input
                type="text"
                placeholder="Иван Петров"
                value={registerData.display_name}
                onChange={e => setRegisterData({ ...registerData, display_name: e.target.value })}
                className="w-full bg-transparent outline-none text-sm text-white placeholder:text-white/25"
              />
            </Field>

            <Field
              label="Username"
              suffix={
                usernameStatus === "checking" ? <Loader2 size={13} className="animate-spin text-white/30" /> :
                usernameStatus === "ok" ? <CheckCircle2 size={13} className="text-emerald-400" /> :
                usernameStatus === "taken" ? <XCircle size={13} className="text-red-400" /> : null
              }
              hint={
                usernameStatus === "ok" ? { text: "Свободен", color: "text-emerald-400" } :
                usernameStatus === "taken" ? { text: "Уже занят", color: "text-red-400" } :
                { text: "4-20 символов, буквы, цифры, _", color: "text-white/25" }
              }
            >
              <div className="flex items-center gap-1">
                <span className="text-white/25 text-sm select-none">@</span>
                <input
                  type="text"
                  placeholder="ivan_petrov"
                  value={registerData.username}
                  onChange={e => handleUsernameInput(e.target.value)}
                  maxLength={20}
                  className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/25"
                  required
                />
              </div>
            </Field>

            <PhoneField
              digits={registerData.phone}
              onChange={d => setRegisterData({ ...registerData, phone: d })}
            />

            <Field label="Пароль">
              <input
                type="password"
                placeholder="Минимум 6 символов"
                value={registerData.password}
                onChange={e => setRegisterData({ ...registerData, password: e.target.value })}
                minLength={6}
                className="w-full bg-transparent outline-none text-sm text-white placeholder:text-white/25"
                required
              />
            </Field>

            {error && <ErrorMsg>{error}</ErrorMsg>}

            <SubmitBtn loading={loading} disabled={usernameStatus === "taken" || usernameStatus === "checking"}>
              Зарегистрироваться
            </SubmitBtn>
          </form>
        )}
      </div>
    </Layout>
  )
}

// ── Sub-components ─────────────────────────────────────

function fmtPhoneDisplay(digits: string) {
  const d = digits.slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`
  if (d.length <= 8) return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`
  return `${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`
}

function PhoneField({ digits, onChange }: { digits: string; onChange: (d: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold text-white/35 uppercase tracking-[0.1em]">
        Номер телефона
      </label>
      <div className="auth-input-wrap h-12 rounded-2xl px-4 flex items-center gap-2.5">
        <span className="text-base leading-none shrink-0 select-none">🇷🇺</span>
        <span className="text-sm text-white/60 font-medium shrink-0 select-none">+7</span>
        <div className="w-px h-4 bg-white/15 shrink-0" />
        <input
          type="tel"
          inputMode="numeric"
          placeholder="900 000-00-00"
          value={fmtPhoneDisplay(digits)}
          onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
          className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/25"
        />
      </div>
    </div>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-bg min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-[380px] space-y-6">
        <div className="flex items-center gap-3 px-1">
          <img src="/kofka-icon.svg" alt="Kofka" className="h-10 w-auto" />
          <div>
            <h1 className="font-kofka text-2xl font-bold leading-none tracking-wide"
                style={{ background: "linear-gradient(135deg, #a78bfa 0%, #60a5fa 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Kofka
            </h1>
            <p className="text-[10px] text-white/30 tracking-[0.18em] uppercase mt-0.5">Social Network</p>
          </div>
        </div>
        <div className="auth-card rounded-[28px] p-7">
          {children}
        </div>
      </div>
    </div>
  )
}

function Field({
  label, children, suffix, hint,
}: {
  label: string
  children: React.ReactNode
  suffix?: React.ReactNode
  hint?: { text: string; color: string }
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold text-white/35 uppercase tracking-[0.1em]">
        {label}
      </label>
      <div className="auth-input-wrap h-12 rounded-2xl px-4 flex items-center gap-2">
        <div className="flex-1 min-w-0">{children}</div>
        {suffix && <div className="shrink-0">{suffix}</div>}
      </div>
      {hint && <p className={`text-[11px] px-1 ${hint.color}`}>{hint.text}</p>}
    </div>
  )
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] text-red-400 bg-red-400/10 rounded-xl px-3 py-2">{children}</p>
  )
}

function SubmitBtn({
  children, loading, disabled,
}: {
  children: React.ReactNode
  loading: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full h-12 rounded-2xl bg-gradient-brand-short text-white font-semibold text-[15px]
                 hover:opacity-90 active:scale-[0.98] transition-all mt-2
                 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 size={18} className="animate-spin mx-auto" /> : children}
    </button>
  )
}

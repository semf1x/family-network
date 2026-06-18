"use client"

import { useEffect, useRef, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { api, BASE_URL } from "@/lib/api"
import { Camera, KeyRound, User, Bell, Type, Trash2, CheckCircle2, XCircle, Loader2, Phone, Shield } from "lucide-react"
import { subscribeToPush } from "@/app/(app)/layout"

const FONT_SIZES = [
  { value: "small", label: "Маленький", cls: "text-xs" },
  { value: "medium", label: "Средний", cls: "text-sm" },
  { value: "large", label: "Большой", cls: "text-base" },
] as const
type FontSize = "small" | "medium" | "large"

function loadAppSettings() {
  try { return JSON.parse(localStorage.getItem("app_settings") || "{}") } catch { return {} }
}
function saveAppSettings(patch: object) {
  const current = loadAppSettings()
  localStorage.setItem("app_settings", JSON.stringify({ ...current, ...patch }))
}

const USERNAME_RE = /^[a-z][a-z0-9_]{3,19}$/

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [bio, setBio] = useState("")
  const [profileMsg, setProfileMsg] = useState({ ok: "", err: "" })
  const [saving, setSaving] = useState(false)

  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle")
  const usernameCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [oldPw, setOldPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [pwMsg, setPwMsg] = useState({ ok: "", err: "" })
  const [savingPw, setSavingPw] = useState(false)
  const [pwErrors, setPwErrors] = useState({ old: "", new: "", confirm: "" })

  const [phone, setPhone] = useState("")
  const [phoneStep, setPhoneStep] = useState<"input" | "code">("input")
  const [phoneCode, setPhoneCode] = useState("")
  const [phoneMsg, setPhoneMsg] = useState({ ok: "", err: "" })
  const [phoneLoading, setPhoneLoading] = useState(false)

  const [showPhone, setShowPhone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [fontSize, setFontSize] = useState<FontSize>("medium")
  const [cacheCleared, setCacheCleared] = useState(false)

  useEffect(() => {
    const applyUser = (data: any) => {
      setUser(data); setDisplayName(data.display_name || ""); setUsername(data.username)
      setBio(data.bio || ""); setPhone(data.phone || ""); setShowPhone(data.show_phone ?? false)
    }
    api.me().then(applyUser).catch(() => {
      const stored = localStorage.getItem("user")
      if (stored) applyUser(JSON.parse(stored))
    })
    const s = loadAppSettings()
    setNotifEnabled(s.notifications ?? false)
    setSoundEnabled(s.sound ?? true)
    setFontSize(s.fontSize ?? "medium")
  }, [])

  function handleUsernameChange(value: string) {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, "")
    setUsername(cleaned)
    if (cleaned === user?.username) { setUsernameStatus("idle"); return }
    if (!cleaned || !USERNAME_RE.test(cleaned)) { setUsernameStatus("invalid"); return }
    setUsernameStatus("checking")
    if (usernameCheckTimeout.current) clearTimeout(usernameCheckTimeout.current)
    usernameCheckTimeout.current = setTimeout(async () => {
      try {
        const res = await api.checkUsername(cleaned)
        setUsernameStatus(res.available ? "available" : "taken")
      } catch { setUsernameStatus("idle") }
    }, 500)
  }

  async function handleSendPhoneCode(e: React.SyntheticEvent) {
    e.preventDefault(); setPhoneMsg({ ok: "", err: "" }); setPhoneLoading(true)
    try { await api.requestPhoneVerify(phone); setPhoneStep("code"); setPhoneMsg({ ok: "Код отправлен!", err: "" }) }
    catch (err: any) { setPhoneMsg({ ok: "", err: err.message }) }
    finally { setPhoneLoading(false) }
  }

  async function handleVerifyPhone(e: React.SyntheticEvent) {
    e.preventDefault(); setPhoneMsg({ ok: "", err: "" }); setPhoneLoading(true)
    try {
      const updated = await api.verifyPhoneNumber(phoneCode)
      applyUserUpdate(updated); setUser(updated); setPhoneStep("input"); setPhoneCode("")
      setPhoneMsg({ ok: "Номер подтверждён!", err: "" })
    } catch (err: any) { setPhoneMsg({ ok: "", err: err.message }) }
    finally { setPhoneLoading(false) }
  }

  async function toggleShowPhone() {
    const next = !showPhone; setShowPhone(next)
    try { applyUserUpdate(await api.updatePrivacy({ show_phone: next })) }
    catch { setShowPhone(!next) }
  }

  async function toggleNotifications() {
    if (!notifEnabled) {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") return
      await subscribeToPush()
    }
    const next = !notifEnabled; setNotifEnabled(next); saveAppSettings({ notifications: next })
  }

  function toggleSound() { const next = !soundEnabled; setSoundEnabled(next); saveAppSettings({ sound: next }) }
  function handleFontSize(val: FontSize) { setFontSize(val); saveAppSettings({ fontSize: val }) }

  function clearCache() {
    const token = localStorage.getItem("token"); const u = localStorage.getItem("user")
    localStorage.clear()
    if (token) localStorage.setItem("token", token)
    if (u) localStorage.setItem("user", u)
    setCacheCleared(true); setTimeout(() => setCacheCleared(false), 2000)
  }

  function applyUserUpdate(updated: any) {
    setUser(updated); localStorage.setItem("user", JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent("user-updated", { detail: updated }))
  }

  async function handleSaveProfile(e: React.SyntheticEvent) {
    e.preventDefault()
    if (usernameStatus === "taken") { setProfileMsg({ ok: "", err: "Этот username уже занят" }); return }
    if (usernameStatus === "invalid") { setProfileMsg({ ok: "", err: "Неверный формат username" }); return }
    setSaving(true); setProfileMsg({ ok: "", err: "" })
    try { applyUserUpdate(await api.updateProfile({ username, display_name: displayName, bio })); setProfileMsg({ ok: "Профиль обновлён!", err: "" }); setUsernameStatus("idle") }
    catch (err: any) { setProfileMsg({ ok: "", err: err.message }) }
    finally { setSaving(false) }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    try { applyUserUpdate(await api.uploadAvatar(file)); setProfileMsg({ ok: "Фото обновлено!", err: "" }) }
    catch (err: any) { setProfileMsg({ ok: "", err: err.message }) }
  }

  const PW_REGEX = /^[a-zA-Z0-9]{6,20}$/
  function validatePwField(v: string) {
    if (!v) return ""
    if (v.length < 6 || v.length > 20) return "От 6 до 20 символов"
    if (!PW_REGEX.test(v)) return "Только латинские буквы и цифры"
    return ""
  }
  function handlePwInput(field: "old" | "new" | "confirm", value: string) {
    const f = value.replace(/[^a-zA-Z0-9]/g, "")
    if (field === "old") setOldPw(f)
    if (field === "new") setNewPw(f)
    if (field === "confirm") setConfirmPw(f)
    setPwErrors(prev => ({ ...prev, [field]: validatePwField(f) }))
  }
  async function handleChangePassword(e: React.SyntheticEvent) {
    e.preventDefault(); setPwMsg({ ok: "", err: "" })
    const oldErr = validatePwField(oldPw); const newErr = validatePwField(newPw); const confirmErr = validatePwField(confirmPw)
    setPwErrors({ old: oldErr, new: newErr, confirm: confirmErr })
    if (oldErr || newErr || confirmErr) return
    if (newPw !== confirmPw) { setPwErrors(prev => ({ ...prev, confirm: "Пароли не совпадают" })); return }
    setSavingPw(true)
    try { await api.changePassword({ old_password: oldPw, new_password: newPw }); setPwMsg({ ok: "Пароль изменён!", err: "" }); setOldPw(""); setNewPw(""); setConfirmPw(""); setPwErrors({ old: "", new: "", confirm: "" }) }
    catch { setPwMsg({ ok: "", err: "Неверный текущий пароль" }) }
    finally { setSavingPw(false) }
  }

  if (!user) return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      <Loader2 size={18} className="animate-spin mr-2" /> Загрузка...
    </div>
  )

  return (
    <div className="max-w-xl mx-auto p-4 md:p-6 space-y-3 pb-8">
      <h2 className="text-xl font-bold px-1">Настройки</h2>

      {/* ── Фото профиля ── */}
      <Section icon={<Camera size={14} />} title="Фото профиля">
        <div className="flex items-center gap-4">
          <div className="relative group cursor-pointer shrink-0" onClick={() => fileRef.current?.click()}>
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.avatar_url ? `${BASE_URL}${user.avatar_url}` : undefined} />
              <AvatarFallback className="text-xl bg-secondary">
                {(user.display_name || user.username)?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera size={14} className="text-white" />
            </div>
          </div>
          <div className="space-y-1">
            <SecBtn onClick={() => fileRef.current?.click()}>Изменить фото</SecBtn>
            <p className="text-xs text-white/30">JPG, PNG или WebP</p>
          </div>
          <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleAvatarChange} />
        </div>
      </Section>

      {/* ── Личные данные ── */}
      <Section icon={<User size={14} />} title="Личные данные">
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <Field label="Имя" hint={<FieldHint>Отображается везде как ваше имя</FieldHint>}>
            <input
              value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="Иван Петров" maxLength={100}
              className="w-full bg-transparent outline-none text-sm text-white placeholder:text-white/25"
            />
          </Field>

          <Field
            label="Username"
            suffix={
              usernameStatus === "checking" ? <Loader2 size={13} className="animate-spin text-white/30" /> :
              usernameStatus === "available" ? <CheckCircle2 size={13} className="text-emerald-400" /> :
              usernameStatus === "taken" ? <XCircle size={13} className="text-red-400" /> : null
            }
            hint={
              usernameStatus === "taken" ? <FieldHint error>Этот username уже занят</FieldHint> :
              usernameStatus === "available" ? <FieldHint success>Username свободен</FieldHint> :
              usernameStatus === "invalid" && username.length > 0 ? <FieldHint warn>4-20 символов, строчные буквы, цифры и _</FieldHint> :
              <FieldHint>Уникальный идентификатор · 4-20 символов</FieldHint>
            }
          >
            <div className="flex items-center gap-1">
              <span className="text-white/25 text-sm select-none">@</span>
              <input
                value={username} onChange={e => handleUsernameChange(e.target.value)}
                placeholder="ivan_petrov" maxLength={20}
                className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-white/25"
              />
            </div>
          </Field>

          <Field label="О себе">
            <textarea
              value={bio} onChange={e => setBio(e.target.value)}
              placeholder="Расскажите о себе..." rows={2}
              className="w-full bg-transparent outline-none text-sm text-white placeholder:text-white/25 resize-none py-0.5"
            />
          </Field>

          {profileMsg.err && <StatusPill error>{profileMsg.err}</StatusPill>}
          {profileMsg.ok && <StatusPill>{profileMsg.ok}</StatusPill>}

          <PrimBtn type="submit" disabled={saving || usernameStatus === "taken" || usernameStatus === "checking"}>
            {saving ? <><Loader2 size={14} className="animate-spin mr-2" />Сохраняем...</> : "Сохранить изменения"}
          </PrimBtn>
        </form>
      </Section>

      {/* ── Смена пароля ── */}
      <Section icon={<KeyRound size={14} />} title="Смена пароля">
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Field label="Текущий пароль" hint={pwErrors.old ? <FieldHint error>{pwErrors.old}</FieldHint> : null}>
            <input
              type="password" value={oldPw} onChange={e => handlePwInput("old", e.target.value)}
              placeholder="••••••••" maxLength={20}
              className="w-full bg-transparent outline-none text-sm text-white placeholder:text-white/25"
            />
          </Field>
          <Field label="Новый пароль" hint={pwErrors.new ? <FieldHint error>{pwErrors.new}</FieldHint> : newPw && !pwErrors.new ? <FieldHint>{newPw.length}/20</FieldHint> : null}>
            <input
              type="password" value={newPw} onChange={e => handlePwInput("new", e.target.value)}
              placeholder="••••••••" maxLength={20}
              className="w-full bg-transparent outline-none text-sm text-white placeholder:text-white/25"
            />
          </Field>
          <Field label="Повторите пароль" hint={pwErrors.confirm ? <FieldHint error>{pwErrors.confirm}</FieldHint> : null}>
            <input
              type="password" value={confirmPw} onChange={e => handlePwInput("confirm", e.target.value)}
              placeholder="••••••••" maxLength={20}
              className="w-full bg-transparent outline-none text-sm text-white placeholder:text-white/25"
            />
          </Field>

          {pwMsg.err && <StatusPill error>{pwMsg.err}</StatusPill>}
          {pwMsg.ok && <StatusPill>{pwMsg.ok}</StatusPill>}

          <PrimBtn type="submit" disabled={savingPw}>
            {savingPw ? <><Loader2 size={14} className="animate-spin mr-2" />Меняем...</> : "Изменить пароль"}
          </PrimBtn>
        </form>
      </Section>

      {/* ── Телефон ── */}
      <Section icon={<Phone size={14} />} title="Номер телефона">
        {user.phone_verified ? (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 size={14} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{user.phone}</p>
              <p className="text-xs text-white/30">Номер подтверждён</p>
            </div>
            <button
              onClick={() => { setPhoneStep("input"); setPhone(user.phone || ""); setPhoneMsg({ ok: "", err: "" }) }}
              className="text-xs text-white/40 hover:text-white/70 transition-colors underline underline-offset-2"
            >
              Изменить
            </button>
          </div>
        ) : phoneStep === "input" ? (
          <form onSubmit={handleSendPhoneCode} className="space-y-4">
            <Field label="Номер телефона" hint={<FieldHint>Введите номер с кодом страны (+7...)</FieldHint>}>
              <input
                type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+7 900 000 00 00"
                className="w-full bg-transparent outline-none text-sm text-white placeholder:text-white/25"
              />
            </Field>
            {phoneMsg.err && <StatusPill error>{phoneMsg.err}</StatusPill>}
            {phoneMsg.ok && <StatusPill>{phoneMsg.ok}</StatusPill>}
            <PrimBtn type="submit" disabled={phoneLoading || !phone.trim()}>
              {phoneLoading ? <><Loader2 size={14} className="animate-spin mr-2" />Отправляем...</> : "Получить код"}
            </PrimBtn>
          </form>
        ) : (
          <form onSubmit={handleVerifyPhone} className="space-y-4">
            <p className="text-sm text-white/40">Код отправлен на <span className="text-white/70 font-medium">{phone}</span></p>
            <Field label="Код из SMS">
              <input
                value={phoneCode} onChange={e => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456" maxLength={6} inputMode="numeric"
                className="w-full bg-transparent outline-none text-sm text-white placeholder:text-white/25 tracking-[0.2em]"
              />
            </Field>
            {phoneMsg.err && <StatusPill error>{phoneMsg.err}</StatusPill>}
            {phoneMsg.ok && <StatusPill>{phoneMsg.ok}</StatusPill>}
            <div className="flex gap-2">
              <PrimBtn type="submit" disabled={phoneLoading || phoneCode.length < 6}>
                {phoneLoading ? <><Loader2 size={14} className="animate-spin mr-2" />Проверяем...</> : "Подтвердить"}
              </PrimBtn>
              <SecBtn type="button" onClick={() => { setPhoneStep("input"); setPhoneCode(""); setPhoneMsg({ ok: "", err: "" }) }}>
                Назад
              </SecBtn>
            </div>
          </form>
        )}
      </Section>

      {/* ── Приватность ── */}
      <Section icon={<Shield size={14} />} title="Приватность">
        <ToggleRow
          label="Показывать номер телефона"
          description={user.phone_verified ? "Другие пользователи увидят ваш номер в профиле" : "Сначала подтвердите номер телефона"}
          checked={showPhone && user.phone_verified}
          disabled={!user.phone_verified}
          onChange={toggleShowPhone}
        />
      </Section>

      {/* ── Уведомления ── */}
      <Section icon={<Bell size={14} />} title="Уведомления">
        <div className="space-y-4">
          <ToggleRow
            label="Push-уведомления"
            description="Показывать уведомления о новых сообщениях"
            checked={notifEnabled}
            onChange={toggleNotifications}
          />
          <div className="h-px bg-white/5" />
          <ToggleRow
            label="Звук"
            description="Звуковой сигнал при новом сообщении"
            checked={soundEnabled}
            onChange={toggleSound}
          />
        </div>
      </Section>

      {/* ── Размер шрифта ── */}
      <Section icon={<Type size={14} />} title="Размер шрифта в чатах">
        <div className="space-y-3">
          <div className="flex gap-2">
            {FONT_SIZES.map(({ value, label, cls }) => (
              <button
                key={value}
                onClick={() => handleFontSize(value)}
                className={`flex-1 h-10 rounded-2xl text-sm font-medium transition-all ${
                  fontSize === value
                    ? "bg-gradient-brand-short text-white"
                    : "bg-secondary border border-white/8 text-white/50 hover:text-white/80"
                }`}
              >
                <span className={cls}>{label}</span>
              </button>
            ))}
          </div>
          <p className={`text-white/30 px-1 ${FONT_SIZES.find(f => f.value === fontSize)?.cls}`}>
            Вот так будут выглядеть сообщения в чате
          </p>
        </div>
      </Section>

      {/* ── Данные и хранилище ── */}
      <Section icon={<Trash2 size={14} />} title="Данные и хранилище">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Очистить кэш</p>
            <p className="text-xs text-white/30">Сбросить сохранённые настройки и кэш</p>
          </div>
          <SecBtn onClick={clearCache}>{cacheCleared ? "Готово ✓" : "Очистить"}</SecBtn>
        </div>
      </Section>
    </div>
  )
}

// ── UI primitives ──────────────────────────────────────

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-white/5 overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/5">
        <div className="h-7 w-7 rounded-xl bg-secondary border border-white/8 flex items-center justify-center text-white/50">
          {icon}
        </div>
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Field({ label, children, suffix, hint }: {
  label: string; children: React.ReactNode; suffix?: React.ReactNode; hint?: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold text-white/35 uppercase tracking-[0.1em]">{label}</label>
      <div className="auth-input-wrap rounded-2xl px-4 py-3 flex items-start gap-2">
        <div className="flex-1 min-w-0">{children}</div>
        {suffix && <div className="shrink-0 mt-0.5">{suffix}</div>}
      </div>
      {hint}
    </div>
  )
}

function FieldHint({ children, error, success, warn }: { children: React.ReactNode; error?: boolean; success?: boolean; warn?: boolean }) {
  const color = error ? "text-red-400" : success ? "text-emerald-400" : warn ? "text-amber-400" : "text-white/25"
  return <p className={`text-[11px] px-1 ${color}`}>{children}</p>
}

function StatusPill({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <p className={`text-[13px] rounded-xl px-3 py-2 ${error ? "text-red-400 bg-red-400/10" : "text-emerald-400 bg-emerald-400/10"}`}>
      {children}
    </p>
  )
}

function PrimBtn({ children, type = "button", disabled, onClick }: {
  children: React.ReactNode; type?: "button" | "submit"; disabled?: boolean; onClick?: () => void
}) {
  return (
    <button
      type={type} disabled={disabled} onClick={onClick}
      className="h-11 px-5 rounded-2xl bg-gradient-brand-short text-white font-semibold text-sm
                 flex items-center justify-center
                 hover:opacity-90 active:scale-[0.98] transition-all
                 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

function SecBtn({ children, type = "button", disabled, onClick }: {
  children: React.ReactNode; type?: "button" | "submit"; disabled?: boolean; onClick?: () => void
}) {
  return (
    <button
      type={type} disabled={disabled} onClick={onClick}
      className="h-11 px-5 rounded-2xl bg-secondary border border-white/8 text-white/70 font-medium text-sm
                 flex items-center justify-center
                 hover:text-white hover:bg-accent transition-all
                 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  )
}

function ToggleRow({ label, description, checked, disabled, onChange }: {
  label: string; description: string; checked: boolean; disabled?: boolean; onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-white/30 mt-0.5">{description}</p>
      </div>
      <button
        onClick={onChange} disabled={disabled}
        className={`relative shrink-0 w-12 h-6 rounded-full transition-all duration-200
          ${checked ? "bg-gradient-brand-short" : "bg-secondary border border-white/10"}
          disabled:opacity-40`}
      >
        <span className={`absolute top-[3px] w-[18px] h-[18px] bg-white rounded-full shadow transition-all duration-200
          ${checked ? "left-[26px]" : "left-[3px]"}`} />
      </button>
    </div>
  )
}

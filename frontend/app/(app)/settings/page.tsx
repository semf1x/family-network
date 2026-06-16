"use client"

import { useEffect, useRef, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, BASE_URL } from "@/lib/api"
import { Camera, KeyRound, User, Bell, Type, Trash2, CheckCircle2, XCircle, Loader2, Phone, Shield } from "lucide-react"

const FONT_SIZES = [
  { value: "small", label: "Маленький", cls: "text-xs" },
  { value: "medium", label: "Средний", cls: "text-sm" },
  { value: "large", label: "Большой", cls: "text-base" },
] as const
type FontSize = "small" | "medium" | "large"

function loadAppSettings() {
  try {
    return JSON.parse(localStorage.getItem("app_settings") || "{}")
  } catch { return {} }
}
function saveAppSettings(patch: object) {
  const current = loadAppSettings()
  localStorage.setItem("app_settings", JSON.stringify({ ...current, ...patch }))
}

function StatusMessage({ ok, err }: { ok: string; err: string }) {
  if (err) return <p className="text-destructive text-sm">{err}</p>
  if (ok) return <p className="text-green-500 text-sm">{ok}</p>
  return null
}

const USERNAME_RE = /^[a-z][a-z0-9_]{3,19}$/

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [bio, setBio] = useState("")
  const [profileMsg, setProfileMsg] = useState({ ok: "", err: "" })
  const [saving, setSaving] = useState(false)

  // username availability check
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle")
  const usernameCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [oldPw, setOldPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [pwMsg, setPwMsg] = useState({ ok: "", err: "" })
  const [savingPw, setSavingPw] = useState(false)
  const [pwErrors, setPwErrors] = useState({ old: "", new: "", confirm: "" })

  // phone verification
  const [phone, setPhone] = useState("")
  const [phoneStep, setPhoneStep] = useState<"input" | "code">("input")
  const [phoneCode, setPhoneCode] = useState("")
  const [phoneMsg, setPhoneMsg] = useState({ ok: "", err: "" })
  const [phoneLoading, setPhoneLoading] = useState(false)

  // privacy
  const [showPhone, setShowPhone] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [fontSize, setFontSize] = useState<FontSize>("medium")
  const [cacheCleared, setCacheCleared] = useState(false)

  useEffect(() => {
    api.me().then((data) => {
      setUser(data)
      setDisplayName(data.display_name || "")
      setUsername(data.username)
      setBio(data.bio || "")
      setPhone(data.phone || "")
      setShowPhone(data.show_phone ?? false)
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
    e.preventDefault()
    setPhoneMsg({ ok: "", err: "" })
    setPhoneLoading(true)
    try {
      await api.requestPhoneVerify(phone)
      setPhoneStep("code")
      setPhoneMsg({ ok: "Код отправлен!", err: "" })
    } catch (err: any) {
      setPhoneMsg({ ok: "", err: err.message })
    } finally {
      setPhoneLoading(false)
    }
  }

  async function handleVerifyPhone(e: React.SyntheticEvent) {
    e.preventDefault()
    setPhoneMsg({ ok: "", err: "" })
    setPhoneLoading(true)
    try {
      const updated = await api.verifyPhone(phoneCode)
      applyUserUpdate(updated)
      setUser(updated)
      setPhoneStep("input")
      setPhoneCode("")
      setPhoneMsg({ ok: "Номер подтверждён!", err: "" })
    } catch (err: any) {
      setPhoneMsg({ ok: "", err: err.message })
    } finally {
      setPhoneLoading(false)
    }
  }

  async function toggleShowPhone() {
    const next = !showPhone
    setShowPhone(next)
    try {
      const updated = await api.updatePrivacy({ show_phone: next })
      applyUserUpdate(updated)
    } catch {
      setShowPhone(!next)
    }
  }

  async function toggleNotifications() {
    if (!notifEnabled) {
      const perm = await Notification.requestPermission()
      if (perm !== "granted") return
    }
    const next = !notifEnabled
    setNotifEnabled(next)
    saveAppSettings({ notifications: next })
  }

  function toggleSound() {
    const next = !soundEnabled
    setSoundEnabled(next)
    saveAppSettings({ sound: next })
  }

  function handleFontSize(val: FontSize) {
    setFontSize(val)
    saveAppSettings({ fontSize: val })
  }

  function clearCache() {
    const token = localStorage.getItem("token")
    const user = localStorage.getItem("user")
    localStorage.clear()
    if (token) localStorage.setItem("token", token)
    if (user) localStorage.setItem("user", user)
    setCacheCleared(true)
    setTimeout(() => setCacheCleared(false), 2000)
  }

  function applyUserUpdate(updated: any) {
    setUser(updated)
    localStorage.setItem("user", JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent("user-updated", { detail: updated }))
  }

  async function handleSaveProfile(e: React.SyntheticEvent) {
    e.preventDefault()
    if (usernameStatus === "taken") {
      setProfileMsg({ ok: "", err: "Этот username уже занят" })
      return
    }
    if (usernameStatus === "invalid") {
      setProfileMsg({ ok: "", err: "Неверный формат username" })
      return
    }
    setSaving(true)
    setProfileMsg({ ok: "", err: "" })
    try {
      applyUserUpdate(await api.updateProfile({ username, display_name: displayName, bio }))
      setProfileMsg({ ok: "Профиль обновлён!", err: "" })
      setUsernameStatus("idle")
    } catch (err: any) {
      setProfileMsg({ ok: "", err: err.message })
    } finally {
      setSaving(false)
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      applyUserUpdate(await api.uploadAvatar(file))
      setProfileMsg({ ok: "Фото обновлено!", err: "" })
    } catch (err: any) {
      setProfileMsg({ ok: "", err: err.message })
    }
  }

  const PW_REGEX = /^[a-zA-Z0-9]{6,20}$/

  function validatePwField(value: string): string {
    if (!value) return ""
    if (value.length < 6 || value.length > 20) return "От 6 до 20 символов"
    if (!PW_REGEX.test(value)) return "Только латинские буквы и цифры"
    return ""
  }

  function handlePwInput(field: "old" | "new" | "confirm", value: string) {
    const filtered = value.replace(/[^a-zA-Z0-9]/g, "")
    if (field === "old") setOldPw(filtered)
    if (field === "new") setNewPw(filtered)
    if (field === "confirm") setConfirmPw(filtered)
    setPwErrors(prev => ({ ...prev, [field]: validatePwField(filtered) }))
  }

  async function handleChangePassword(e: React.SyntheticEvent) {
    e.preventDefault()
    setPwMsg({ ok: "", err: "" })

    const oldErr = validatePwField(oldPw)
    const newErr = validatePwField(newPw)
    const confirmErr = validatePwField(confirmPw)
    setPwErrors({ old: oldErr, new: newErr, confirm: confirmErr })
    if (oldErr || newErr || confirmErr) return

    if (newPw !== confirmPw) {
      setPwErrors(prev => ({ ...prev, confirm: "Пароли не совпадают" }))
      return
    }

    setSavingPw(true)
    try {
      await api.changePassword({ old_password: oldPw, new_password: newPw })
      setPwMsg({ ok: "Пароль изменён!", err: "" })
      setOldPw("")
      setNewPw("")
      setConfirmPw("")
      setPwErrors({ old: "", new: "", confirm: "" })
    } catch (err: any) {
      setPwMsg({ ok: "", err: "Пароль не верный, попробуйте еще раз" })
    } finally {
      setSavingPw(false)
    }
  }

  if (!user) return (
    <div className="flex items-center justify-center h-full text-muted-foreground">Загрузка...</div>
  )

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h2 className="text-2xl font-bold">Настройки</h2>

      {/* Фото профиля */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera size={16} /> Фото профиля
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.avatar_url ? `${BASE_URL}${user.avatar_url}` : undefined} />
              <AvatarFallback className="text-xl">{(user.display_name || user.username)?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera size={16} className="text-white" />
            </div>
          </div>
          <div>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              Изменить фото
            </Button>
            <p className="text-xs text-muted-foreground mt-1">JPG, PNG или WebP</p>
          </div>
          <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleAvatarChange} />
        </CardContent>
      </Card>

      {/* Личные данные */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User size={16} /> Личные данные
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Имя</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Иван Петров"
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">Отображается везде как ваше имя</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground select-none">@</span>
                <Input
                  id="username"
                  value={username}
                  onChange={e => handleUsernameChange(e.target.value)}
                  placeholder="ivan_petrov"
                  className="pl-7 pr-9"
                  maxLength={20}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameStatus === "checking" && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                  {usernameStatus === "available" && <CheckCircle2 size={14} className="text-green-500" />}
                  {usernameStatus === "taken" && <XCircle size={14} className="text-destructive" />}
                </span>
              </div>
              {usernameStatus === "taken" && <p className="text-xs text-destructive">Этот username уже занят</p>}
              {usernameStatus === "available" && <p className="text-xs text-green-500">Username свободен</p>}
              {usernameStatus === "invalid" && username.length > 0 && (
                <p className="text-xs text-amber-500">4-20 символов, строчные буквы, цифры и _</p>
              )}
              {usernameStatus === "idle" && <p className="text-xs text-muted-foreground">Уникальный идентификатор. 4-20 символов</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio">О себе</Label>
              <Input id="bio" value={bio} onChange={e => setBio(e.target.value)} placeholder="Расскажите о себе..." />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user.email} disabled className="opacity-60" />
            </div>
            <StatusMessage ok={profileMsg.ok} err={profileMsg.err} />
            <Button type="submit" disabled={saving || usernameStatus === "taken" || usernameStatus === "checking"}>
              {saving ? "Сохраняем..." : "Сохранить"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Смена пароля */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound size={16} /> Смена пароля
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="old-pw">Текущий пароль</Label>
              <Input
                id="old-pw" type="password" value={oldPw}
                onChange={e => handlePwInput("old", e.target.value)}
                placeholder="••••••••"
                maxLength={20}
                className={pwErrors.old ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {pwErrors.old && <p className="text-destructive text-xs">{pwErrors.old}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">Новый пароль</Label>
              <Input
                id="new-pw" type="password" value={newPw}
                onChange={e => handlePwInput("new", e.target.value)}
                placeholder="••••••••"
                maxLength={20}
                className={pwErrors.new ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {pwErrors.new && <p className="text-destructive text-xs">{pwErrors.new}</p>}
              {newPw && !pwErrors.new && (
                <p className="text-xs text-muted-foreground">{newPw.length}/20 символов</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Повторите пароль</Label>
              <Input
                id="confirm-pw" type="password" value={confirmPw}
                onChange={e => handlePwInput("confirm", e.target.value)}
                placeholder="••••••••"
                maxLength={20}
                className={pwErrors.confirm ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {pwErrors.confirm && <p className="text-destructive text-xs">{pwErrors.confirm}</p>}
            </div>
            <StatusMessage ok={pwMsg.ok} err={pwMsg.err} />
            <Button type="submit" disabled={savingPw}>
              {savingPw ? "Меняем..." : "Изменить пароль"}
            </Button>
          </form>
        </CardContent>
      </Card>
      {/* Телефон */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Phone size={16} /> Номер телефона
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {user.phone_verified ? (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 size={16} className="text-green-500 shrink-0" />
              <span className="font-medium">{user.phone}</span>
              <span className="text-muted-foreground">— подтверждён</span>
              <button
                className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => { setPhoneStep("input"); setPhone(user.phone || ""); setPhoneMsg({ ok: "", err: "" }) }}
              >
                Изменить
              </button>
            </div>
          ) : (
            <>
              {phoneStep === "input" ? (
                <form onSubmit={handleSendPhoneCode} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Номер телефона</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+7 900 000 00 00"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Введите номер с кодом страны (+7...)</p>
                  </div>
                  <StatusMessage ok={phoneMsg.ok} err={phoneMsg.err} />
                  <Button type="submit" size="sm" disabled={phoneLoading || !phone.trim()}>
                    {phoneLoading ? <><Loader2 size={14} className="mr-2 animate-spin" /> Отправляем...</> : "Получить код"}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyPhone} className="space-y-3">
                  <p className="text-sm text-muted-foreground">Код отправлен на <span className="text-foreground font-medium">{phone}</span></p>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone-code">Код из SMS</Label>
                    <Input
                      id="phone-code"
                      placeholder="123456"
                      value={phoneCode}
                      onChange={e => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      maxLength={6}
                    />
                  </div>
                  <StatusMessage ok={phoneMsg.ok} err={phoneMsg.err} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={phoneLoading || phoneCode.length < 6}>
                      {phoneLoading ? <><Loader2 size={14} className="mr-2 animate-spin" /> Проверяем...</> : "Подтвердить"}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setPhoneStep("input"); setPhoneCode(""); setPhoneMsg({ ok: "", err: "" }) }}>
                      Изменить номер
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Приватность */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield size={16} /> Приватность
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Показывать номер телефона</p>
              <p className="text-xs text-muted-foreground">
                {user.phone_verified ? "Другие пользователи увидят ваш номер в профиле" : "Сначала подтвердите номер телефона"}
              </p>
            </div>
            <button
              onClick={toggleShowPhone}
              disabled={!user.phone_verified}
              className={`relative w-11 h-6 rounded-full transition-colors ${showPhone && user.phone_verified ? "bg-primary" : "bg-muted"} disabled:opacity-40`}
            >
              <span className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow transition-all ${showPhone && user.phone_verified ? "left-[22px]" : "left-[2px]"}`} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Уведомления */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell size={16} /> Уведомления
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Push-уведомления</p>
              <p className="text-xs text-muted-foreground">Показывать уведомления о новых сообщениях</p>
            </div>
            <button
              onClick={toggleNotifications}
              className={`relative w-11 h-6 rounded-full transition-colors ${notifEnabled ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow transition-all ${notifEnabled ? "left-[22px]" : "left-[2px]"}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Звук</p>
              <p className="text-xs text-muted-foreground">Звуковой сигнал при новом сообщении</p>
            </div>
            <button
              onClick={toggleSound}
              className={`relative w-11 h-6 rounded-full transition-colors ${soundEnabled ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`absolute top-[2px] w-5 h-5 bg-white rounded-full shadow transition-all ${soundEnabled ? "left-[22px]" : "left-[2px]"}`} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Размер шрифта */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Type size={16} /> Размер шрифта в чатах
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {FONT_SIZES.map(({ value, label, cls }) => (
              <button
                key={value}
                onClick={() => handleFontSize(value)}
                className={`flex-1 py-2 rounded-lg border text-sm transition-colors ${
                  fontSize === value
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                <span className={cls}>{label}</span>
              </button>
            ))}
          </div>
          <p className={`mt-3 text-muted-foreground ${FONT_SIZES.find(f => f.value === fontSize)?.cls}`}>
            Вот так будут выглядеть сообщения в чате
          </p>
        </CardContent>
      </Card>

      {/* Кэш */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 size={16} /> Данные и хранилище
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Очистить кэш приложения</p>
              <p className="text-xs text-muted-foreground">Сбросить сохранённые настройки и кэшированные данные</p>
            </div>
            <Button variant="outline" size="sm" onClick={clearCache}>
              {cacheCleared ? "Готово ✓" : "Очистить"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

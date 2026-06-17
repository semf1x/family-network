"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, BASE_URL } from "@/lib/api"
import { addWSHandler } from "@/lib/ws"
import VerifiedBadge from "@/components/VerifiedBadge"
import {
  Send, SquarePen, X, Search, Paperclip, FileIcon,
  Mic, Play, Pause, Check, CheckCheck, CornerUpLeft, Phone, ArrowLeft,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

const BASE = BASE_URL

function avatarUrl(url?: string) {
  return url ? `${BASE}${url}` : undefined
}

function playBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 520
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.25)
  } catch {}
}

function getFontClass(): string {
  try {
    const s = JSON.parse(localStorage.getItem("app_settings") || "{}")
    return s.fontSize === "small" ? "text-xs" : s.fontSize === "large" ? "text-base" : "text-sm"
  } catch { return "text-sm" }
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Сегодня"
  if (d.toDateString() === yesterday.toDateString()) return "Вчера"
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
}

function fmtDuration(s: number) {
  if (!isFinite(s) || isNaN(s) || s < 0) return "0:00"
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
}

// Генерирует псевдо-случайную вейвформу на основе URL (стабильная для одного файла)
function generateWaveform(seed: string, count = 44): number[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff
  const raw = Array.from({ length: count }, () => {
    h = (h * 1664525 + 1013904223) & 0xffffffff
    return Math.abs(h) / 0x7fffffff
  })
  return raw.map((v, i) => {
    const env = Math.sin((i / count) * Math.PI) * 0.65 + 0.35
    return Math.max(0.08, Math.min(1, v * env))
  })
}

function AudioPlayer({ url, isMine }: { url: string; isMine?: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const ref = useRef<HTMLAudioElement>(null)
  const bars = useMemo(() => generateWaveform(url, 32), [url])

  // Stop this player when another audio starts
  useEffect(() => {
    const handler = (e: Event) => {
      const otherUrl = (e as CustomEvent).detail
      if (otherUrl !== url && ref.current) {
        ref.current.pause()
        setPlaying(false)
      }
    }
    window.addEventListener("audio-play-start", handler)
    return () => window.removeEventListener("audio-play-start", handler)
  }, [url])

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const t = ratio * (duration || 0)
    if (ref.current) ref.current.currentTime = t
    setCurrent(t)
  }

  function togglePlay() {
    if (!ref.current) return
    if (playing) {
      ref.current.pause()
      setPlaying(false)
    } else {
      window.dispatchEvent(new CustomEvent("audio-play-start", { detail: url }))
      ref.current.play()
      setPlaying(true)
    }
  }

  const filledColor = isMine ? "rgba(255,255,255,0.95)" : "rgba(96,35,191,0.85)"
  const emptyColor = isMine ? "rgba(255,255,255,0.32)" : "rgba(96,35,191,0.22)"
  const btnClass = isMine ? "bg-white/20 hover:bg-white/30" : "bg-primary/15 hover:bg-primary/25"
  const iconClass = isMine ? "text-white" : "text-primary"
  const timeClass = isMine ? "text-white opacity-60" : "text-foreground opacity-50"

  return (
    <div className="flex items-center gap-2.5 w-full min-w-0">
      <audio ref={ref} src={url}
        onLoadedMetadata={() => setDuration(ref.current?.duration || 0)}
        onTimeUpdate={() => setCurrent(ref.current?.currentTime || 0)}
        onEnded={() => { setPlaying(false); setCurrent(0) }}
      />
      <button
        onClick={togglePlay}
        className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-colors ${btnClass}`}
      >
        {playing ? <Pause size={14} className={iconClass} /> : <Play size={14} className={iconClass} />}
      </button>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div
          className="flex items-center gap-[2px] h-9 cursor-pointer overflow-hidden"
          onClick={seek}
        >
          {bars.map((h, i) => {
            const progress = duration > 0 ? current / duration : 0
            const filled = i / bars.length < progress
            return (
              <div
                key={i}
                className="w-[3px] rounded-full transition-colors duration-75 flex-shrink-0"
                style={{
                  height: `${Math.round(h * 100)}%`,
                  backgroundColor: filled ? filledColor : emptyColor,
                }}
              />
            )
          })}
        </div>
        <span className={`text-xs ${timeClass}`}>
          {fmtDuration(current > 0 || playing ? current : duration)}
        </span>
      </div>
    </div>
  )
}

function replyPreviewText(msg: any) {
  if (!msg) return ""
  if (msg.file_type === "audio") return "🎤 Голосовое"
  if (msg.file_type === "image") return "🖼 Фото"
  if (msg.file_type === "file") return "📎 " + (msg.file_name || "Файл")
  return msg.text || ""
}

function ChatsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [conversations, setConversations] = useState<any[]>([])
  const [activeUser, setActiveUser] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState("")
  const [replyTo, setReplyTo] = useState<any>(null)

  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)

  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)

  const [fontClass, setFontClass] = useState("text-sm")

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeUserRef = useRef<any>(null)
  const messageRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioMimeRef = useRef<string>("audio/webm")
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { setFontClass(getFontClass()) }, [])
  useEffect(() => { activeUserRef.current = activeUser }, [activeUser])

  // Открыть чат по ?user=username
  useEffect(() => {
    const u = searchParams.get("user")
    if (!u) return
    api.searchUsers(u).then(results => {
      const found = results.find((r: any) => r.username === u)
      if (found) openChat(found)
    })
  }, [searchParams]) // eslint-disable-line

  function updateConversations(convs: any[]) {
    setConversations(convs)
    const unread = convs.filter(c => c.unread_count > 0).length
    window.dispatchEvent(new CustomEvent("unread-count", { detail: unread }))
  }

  // Загрузка диалогов + подписка на WS сообщения
  useEffect(() => {
    api.getConversations().then(updateConversations)

    const remove = addWSHandler((data) => {
      if (data.type === "read") {
        setMessages(prev => prev.map(m => m.is_mine ? { ...m, is_read: true } : m))
        return
      }
      if (data.type !== "message") return
      const activeU = activeUserRef.current
      if (activeU && data.from_id === activeU.id) {
        api.markAsRead(data.from_id).catch(() => {})
        setMessages(prev => [...prev, { ...data, is_read: true }])
      } else {
        setMessages(prev => [...prev, data])
      }
      api.getConversations().then(updateConversations)

      const s = JSON.parse(localStorage.getItem("app_settings") || "{}")
      if (s.sound !== false) playBeep()
      if (s.notifications && document.visibilityState === "hidden") {
        const name = activeU?.display_name || activeU?.username || "Новое сообщение"
        new Notification(name, { body: data.text || replyPreviewText(data) })
      }
    })

    return () => remove()
  }, []) // eslint-disable-line

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Поиск с debounce
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return }
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    setSearching(true)
    searchTimeout.current = setTimeout(async () => {
      try { setSearchResults(await api.searchUsers(searchQuery)) }
      finally { setSearching(false) }
    }, 300)
  }, [searchQuery])

  async function openChat(user: any) {
    setActiveUser(user)
    setShowSearch(false)
    setSearchQuery("")
    setSearchResults([])
    setReplyTo(null)
    const msgs = await api.getMessages(user.id)
    setMessages(msgs)
    await api.markAsRead(user.id).catch(() => {})
    setConversations(prev => prev.map(c =>
      c.user.id === user.id ? { ...c, unread_count: 0 } : c
    ))
  }

  function scrollToMessage(id: number) {
    const el = messageRefs.current[id]
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.classList.add("ring-2", "ring-primary/40", "rounded-xl")
    setTimeout(() => el.classList.remove("ring-2", "ring-primary/40", "rounded-xl"), 1200)
  }

  function updateConvPreview(user: any, msg: any) {
    const preview = replyPreviewText(msg) || msg.text || ""
    setConversations(prev => {
      const exists = prev.find(c => c.user.id === user.id)
      if (exists) return prev.map(c =>
        c.user.id === user.id
          ? { ...c, last_message: { text: preview, created_at: msg.created_at, is_mine: true, is_read: false } }
          : c
      )
      return [{ user, last_message: { text: preview, created_at: msg.created_at, is_mine: true, is_read: false }, unread_count: 0 }, ...prev]
    })
  }

  async function handleSend(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!text.trim() || !activeUser) return
    const msg = await api.sendMessage(activeUser.id, text.trim(), replyTo?.id)
    setMessages(prev => [...prev, msg])
    setText("")
    setReplyTo(null)
    updateConvPreview(activeUser, msg)
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeUser) return
    e.target.value = ""
    const msg = await api.sendFile(activeUser.id, file, replyTo?.id)
    setMessages(prev => [...prev, msg])
    setReplyTo(null)
    updateConvPreview(activeUser, msg)
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferred = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
      const mimeType = preferred.find(t => MediaRecorder.isTypeSupported(t)) || ""
      audioMimeRef.current = mimeType || "audio/webm"
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      audioChunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true)
      setRecordingTime(0)
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } catch { alert("Нет доступа к микрофону") }
  }

  async function stopRecording(send: boolean) {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
    const mr = mediaRecorderRef.current
    if (!mr) return
    setIsRecording(false)
    setRecordingTime(0)
    if (!send) {
      mr.stop(); mr.stream.getTracks().forEach(t => t.stop()); return
    }
    await new Promise<void>(resolve => {
      mr.onstop = async () => {
        const mimeType = audioMimeRef.current
        const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm"
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        const file = new File([blob], `voice.${ext}`, { type: mimeType })
        if (activeUser) {
          const msg = await api.sendFile(activeUser.id, file, replyTo?.id)
          setMessages(prev => [...prev, msg])
          setReplyTo(null)
          updateConvPreview(activeUser, msg)
        }
        resolve()
      }
      mr.stop(); mr.stream.getTracks().forEach(t => t.stop())
    })
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Список диалогов ── */}
      <div className={`border-r flex-col shrink-0 md:w-72 md:flex ${activeUser ? "hidden md:flex" : "flex w-full"}`}>
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Сообщения</h2>
          <button
            onClick={() => { setShowSearch(s => !s); setSearchQuery(""); setSearchResults([]) }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {showSearch ? <X size={18} /> : <SquarePen size={18} />}
          </button>
        </div>

        {showSearch && (
          <div className="p-3 border-b">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Найти пользователя..." className="pl-8 h-8 text-sm" />
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {searchResults.map(u => (
                  <button key={u.id} onClick={() => openChat(u)}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent transition-colors text-left">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={avatarUrl(u.avatar_url)} />
                      <AvatarFallback>{(u.display_name || u.username)?.[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.display_name || u.username}</p>
                      <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.trim() && !searching && searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2 px-2">Никого не найдено</p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto">
          {conversations.length === 0 && !showSearch && (
            <p className="text-muted-foreground text-sm p-4">Нет переписок</p>
          )}
          {conversations.map(({ user, last_message, unread_count }) => (
            <button key={user.id} onClick={() => openChat(user)}
              className={`w-full flex items-center gap-3 p-4 hover:bg-accent transition-colors text-left
                ${activeUser?.id === user.id ? "bg-accent" : ""}`}>
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={avatarUrl(user.avatar_url)} />
                <AvatarFallback>{(user.display_name || user.username)?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <p className="font-medium text-sm truncate">{user.display_name || user.username}</p>
                    {user.badge_verified && <VerifiedBadge size={13} />}
                  </div>
                  {last_message?.created_at && (
                    <span className="text-xs text-muted-foreground shrink-0">{fmtTime(last_message.created_at)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs text-muted-foreground truncate">
                    {last_message?.is_mine && (
                      last_message.is_read
                        ? <CheckCheck size={11} className="inline mr-0.5 text-primary" />
                        : <Check size={11} className="inline mr-0.5" />
                    )}
                    {last_message?.is_mine ? "Вы: " : ""}{last_message?.text}
                  </p>
                  {unread_count > 0 && (
                    <span className="shrink-0 bg-primary text-primary-foreground text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
                      {unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Область чата ── */}
      <div className={`flex-1 flex-col min-w-0 ${activeUser ? "flex" : "hidden md:flex"}`}>
        {!activeUser ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <SquarePen size={40} strokeWidth={1.5} />
            <p className="text-sm">Выберите переписку или начните новую</p>
          </div>
        ) : (
          <>
            {/* Шапка */}
            <div className="p-4 border-b flex items-center gap-3 shrink-0">
              <button
                onClick={() => setActiveUser(null)}
                className="md:hidden text-muted-foreground hover:text-foreground shrink-0"
              >
                <ArrowLeft size={20} />
              </button>
              <button onClick={() => router.push(`/profile/${activeUser.username}`)}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left flex-1 min-w-0">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={avatarUrl(activeUser.avatar_url)} />
                  <AvatarFallback>{(activeUser.display_name || activeUser.username)?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium leading-tight truncate">{activeUser.display_name || activeUser.username}</p>
                    {activeUser.badge_verified && <VerifiedBadge size={15} />}
                  </div>
                  <p className="text-xs text-muted-foreground">@{activeUser.username}</p>
                </div>
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("initiate-call", { detail: { user: activeUser } }))}
                className="text-muted-foreground hover:text-primary transition-colors shrink-0 p-1.5 rounded-full hover:bg-accent"
                title="Позвонить"
              >
                <Phone size={18} />
              </button>
            </div>

            {/* Сообщения */}
            <div className="flex-1 overflow-auto p-4 space-y-0.5">
              {messages.map((msg, i) => {
                const prev = messages[i - 1]
                const showDate = !prev || fmtDate(msg.created_at) !== fmtDate(prev.created_at)
                const nextMsg = messages[i + 1]
                const isLast = !nextMsg || nextMsg.is_mine !== msg.is_mine ||
                  fmtTime(nextMsg.created_at) !== fmtTime(msg.created_at)

                return (
                  <div key={msg.id ?? i}>
                    {showDate && (
                      <div className="flex items-center gap-3 my-4">
                        <div className="flex-1 border-t" />
                        <span className="text-xs text-muted-foreground">{fmtDate(msg.created_at)}</span>
                        <div className="flex-1 border-t" />
                      </div>
                    )}

                    <div
                      ref={el => { if (msg.id) messageRefs.current[msg.id] = el }}
                      className={`flex items-end gap-1 group py-0.5 transition-all ${msg.is_mine ? "flex-row-reverse" : ""}`}
                    >
                      {/* Кнопка ответа */}
                      <button
                        onClick={() => setReplyTo(msg)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 text-muted-foreground hover:text-foreground"
                        title="Ответить"
                      >
                        <CornerUpLeft size={14} />
                      </button>

                      {/* Пузырь */}
                      <div className={`flex flex-col max-w-[80%] md:max-w-xs ${msg.is_mine ? "items-end" : "items-start"}`}>
                        {/* Цитата (ответ на сообщение) */}
                        {msg.reply_to && (
                          <div
                            className={`mb-1 px-3 py-1.5 rounded-xl text-xs border-l-2 border-primary/60 cursor-pointer max-w-full
                              ${msg.is_mine ? "bg-primary/20" : "bg-muted/60"}`}
                            onClick={() => scrollToMessage(msg.reply_to.id)}
                          >
                            <p className="font-semibold text-primary mb-0.5">
                              {msg.reply_to.is_mine ? "Вы" : (activeUser.display_name || activeUser.username)}
                            </p>
                            <p className="truncate text-muted-foreground">{replyPreviewText(msg.reply_to)}</p>
                          </div>
                        )}

                        {/* Контент */}
                        {msg.file_type === "image" ? (
                          <a href={`${BASE}${msg.file_url}`} target="_blank" rel="noreferrer"
                            className={`block rounded-2xl overflow-hidden border-2 ${msg.is_mine ? "border-primary" : "border-muted"}`}>
                            <img src={`${BASE}${msg.file_url}`} alt={msg.file_name || ""} className="max-w-xs max-h-60 object-cover" />
                          </a>
                        ) : msg.file_type === "audio" ? (
                          <div className={`px-3 py-2.5 rounded-2xl ${msg.is_mine
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-accent border border-primary/20 rounded-bl-sm"}`}>
                            <AudioPlayer url={`${BASE}${msg.file_url}`} isMine={msg.is_mine} />
                          </div>
                        ) : msg.file_type === "file" ? (
                          <a href={`${BASE}${msg.file_url}`} download={msg.file_name} target="_blank" rel="noreferrer"
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl ${fontClass}
                              ${msg.is_mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            <FileIcon size={16} className="shrink-0" />
                            <span className="truncate max-w-[180px]">{msg.file_name}</span>
                          </a>
                        ) : (
                          <div className={`px-4 py-2 rounded-2xl ${fontClass}
                            ${msg.is_mine
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted rounded-bl-sm"}`}>
                            {msg.text}
                          </div>
                        )}

                        {/* Время + статус */}
                        {isLast && (
                          <div className={`flex items-center gap-1 mt-1 ${msg.is_mine ? "self-end pr-0.5" : "self-start pl-0.5"}`}>
                            <span className="text-xs text-muted-foreground">{fmtTime(msg.created_at)}</span>
                            {msg.is_mine && (
                              msg.is_read
                                ? <CheckCheck size={14} className="text-primary shrink-0" />
                                : <Check size={14} className="text-muted-foreground shrink-0" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Плашка ответа */}
            {replyTo && (
              <div className="px-4 py-2 border-t bg-muted/30 flex items-center gap-3">
                <CornerUpLeft size={15} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-primary">
                    {replyTo.is_mine ? "Вы" : (activeUser.display_name || activeUser.username)}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{replyPreviewText(replyTo)}</p>
                </div>
                <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={15} />
                </button>
              </div>
            )}

            {/* Ввод / запись */}
            {isRecording ? (
              <div className="p-4 border-t flex gap-3 items-center shrink-0">
                <div className="flex-1 flex items-center gap-3 bg-muted rounded-full px-4 py-2.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span className="text-sm font-medium tabular-nums">{fmtDuration(recordingTime)}</span>
                  <span className="text-xs text-muted-foreground">Запись голосового...</span>
                </div>
                <Button variant="ghost" size="icon" onClick={() => stopRecording(false)} title="Отмена">
                  <X size={18} />
                </Button>
                <Button size="icon" onClick={() => stopRecording(true)} title="Отправить">
                  <Send size={16} />
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSend} className="p-4 border-t flex gap-2 shrink-0 items-center">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                  <Paperclip size={18} />
                </button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect}
                  accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar" />
                <Input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Написать сообщение..."
                  className="flex-1"
                />
                {text.trim() ? (
                  <Button type="submit" size="icon"><Send size={16} /></Button>
                ) : (
                  <button
                    type="button"
                    onMouseDown={startRecording}
                    onMouseUp={() => stopRecording(true)}
                    onTouchStart={startRecording}
                    onTouchEnd={() => stopRecording(true)}
                    className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                    title="Удерживайте для записи"
                  >
                    <Mic size={20} />
                  </button>
                )}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function ChatsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <ChatsPage />
    </Suspense>
  )
}

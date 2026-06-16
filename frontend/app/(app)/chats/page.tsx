"use client"

import { Suspense, useEffect, useRef, useState, useCallback } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, createWebSocket, BASE_URL } from "@/lib/api"
import { Send, SquarePen, X, Search, Paperclip, FileIcon } from "lucide-react"
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
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 520
    gain.gain.setValueAtTime(0.2, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.25)
  } catch {}
}

function getFontClass(): string {
  try {
    const s = JSON.parse(localStorage.getItem("app_settings") || "{}")
    return s.fontSize === "small" ? "text-xs" : s.fontSize === "large" ? "text-base" : "text-sm"
  } catch { return "text-sm" }
}

function ChatsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [conversations, setConversations] = useState<any[]>([])
  const [activeUser, setActiveUser] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [text, setText] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [fontClass, setFontClass] = useState("text-sm")
  const bottomRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeUserRef = useRef<any>(null)

  useEffect(() => {
    setFontClass(getFontClass())
  }, [])

  useEffect(() => {
    activeUserRef.current = activeUser
  }, [activeUser])

  // Открыть чат по ?user=username из URL (например после кнопки "Написать")
  useEffect(() => {
    const targetUsername = searchParams.get("user")
    if (!targetUsername) return
    api.searchUsers(targetUsername).then(results => {
      const found = results.find((u: any) => u.username === targetUsername)
      if (found) openChat(found)
    })
  }, [searchParams]) // eslint-disable-line

  useEffect(() => {
    api.getConversations().then(setConversations)
    const token = localStorage.getItem("token")
    if (token) {
      wsRef.current = createWebSocket(token, (msg) => {
        setMessages(prev => [...prev, msg])

        // Уведомления
        const settings = JSON.parse(localStorage.getItem("app_settings") || "{}")
        if (settings.sound !== false) playBeep()
        if (settings.notifications && document.visibilityState === "hidden") {
          const fromUser = activeUserRef.current
          new Notification(fromUser?.display_name || fromUser?.username || "Новое сообщение", {
            body: msg.text || "📎 Файл",
          })
        }
      })
    }
    return () => wsRef.current?.close()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

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
    setMessages(await api.getMessages(user.id))
  }

  async function handleSend(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!text.trim() || !activeUser) return
    const msg = await api.sendMessage(activeUser.id, text.trim())
    setMessages(prev => [...prev, msg])
    setText("")
    updateConversation(activeUser, msg)
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeUser) return
    e.target.value = ""
    const msg = await api.sendFile(activeUser.id, file)
    setMessages(prev => [...prev, msg])
    updateConversation(activeUser, msg)
  }

  function updateConversation(user: any, msg: any) {
    const preview = msg.text || ("📎 " + (msg.file_name || "Файл"))
    setConversations(prev => {
      const exists = prev.find(c => c.user.id === user.id)
      if (exists) return prev.map(c =>
        c.user.id === user.id
          ? { ...c, last_message: { text: preview, created_at: msg.created_at, is_mine: true } }
          : c
      )
      return [{ user, last_message: { text: preview, created_at: msg.created_at, is_mine: true } }, ...prev]
    })
  }

  return (
    <div className="flex h-full">
      {/* Список чатов */}
      <div className="w-72 border-r flex flex-col shrink-0">
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
          {conversations.map(({ user, last_message }) => (
            <button key={user.id} onClick={() => openChat(user)}
              className={`w-full flex items-center gap-3 p-4 hover:bg-accent transition-colors text-left
                ${activeUser?.id === user.id ? "bg-accent" : ""}`}>
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={avatarUrl(user.avatar_url)} />
                <AvatarFallback>{(user.display_name || user.username)?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{user.display_name || user.username}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {last_message?.is_mine ? "Вы: " : ""}{last_message?.text}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Область чата */}
      <div className="flex-1 flex flex-col min-w-0">
        {!activeUser ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <SquarePen size={40} strokeWidth={1.5} />
            <p className="text-sm">Выберите переписку или начните новую</p>
          </div>
        ) : (
          <>
            <div className="p-4 border-b flex items-center gap-3 shrink-0">
              <button
                onClick={() => router.push(`/profile/${activeUser.username}`)}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity text-left"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={avatarUrl(activeUser.avatar_url)} />
                  <AvatarFallback>{(activeUser.display_name || activeUser.username)?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium leading-tight">{activeUser.display_name || activeUser.username}</p>
                  <p className="text-xs text-muted-foreground">@{activeUser.username}</p>
                </div>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-2">
              {messages.map((msg, i) => (
                <div key={msg.id ?? i} className={`flex ${msg.is_mine ? "justify-end" : "justify-start"}`}>
                  {msg.file_type === "image" ? (
                    <a href={`${BASE}${msg.file_url}`} target="_blank" rel="noreferrer"
                      className={`block max-w-xs rounded-2xl overflow-hidden border-2 ${msg.is_mine ? "border-primary" : "border-muted"}`}>
                      <img src={`${BASE}${msg.file_url}`} alt={msg.file_name} className="max-w-xs max-h-60 object-cover" />
                    </a>
                  ) : msg.file_type === "file" ? (
                    <a href={`${BASE}${msg.file_url}`} download={msg.file_name} target="_blank" rel="noreferrer"
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl ${fontClass}
                        ${msg.is_mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      <FileIcon size={16} className="shrink-0" />
                      <span className="truncate max-w-[180px]">{msg.file_name}</span>
                    </a>
                  ) : (
                    <div className={`max-w-xs px-4 py-2 rounded-2xl ${fontClass}
                      ${msg.is_mine
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted rounded-bl-sm"
                      }`}>
                      {msg.text}
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSend} className="p-4 border-t flex gap-2 shrink-0 items-center">
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <Paperclip size={18} />
              </button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect}
                accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar" />
              <Input value={text} onChange={e => setText(e.target.value)}
                placeholder="Написать сообщение..." className="flex-1" />
              <Button type="submit" size="icon" disabled={!text.trim()}>
                <Send size={16} />
              </Button>
            </form>
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

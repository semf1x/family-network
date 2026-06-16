"use client"

import { useEffect, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { api, BASE_URL } from "@/lib/api"
import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react"

function fmtDuration(s: number) {
  if (!s) return ""
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
  if (d.toDateString() === yesterday.toDateString()) return "Вчера"
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
}

export default function CallsPage() {
  const [calls, setCalls] = useState<any[]>([])
  const [me, setMe] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem("user")
    if (stored) setMe(JSON.parse(stored))
    api.getCallHistory()
      .then(setCalls)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Загрузка...</div>
  }

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <Phone size={52} strokeWidth={1.2} />
        <p className="font-medium">Нет истории звонков</p>
        <p className="text-sm text-center max-w-xs">
          Позвоните кому-нибудь через кнопку в профиле пользователя
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto py-6">
      <h2 className="text-2xl font-bold px-6 mb-4">Звонки</h2>

      <div className="space-y-px">
        {calls.map(call => {
          const isOutgoing = call.caller_id === me?.id
          const other = isOutgoing ? call.receiver : call.caller
          const isMissed = call.status === "missed" && !isOutgoing
          const isDeclined = call.status === "declined"

          let StatusIcon = isOutgoing ? PhoneOutgoing : PhoneIncoming
          if (isMissed) StatusIcon = PhoneMissed

          let statusLabel = isOutgoing ? "Исходящий" : "Входящий"
          if (isMissed) statusLabel = "Пропущенный"
          if (isDeclined) statusLabel = isOutgoing ? "Не отвечен" : "Отклонённый"

          const accent = isMissed || (isDeclined && !isOutgoing) ? "text-red-500" : "text-muted-foreground"

          return (
            <button
              key={call.id}
              onClick={() => {
                if (other) window.dispatchEvent(new CustomEvent("initiate-call", { detail: { user: other } }))
              }}
              className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-accent transition-colors text-left"
            >
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarImage src={other?.avatar_url ? `${BASE_URL}${other.avatar_url}` : undefined} />
                <AvatarFallback>
                  {(other?.display_name || other?.username)?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{other?.display_name || other?.username}</p>
                <div className={`flex items-center gap-1.5 text-sm ${accent}`}>
                  <StatusIcon size={13} />
                  <span>
                    {statusLabel}
                    {call.duration > 0 && ` · ${fmtDuration(call.duration)}`}
                  </span>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">{fmtDate(call.created_at)}</span>
                <Phone size={16} className="text-primary opacity-60" />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

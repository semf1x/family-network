"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { api, BASE_URL } from "@/lib/api"
import { Phone, MessageCircle, ArrowLeft, BadgeCheck } from "lucide-react"

const BASE = BASE_URL

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [error, setError] = useState("")
  const [me, setMe] = useState<any>(null)

  useEffect(() => {
    const stored = localStorage.getItem("user")
    if (stored) setMe(JSON.parse(stored))

    api.getPublicProfile(username)
      .then(setProfile)
      .catch(() => setError("Пользователь не найден"))
  }, [username])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
        <p>{error}</p>
        <Button variant="outline" onClick={() => router.back()}>Назад</Button>
      </div>
    )
  }

  if (!profile) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Загрузка...</div>
  }

  const isMe = me?.username === profile.username

  return (
    <div className="max-w-xl mx-auto p-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6 text-sm"
      >
        <ArrowLeft size={16} /> Назад
      </button>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-5">
            <Avatar className="h-20 w-20 shrink-0">
              <AvatarImage src={profile.avatar_url ? `${BASE}${profile.avatar_url}` : undefined} />
              <AvatarFallback className="text-2xl">
                {(profile.display_name || profile.username)?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {profile.display_name && (
                  <h2 className="text-xl font-bold">{profile.display_name}</h2>
                )}
                {profile.is_verified && (
                  <BadgeCheck size={18} className="text-primary shrink-0" />
                )}
              </div>
              <p className="text-muted-foreground text-sm mt-0.5">@{profile.username}</p>

              {profile.bio && (
                <p className="mt-3 text-sm">{profile.bio}</p>
              )}

              {profile.phone && (
                <div className="flex items-center gap-2 mt-3 text-sm">
                  <Phone size={14} className="text-muted-foreground shrink-0" />
                  <span>{profile.phone}</span>
                  {profile.phone_verified && (
                    <BadgeCheck size={14} className="text-green-500" />
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-3">
                В сети с {new Date(profile.created_at).toLocaleDateString("ru-RU")}
              </p>
            </div>
          </div>

          {!isMe && (
            <div className="mt-5 pt-5 border-t flex gap-2">
              <Button
                className="flex-1"
                onClick={() => router.push(`/chats?user=${profile.username}`)}
              >
                <MessageCircle size={16} className="mr-2" />
                Написать
              </Button>
            </div>
          )}

          {isMe && (
            <div className="mt-5 pt-5 border-t">
              <Button variant="outline" className="w-full" onClick={() => router.push("/settings")}>
                Редактировать профиль
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

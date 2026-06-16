"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { api, BASE_URL } from "@/lib/api"
import { Phone, MessageCircle, ArrowLeft, BadgeCheck } from "lucide-react"
import VerifiedBadge from "@/components/VerifiedBadge"

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
}

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [error, setError] = useState("")
  const [me, setMe] = useState<any>(null)

  useEffect(() => {
    const stored = localStorage.getItem("user")
    if (stored) setMe(JSON.parse(stored))

    api.getPublicProfile(username)
      .then(p => {
        setProfile(p)
        return api.getUserPosts(p.id)
      })
      .then(setPosts)
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
    <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-8">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm self-start"
      >
        <ArrowLeft size={16} /> Назад
      </button>

      {/* ── Карточка профиля ── */}
      <Card>
        <CardContent className="py-8 px-8">
          <div className="flex items-start gap-6">
            <Avatar className="h-20 w-20 shrink-0">
              <AvatarImage src={profile.avatar_url ? `${BASE_URL}${profile.avatar_url}` : undefined} />
              <AvatarFallback className="text-2xl">
                {(profile.display_name || profile.username)?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">{profile.display_name || profile.username}</h2>
                {profile.badge_verified && <VerifiedBadge size={20} />}
              </div>
              <p className="text-muted-foreground text-sm mt-0.5">@{profile.username}</p>

              {profile.bio && <p className="mt-3 text-sm">{profile.bio}</p>}

              {profile.phone && (
                <div className="flex items-center gap-2 mt-3 text-sm">
                  <Phone size={14} className="text-muted-foreground shrink-0" />
                  <span>{profile.phone}</span>
                  {profile.phone_verified && <BadgeCheck size={14} className="text-green-500" />}
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-3">
                В сети с {new Date(profile.created_at).toLocaleDateString("ru-RU")}
              </p>
            </div>
          </div>

          {!isMe && (
            <div className="mt-6 pt-5 border-t flex gap-2">
              <Button className="flex-1" onClick={() => router.push(`/chats?user=${profile.username}`)}>
                <MessageCircle size={16} className="mr-2" />
                Написать
              </Button>
              <Button
                variant="outline"
                size="icon"
                title="Позвонить"
                onClick={() => window.dispatchEvent(new CustomEvent("initiate-call", { detail: { user: profile } }))}
              >
                <Phone size={16} />
              </Button>
            </div>
          )}

          {isMe && (
            <div className="mt-6 pt-5 border-t">
              <Button variant="outline" className="w-full" onClick={() => router.push("/settings")}>
                Редактировать профиль
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Новости пользователя ── */}
      {posts.length > 0 && (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-semibold">Новости</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {posts.map(post => (
              <div key={post.id} className="rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
                {post.image_url && (
                  <img
                    src={`${BASE_URL}${post.image_url}`}
                    alt={post.title || ""}
                    className="w-full h-44 object-cover"
                  />
                )}
                <div className="p-4 flex flex-col gap-1.5">
                  {post.title && <h4 className="font-semibold leading-snug line-clamp-2">{post.title}</h4>}
                  {post.text && <p className="text-sm text-muted-foreground line-clamp-3">{post.text}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{fmtDate(post.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

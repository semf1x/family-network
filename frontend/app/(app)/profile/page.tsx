"use client"

import { useEffect, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { api, BASE_URL } from "@/lib/api"

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    api.me().then((data) => {
      setUser(data)
      localStorage.setItem("user", JSON.stringify(data))
    })
  }, [])

  if (!user) return <div className="flex items-center justify-center h-full text-muted-foreground">Загрузка...</div>

  return (
    <div className="max-w-xl mx-auto p-8">
      <h2 className="text-2xl font-bold mb-6">Мой профиль</h2>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarImage src={user.avatar_url ? `${BASE_URL}${user.avatar_url}` : undefined} />
              <AvatarFallback className="text-2xl">{(user.display_name || user.username)?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              {user.display_name && (
                <h3 className="text-xl font-semibold">{user.display_name}</h3>
              )}
              <p className={`text-muted-foreground ${user.display_name ? "text-sm" : "text-xl font-semibold text-foreground"}`}>
                @{user.username}
              </p>
              <p className="text-muted-foreground text-sm mt-1">{user.email}</p>
              {user.bio && <p className="mt-2 text-sm">{user.bio}</p>}
              <p className="text-xs text-muted-foreground mt-2">
                В сети с {new Date(user.created_at).toLocaleDateString("ru-RU")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

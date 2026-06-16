"use client"

import { useEffect, useRef, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api, BASE_URL } from "@/lib/api"
import { Plus, X, ImageIcon, Trash2 } from "lucide-react"
import VerifiedBadge from "@/components/VerifiedBadge"

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
}

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState("")
  const [text, setText] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.me().then((data) => {
      setUser(data)
      localStorage.setItem("user", JSON.stringify(data))
      api.getUserPosts(data.id).then(setPosts)
    })
  }, [])

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setImage(f)
    setPreview(URL.createObjectURL(f))
  }

  function resetForm() {
    setTitle(""); setText(""); setImage(null); setPreview(null); setShowForm(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function submitPost(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() && !text.trim() && !image) return
    setSaving(true)
    try {
      const post = await api.createPost({ title: title.trim(), text: text.trim(), image })
      setPosts(prev => [post, ...prev])
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  async function deletePost(id: number) {
    await api.deletePost(id)
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  if (!user) return <div className="flex items-center justify-center h-full text-muted-foreground">Загрузка...</div>

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-8">

      {/* ── Карточка профиля ── */}
      <Card>
        <CardContent className="py-8 px-8">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20 shrink-0">
              <AvatarImage src={user.avatar_url ? `${BASE_URL}${user.avatar_url}` : undefined} />
              <AvatarFallback className="text-2xl">
                {(user.display_name || user.username)?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{user.display_name || user.username}</h2>
                {user.badge_verified && <VerifiedBadge size={20} />}
              </div>
              {user.display_name && (
                <p className="text-sm text-muted-foreground">@{user.username}</p>
              )}
              <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
              {user.bio && <p className="mt-2 text-sm">{user.bio}</p>}
              <p className="text-xs text-muted-foreground mt-2">
                В сети с {new Date(user.created_at).toLocaleDateString("ru-RU")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Новости ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Новости</h3>
          <Button size="sm" variant="outline" onClick={() => setShowForm(s => !s)}>
            {showForm ? <X size={14} className="mr-1.5" /> : <Plus size={14} className="mr-1.5" />}
            {showForm ? "Отмена" : "Добавить"}
          </Button>
        </div>

        {/* Форма создания */}
        {showForm && (
          <Card className="border-dashed">
            <CardContent className="pt-5 pb-5">
              <form onSubmit={submitPost} className="flex flex-col gap-3">
                <Input
                  placeholder="Заголовок новости"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="font-medium"
                />
                <textarea
                  placeholder="Текст новости..."
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />

                {/* Превью фото */}
                {preview && (
                  <div className="relative">
                    <img src={preview} alt="" className="w-full max-h-48 object-cover rounded-lg" />
                    <button
                      type="button"
                      onClick={() => { setImage(null); setPreview(null) }}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ImageIcon size={16} /> Добавить фото
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
                  <div className="flex-1" />
                  <Button type="submit" size="sm" disabled={saving || (!title.trim() && !text.trim() && !image)}>
                    {saving ? "Публикация..." : "Опубликовать"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Плитка новостей */}
        {posts.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground text-center py-6">
            Нет новостей. Поделитесь чем-нибудь с семьёй!
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {posts.map(post => (
            <div key={post.id} className="group relative rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow">
              {post.image_url && (
                <img
                  src={`${BASE_URL}${post.image_url}`}
                  alt={post.title || ""}
                  className="w-full h-44 object-cover"
                />
              )}
              <div className="p-4 flex flex-col gap-1.5">
                {post.title && (
                  <h4 className="font-semibold leading-snug line-clamp-2">{post.title}</h4>
                )}
                {post.text && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{post.text}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{fmtDate(post.created_at)}</p>
              </div>

              {/* Кнопка удаления */}
              <button
                onClick={() => deletePost(post.id)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white rounded-full p-1.5 hover:bg-red-500/80"
                title="Удалить"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

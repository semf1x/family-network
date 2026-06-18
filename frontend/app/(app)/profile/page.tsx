"use client"

import { useEffect, useRef, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { api, BASE_URL } from "@/lib/api"
import { Plus, X, ImageIcon, Trash2, Loader2 } from "lucide-react"
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
    }).catch(() => {
      const stored = localStorage.getItem("user")
      if (stored) {
        const data = JSON.parse(stored)
        setUser(data)
        api.getUserPosts(data.id).then(setPosts).catch(() => {})
      }
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

  if (!user) return (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
      <Loader2 size={18} className="animate-spin mr-2" /> Загрузка...
    </div>
  )

  const canPost = title.trim() || text.trim() || image

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-5">

      {/* ── Карточка профиля ── */}
      <div className="rounded-2xl bg-card border border-white/5 p-5 md:p-6">
        <div className="flex items-center gap-4 md:gap-6">
          <Avatar className="h-16 w-16 md:h-20 md:w-20 shrink-0">
            <AvatarImage src={user.avatar_url ? `${BASE_URL}${user.avatar_url}` : undefined} />
            <AvatarFallback className="text-xl md:text-2xl bg-secondary">
              {(user.display_name || user.username)?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg md:text-xl font-bold">{user.display_name || user.username}</h2>
              {user.badge_verified && <VerifiedBadge size={18} />}
            </div>
            {user.display_name && (
              <p className="text-sm text-muted-foreground">@{user.username}</p>
            )}
            {user.bio && <p className="mt-2 text-sm">{user.bio}</p>}
            <p className="text-xs text-muted-foreground mt-1.5">
              В Kofka с {new Date(user.created_at).toLocaleDateString("ru-RU")}
            </p>
          </div>
        </div>
      </div>

      {/* ── Новости ── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-base font-semibold">Новости</h3>
          <button
            onClick={() => { setShowForm(s => !s); if (showForm) resetForm() }}
            className={`flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-medium transition-all
              ${showForm
                ? "bg-secondary border border-white/8 text-muted-foreground"
                : "bg-gradient-brand-short text-white"
              }`}
          >
            {showForm ? <X size={14} /> : <Plus size={14} />}
            {showForm ? "Отмена" : "Добавить"}
          </button>
        </div>

        {/* Форма создания */}
        {showForm && (
          <div className="rounded-2xl bg-card border border-white/5 p-4 md:p-5">
            <form onSubmit={submitPost} className="flex flex-col gap-3">
              {/* Заголовок */}
              <div className="auth-input-wrap rounded-2xl px-4 py-3">
                <input
                  placeholder="Заголовок новости"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-transparent outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground/50"
                />
              </div>

              {/* Текст */}
              <div className="auth-input-wrap rounded-2xl px-4 py-3">
                <textarea
                  placeholder="Текст новости..."
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={3}
                  className="w-full bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground/50 resize-none"
                />
              </div>

              {/* Превью фото */}
              {preview && (
                <div className="relative rounded-xl overflow-hidden">
                  <img src={preview} alt="" className="w-full max-h-48 object-cover" />
                  <button
                    type="button"
                    onClick={() => { setImage(null); setPreview(null) }}
                    className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* Действия */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-secondary border border-white/8
                             text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ImageIcon size={14} /> Фото
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />

                <button
                  type="submit"
                  disabled={saving || !canPost}
                  className="ml-auto h-9 px-5 rounded-xl bg-gradient-brand-short text-white text-sm font-medium
                             hover:opacity-90 active:scale-[0.98] transition-all
                             disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : "Опубликовать"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Пустое состояние */}
        {posts.length === 0 && !showForm && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="h-14 w-14 rounded-2xl bg-secondary border border-white/5 flex items-center justify-center">
              <Plus size={22} className="text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">Нет новостей</p>
              <p className="text-sm text-muted-foreground mt-0.5">Поделитесь чем-нибудь с семьёй</p>
            </div>
          </div>
        )}

        {/* Сетка постов */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {posts.map(post => (
            <div key={post.id} className="group relative rounded-2xl bg-card border border-white/5 overflow-hidden hover:border-white/10 transition-colors">
              {post.image_url && (
                <img
                  src={`${BASE_URL}${post.image_url}`}
                  alt={post.title || ""}
                  className="w-full h-44 object-cover"
                />
              )}
              <div className="p-4 flex flex-col gap-1.5">
                {post.title && (
                  <h4 className="font-semibold leading-snug line-clamp-2 text-sm">{post.title}</h4>
                )}
                {post.text && (
                  <p className="text-sm text-muted-foreground line-clamp-3">{post.text}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{fmtDate(post.created_at)}</p>
              </div>

              <button
                onClick={() => deletePost(post.id)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
                           bg-black/60 text-white rounded-full p-1.5 hover:bg-red-500/80"
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

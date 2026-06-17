"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import Link from "next/link"
import { MessageCircle, User, Settings, LogOut, Sun, Moon, Phone } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { connectWS } from "@/lib/ws"
import { api, BASE_URL } from "@/lib/api"
import CallModal from "@/components/CallModal"

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

const nav = [
  { href: "/chats", icon: MessageCircle, label: "Чаты" },
  { href: "/calls", icon: Phone, label: "Звонки" },
  { href: "/profile", icon: User, label: "Профиль" },
  { href: "/settings", icon: Settings, label: "Настройки" },
]

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-4 h-4" />
  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="text-muted-foreground hover:text-foreground transition-colors"
      title="Сменить тему"
    >
      {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [totalUnread, setTotalUnread] = useState(0)

  useEffect(() => {
    const stored = localStorage.getItem("user")
    if (!stored) {
      router.push("/auth")
      return
    }
    setUser(JSON.parse(stored))

    const token = localStorage.getItem("token")
    if (token) connectWS(token)

    const onUpdate = (e: Event) => setUser((e as CustomEvent).detail)
    window.addEventListener("user-updated", onUpdate)

    const onUnread = (e: Event) => setTotalUnread((e as CustomEvent).detail)
    window.addEventListener("unread-count", onUnread)

    return () => {
      window.removeEventListener("user-updated", onUpdate)
      window.removeEventListener("unread-count", onUnread)
    }
  }, [router])

  // Fetch unread count on navigation
  useEffect(() => {
    if (!localStorage.getItem("token")) return
    api.getConversations().then((convs: any[]) => {
      setTotalUnread(convs.filter(c => c.unread_count > 0).length)
    }).catch(() => {})
  }, [pathname])

  // Register service worker and subscribe to push
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return
    const token = localStorage.getItem("token")
    if (!token) return

    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      if (Notification.permission === "default") await Notification.requestPermission()
      if (Notification.permission !== "granted") return

      try {
        const res = await fetch(`${BASE_URL}/push/vapid-public-key`)
        const { public_key } = await res.json()
        if (!public_key) return

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(public_key),
        })

        const p256dh = btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")!)))
        const auth = btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")!)))

        await fetch(`${BASE_URL}/push/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh, auth } }),
        })
      } catch {}
    }).catch(() => {})
  }, [])

  function logout() {
    localStorage.clear()
    router.push("/auth")
  }

  if (!user) return null

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

  return (
    <div className="flex h-screen bg-background">

      {/* Sidebar — десктоп */}
      <aside className="hidden md:flex w-64 border-r flex-col shrink-0">
        <div className="p-6 border-b">
          <h1 className="text-xl font-bold">Семейная сеть</h1>
          <p className="text-xs text-muted-foreground mt-1">Только для своих</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {nav.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${pathname === href
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
            >
              <span className="relative">
                <Icon size={18} />
                {href === "/chats" && totalUnread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                    {totalUnread > 9 ? "9+" : totalUnread}
                  </span>
                )}
              </span>
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.avatar_url ? `${apiUrl}${user.avatar_url}` : undefined} />
            <AvatarFallback>{(user.display_name || user.username)?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.display_name || user.username}</p>
            <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
          </div>
          <ThemeToggle />
          <button onClick={logout} className="text-muted-foreground hover:text-destructive transition-colors">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Мобильный хедер */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b">
          <h1 className="text-lg font-bold">Семейная сеть</h1>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Avatar className="h-8 w-8">
              <AvatarImage src={user.avatar_url ? `${apiUrl}${user.avatar_url}` : undefined} />
              <AvatarFallback>{user.username?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <button onClick={logout} className="text-muted-foreground hover:text-destructive transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          {children}
        </main>

        {/* Нижняя навигация — мобилка */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-background flex">
          {nav.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors
                ${pathname === href
                  ? "text-primary"
                  : "text-muted-foreground"
                }`}
            >
              <span className="relative">
                <Icon size={20} />
                {href === "/chats" && totalUnread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                    {totalUnread > 9 ? "9+" : totalUnread}
                  </span>
                )}
              </span>
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Глобальная модалка звонков */}
      <CallModal />
    </div>
  )
}

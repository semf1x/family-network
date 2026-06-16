"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import Link from "next/link"
import { MessageCircle, User, Settings, LogOut, Sun, Moon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

const nav = [
  { href: "/chats", icon: MessageCircle, label: "Чаты" },
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

  useEffect(() => {
    const stored = localStorage.getItem("user")
    if (!stored) {
      router.push("/auth")
      return
    }
    setUser(JSON.parse(stored))

    const onUpdate = (e: Event) => setUser((e as CustomEvent).detail)
    window.addEventListener("user-updated", onUpdate)
    return () => window.removeEventListener("user-updated", onUpdate)
  }, [router])

  function logout() {
    localStorage.clear()
    router.push("/auth")
  }

  if (!user) return null

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
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={user.avatar_url ? `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${user.avatar_url}` : undefined} />
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
              <AvatarImage src={user.avatar_url ? `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${user.avatar_url}` : undefined} />
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
              <Icon size={20} />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  )
}

import { BASE_URL } from "./api"

type Handler = (data: any) => void

const handlers = new Set<Handler>()
let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

export function connectWS(token: string) {
  if (socket?.readyState === WebSocket.OPEN) return
  if (reconnectTimer) clearTimeout(reconnectTimer)

  const wsBase = BASE_URL.replace(/^http/, "ws")
  socket = new WebSocket(`${wsBase}/messages/ws?token=${token}`)

  socket.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      handlers.forEach(h => { try { h(data) } catch {} })
    } catch {}
  }

  socket.onclose = () => {
    socket = null
    reconnectTimer = setTimeout(() => {
      if (typeof window !== "undefined") {
        const t = localStorage.getItem("token")
        if (t) connectWS(t)
      }
    }, 3000)
  }
}

export function disconnectWS() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  socket?.close()
  socket = null
}

export function addWSHandler(fn: Handler): () => void {
  handlers.add(fn)
  return () => { handlers.delete(fn) }
}

export function sendWS(data: object): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data))
  }
}

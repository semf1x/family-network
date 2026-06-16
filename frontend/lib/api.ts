export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") : null
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail || "Request failed")
  }
  return res.json()
}

async function upload(path: string, file: File) {
  const token = getToken()
  const form = new FormData()
  form.append("file", file)
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Unknown error" }))
    throw new Error(error.detail || "Upload failed")
  }
  return res.json()
}

export const api = {
  register: (data: { username: string; display_name?: string; email: string; password: string }) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(data) }),

  verifyEmail: (data: { email: string; code: string }) =>
    request("/auth/verify", { method: "POST", body: JSON.stringify(data) }),

  resendCode: (email: string) =>
    request("/auth/resend-code", { method: "POST", body: JSON.stringify({ email }) }),

  login: (data: { email: string; password: string }) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(data) }),

  me: () => request("/users/me"),

  updateProfile: (data: { username?: string; display_name?: string; bio?: string }) =>
    request("/users/me", { method: "PATCH", body: JSON.stringify(data) }),

  checkUsername: (username: string) =>
    request(`/users/check-username?username=${encodeURIComponent(username)}`),

  uploadAvatar: (file: File) => upload("/users/me/avatar", file),

  changePassword: (data: { old_password: string; new_password: string }) =>
    request("/users/me/password", { method: "POST", body: JSON.stringify(data) }),

  requestPhoneVerify: (phone: string) =>
    request("/users/me/phone", { method: "POST", body: JSON.stringify({ phone }) }),

  verifyPhone: (code: string) =>
    request("/users/me/phone/verify", { method: "POST", body: JSON.stringify({ code }) }),

  updatePrivacy: (data: { show_phone?: boolean }) =>
    request("/users/me/privacy", { method: "PATCH", body: JSON.stringify(data) }),

  getPublicProfile: (username: string) =>
    request(`/users/profile/${encodeURIComponent(username)}`),

  getUser: (id: number) => request(`/users/${id}`),

  searchUsers: (q: string) => request(`/users/search?q=${encodeURIComponent(q)}`),

  getConversations: () => request("/messages/conversations"),

  getMessages: (userId: number) => request(`/messages/${userId}`),

  sendMessage: (userId: number, text: string) =>
    request(`/messages/${userId}`, { method: "POST", body: JSON.stringify({ text }) }),

  sendFile: (userId: number, file: File) => upload(`/messages/${userId}/file`, file),
}

export function createWebSocket(token: string, onMessage: (data: any) => void) {
  const wsUrl = BASE_URL.replace(/^http/, "ws")
  const ws = new WebSocket(`${wsUrl}/messages/ws?token=${token}`)
  ws.onmessage = (e) => onMessage(JSON.parse(e.data))
  return ws
}

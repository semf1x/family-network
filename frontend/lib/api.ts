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
  register: (data: { username: string; display_name?: string; phone: string; password: string }) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(data) }),

  verifyPhone: (data: { phone: string; code: string }) =>
    request("/auth/verify", { method: "POST", body: JSON.stringify(data) }),

  resendCode: (phone: string) =>
    request("/auth/resend-code", { method: "POST", body: JSON.stringify({ phone }) }),

  login: (data: { phone: string; password: string }) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(data) }),

  checkUsernamePublic: (username: string) =>
    request(`/auth/check-username?username=${encodeURIComponent(username)}`),

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

  sendMessage: (userId: number, text: string, replyToId?: number) =>
    request(`/messages/${userId}`, { method: "POST", body: JSON.stringify({ text, reply_to_id: replyToId }) }),

  sendFile: async (userId: number, file: File, replyToId?: number) => {
    const token = getToken()
    const form = new FormData()
    form.append("file", file)
    if (replyToId) form.append("reply_to_id", String(replyToId))
    const res = await fetch(`${BASE_URL}/messages/${userId}/file`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: "Unknown error" }))
      throw new Error(error.detail || "Upload failed")
    }
    return res.json()
  },

  markAsRead: (userId: number) =>
    request(`/messages/${userId}/read`, { method: "POST" }),

  getCallHistory: () => request("/calls/"),

  logCall: (data: { receiver_id: number; status: string; duration?: number }) =>
    request("/calls/", { method: "POST", body: JSON.stringify(data) }),

  getUserPosts: (userId: number) => request(`/posts/user/${userId}`),

  createPost: async (data: { title?: string; text?: string; image?: File | null }) => {
    const token = getToken()
    const form = new FormData()
    if (data.title) form.append("title", data.title)
    if (data.text) form.append("text", data.text)
    if (data.image) form.append("image", data.image)
    const res = await fetch(`${BASE_URL}/posts/`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: "Unknown error" }))
      throw new Error(error.detail || "Failed")
    }
    return res.json()
  },

  deletePost: (postId: number) =>
    request(`/posts/${postId}`, { method: "DELETE" }),

  toggleBadge: (userId: number) =>
    request(`/users/${userId}/badge`, { method: "POST" }),
}

export function createWebSocket(token: string, onMessage: (data: any) => void) {
  const wsUrl = BASE_URL.replace(/^http/, "ws")
  const ws = new WebSocket(`${wsUrl}/messages/ws?token=${token}`)
  ws.onmessage = (e) => onMessage(JSON.parse(e.data))
  return ws
}

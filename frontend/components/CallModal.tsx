"use client"

import { useEffect, useRef, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Phone, PhoneOff, Mic, MicOff } from "lucide-react"
import { addWSHandler, sendWS } from "@/lib/ws"
import { api, BASE_URL } from "@/lib/api"

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
]

type CallState = "incoming" | "calling" | "active" | null

export default function CallModal() {
  const [state, setState] = useState<CallState>(null)
  const [remote, setRemote] = useState<any>(null)   // собеседник
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingIce = useRef<RTCIceCandidateInit[]>([])
  const remoteIdRef = useRef<number | null>(null)
  const callStartRef = useRef<number>(0)

  useEffect(() => {
    const audio = new Audio()
    audio.autoplay = true
    remoteAudioRef.current = audio

    const removeWS = addWSHandler(async (data) => {
      if (data.type === "call_offer") {
        setRemote(data.caller_info)
        remoteIdRef.current = data.from_user_id
        setState("incoming")
        const pc = buildPC(data.from_user_id)
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        pendingIce.current.forEach(c => pc.addIceCandidate(c))
        pendingIce.current = []
      }

      if (data.type === "call_answer") {
        const pc = pcRef.current
        if (!pc) return
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        pendingIce.current.forEach(c => pc.addIceCandidate(c))
        pendingIce.current = []
        setState("active")
        startTimer()
      }

      if (data.type === "call_ice") {
        const pc = pcRef.current
        if (pc?.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        } else {
          pendingIce.current.push(data.candidate)
        }
      }

      if (data.type === "call_end" || data.type === "call_decline") {
        endCall(false)
      }
    })

    const handleInitiate = (e: Event) => {
      const { user } = (e as CustomEvent).detail
      initiateCall(user)
    }
    window.addEventListener("initiate-call", handleInitiate)

    return () => {
      removeWS()
      window.removeEventListener("initiate-call", handleInitiate)
    }
  }, [])

  function buildPC(targetId: number): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pcRef.current = pc

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendWS({ type: "call_ice", to_user_id: targetId, candidate: e.candidate.toJSON() })
      }
    }

    pc.ontrack = (e) => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = e.streams[0]
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setState("active")
        startTimer()
      }
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        endCall(false)
      }
    }

    return pc
  }

  async function initiateCall(user: any) {
    setRemote(user)
    remoteIdRef.current = user.id
    setState("calling")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      const pc = buildPC(user.id)
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const me = JSON.parse(localStorage.getItem("user") || "{}")
      sendWS({ type: "call_offer", to_user_id: user.id, sdp: offer, caller_info: me })
    } catch {
      cleanup()
    }
  }

  async function acceptCall() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      const pc = pcRef.current!
      stream.getTracks().forEach(t => pc.addTrack(t, stream))

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendWS({ type: "call_answer", to_user_id: remoteIdRef.current, sdp: answer })
      setState("active")
      startTimer()
    } catch {
      declineCall()
    }
  }

  function declineCall() {
    sendWS({ type: "call_decline", to_user_id: remoteIdRef.current })
    logMissed()
    cleanup()
  }

  function endCall(notify = true) {
    if (notify) sendWS({ type: "call_end", to_user_id: remoteIdRef.current })
    logCompleted()
    cleanup()
  }

  function logCompleted() {
    const id = remoteIdRef.current
    if (!id || !callStartRef.current) return
    const dur = Math.round((Date.now() - callStartRef.current) / 1000)
    const me = JSON.parse(localStorage.getItem("user") || "{}")
    const isCallerMe = remote && me.id !== remote.id
    if (isCallerMe) {
      api.logCall({ receiver_id: id, status: "completed", duration: dur }).catch(() => {})
    }
  }

  function logMissed() {
    const id = remoteIdRef.current
    if (!id) return
    api.logCall({ receiver_id: id, status: "declined", duration: 0 }).catch(() => {})
  }

  function startTimer() {
    callStartRef.current = Date.now()
    setElapsed(0)
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
  }

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current)
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current = null
    pendingIce.current = []
    callStartRef.current = 0
    setState(null)
    setRemote(null)
    setElapsed(0)
    setMuted(false)
    remoteIdRef.current = null
  }

  function toggleMute() {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = muted })
    setMuted(m => !m)
  }

  if (!state) return null

  const avatarSrc = remote?.avatar_url ? `${BASE_URL}${remote.avatar_url}` : undefined
  const name = remote?.display_name || remote?.username || "Неизвестный"
  const initials = name[0]?.toUpperCase()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border rounded-3xl p-8 flex flex-col items-center gap-6 w-80 shadow-2xl">
        {/* Пульсирующий аватар при входящем */}
        <div className={state === "incoming" ? "animate-pulse" : ""}>
          <Avatar className="h-24 w-24">
            <AvatarImage src={avatarSrc} />
            <AvatarFallback className="text-3xl">{initials}</AvatarFallback>
          </Avatar>
        </div>

        <div className="text-center">
          <h2 className="text-xl font-bold">{name}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {state === "incoming" && "Входящий вызов..."}
            {state === "calling" && "Вызов..."}
            {state === "active" && fmtElapsed(elapsed)}
          </p>
        </div>

        {/* Кнопки управления */}
        {state === "incoming" && (
          <div className="flex gap-8 mt-2">
            <CallBtn color="red" onClick={declineCall} icon={<PhoneOff size={24} />} label="Отклонить" />
            <CallBtn color="green" onClick={acceptCall} icon={<Phone size={24} />} label="Принять" />
          </div>
        )}

        {state === "calling" && (
          <div className="flex gap-8 mt-2">
            <CallBtn color="red" onClick={() => endCall(true)} icon={<PhoneOff size={24} />} label="Отмена" />
          </div>
        )}

        {state === "active" && (
          <div className="flex gap-6 mt-2">
            <CallBtn
              color={muted ? "gray" : "muted"}
              onClick={toggleMute}
              icon={muted ? <MicOff size={20} /> : <Mic size={20} />}
              label={muted ? "Включить" : "Выключить"}
            />
            <CallBtn color="red" onClick={() => endCall(true)} icon={<PhoneOff size={24} />} label="Завершить" />
          </div>
        )}
      </div>
    </div>
  )
}

function CallBtn({
  color, onClick, icon, label,
}: {
  color: "red" | "green" | "gray" | "muted"
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  const bg = {
    red: "bg-red-500 hover:bg-red-600 text-white",
    green: "bg-green-500 hover:bg-green-600 text-white",
    gray: "bg-muted text-foreground hover:bg-muted/70",
    muted: "bg-muted/50 text-muted-foreground hover:bg-muted",
  }[color]

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${bg}`}
      >
        {icon}
      </button>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

function fmtElapsed(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

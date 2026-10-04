const STORAGE_KEY = "painel-visitor-id"
const HEARTBEAT_MS = 15000

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_ELECTION_API_BASE_URL
  if (configured) return configured
  if (typeof window !== "undefined") return window.location.origin
  return ""
}

function createVisitorId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "")
  }
  return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

function getVisitorId() {
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY)
    if (existing && /^[a-zA-Z0-9_-]+$/.test(existing) && existing.length <= 64) {
      return existing
    }
    const id = createVisitorId()
    sessionStorage.setItem(STORAGE_KEY, id)
    return id
  } catch {
    return createVisitorId()
  }
}

export class PresenceService {
  private timer: number | null = null
  private visitorId = ""

  async heartbeat(): Promise<number | null> {
    const baseUrl = resolveApiBaseUrl()
    if (!baseUrl) return null

    if (!this.visitorId) this.visitorId = getVisitorId()

    try {
      const response = await fetch(new URL("/presence", baseUrl), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: this.visitorId }),
        cache: "no-store",
        keepalive: true,
      })
      if (!response.ok) return null
      const payload = (await response.json()) as { online?: number }
      return typeof payload.online === "number" ? payload.online : null
    } catch {
      return null
    }
  }

  start(onUpdate: (online: number | null) => void) {
    this.stop()
    const beat = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return
      }
      onUpdate(await this.heartbeat())
    }
    void beat()
    this.timer = window.setInterval(() => void beat(), HEARTBEAT_MS)

    const onVisible = () => {
      if (document.visibilityState === "visible") void beat()
    }
    document.addEventListener("visibilitychange", onVisible)
    this.onVisible = onVisible
  }

  private onVisible: (() => void) | null = null

  stop() {
    if (this.timer !== null) {
      window.clearInterval(this.timer)
      this.timer = null
    }
    if (this.onVisible) {
      document.removeEventListener("visibilitychange", this.onVisible)
      this.onVisible = null
    }
  }
}

export const presenceService = new PresenceService()

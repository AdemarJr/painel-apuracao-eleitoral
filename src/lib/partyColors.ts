const STORAGE_KEY = "painel-party-colors-v1"

/** Cores institucionais / reconhecíveis para partidos brasileiros. */
export const DEFAULT_PARTY_COLORS: Record<string, string> = {
  PT: "#E30613",
  PL: "#0B3D91",
  PSDB: "#0066B3",
  MDB: "#009B3A",
  PSD: "#F7941D",
  PP: "#0033A0",
  REPUBLICANOS: "#E87722",
  PDT: "#C8102E",
  PSOL: "#FFCC00",
  NOVO: "#FF6600",
  UNIÃO: "#0055A4",
  UNIAO: "#0055A4",
  PSB: "#FF6600",
  PODEMOS: "#7B2D8E",
  AVANTE: "#F7A800",
  SOLIDARIEDADE: "#E87722",
  CIDADANIA: "#EE3124",
  PV: "#009A44",
  PCdoB: "#DA251D",
  PCDOB: "#DA251D",
  PRD: "#1E4D8C",
  DC: "#1A3A6D",
  AGIR: "#6B2D5C",
  MOBILIZA: "#2E86AB",
  UP: "#9B1B30",
  PCB: "#B71C1C",
  PCO: "#8B0000",
  PSTU: "#C62828",
  PRTB: "#1565C0",
  PMN: "#EF6C00",
}

/** Paleta distinta para partidos sem cor cadastrada. */
const AUTO_PALETTE = [
  "#2563EB",
  "#DC2626",
  "#16A34A",
  "#9333EA",
  "#EA580C",
  "#0891B2",
  "#CA8A04",
  "#DB2777",
  "#4F46E5",
  "#059669",
  "#B45309",
  "#7C3AED",
  "#0284C7",
  "#BE123C",
  "#65A30D",
  "#C026D3",
]

function normalizePartyKey(party: string) {
  return String(party || "—")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function hashString(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function loadStoredPartyColors(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export function saveStoredPartyColors(colors: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
  } catch {
    /* ignore quota / private mode */
  }
}

export function resolvePartyColor(
  party: string,
  custom: Record<string, string>,
  used: Set<string> = new Set(),
): string {
  const key = normalizePartyKey(party)
  if (custom[key]) return custom[key]
  if (custom[party]) return custom[party]
  if (DEFAULT_PARTY_COLORS[key]) return DEFAULT_PARTY_COLORS[key]

  const start = hashString(key) % AUTO_PALETTE.length
  for (let i = 0; i < AUTO_PALETTE.length; i += 1) {
    const color = AUTO_PALETTE[(start + i) % AUTO_PALETTE.length]
    if (![...used].some((c) => c.toLowerCase() === color.toLowerCase())) {
      return color
    }
  }
  return AUTO_PALETTE[start]
}

export function buildPartyColorMap(
  parties: string[],
  custom: Record<string, string>,
): Record<string, string> {
  const map: Record<string, string> = {}
  const used = new Set<string>()
  for (const party of parties) {
    const key = normalizePartyKey(party)
    const color = resolvePartyColor(party, custom, used)
    map[key] = color
    map[party] = color
    used.add(color.toLowerCase())
  }
  return map
}

export function partyKey(party: string) {
  return normalizePartyKey(party)
}

/** Mistura cor com branco (t=0 clara, t=1 saturada). */
export function applyColorIntensity(hex: string, t: number): string {
  const raw = hex.replace("#", "")
  if (raw.length !== 6) return hex
  const intensity = Math.min(1, Math.max(0.18, t))
  const r = Number.parseInt(raw.slice(0, 2), 16)
  const g = Number.parseInt(raw.slice(2, 4), 16)
  const b = Number.parseInt(raw.slice(4, 6), 16)
  const mix = (channel: number) =>
    Math.round(255 + (channel - 255) * intensity)
  return `#${[mix(r), mix(g), mix(b)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`
}

export function candidateColor(
  candidateId: string,
  party: string,
  partyColors: Record<string, string>,
): string {
  const base =
    partyColors[partyKey(party)] ||
    partyColors[party] ||
    resolvePartyColor(party, {})
  // Variação leve por candidato mantendo identidade do partido.
  const shift = (hashString(candidateId) % 24) - 12
  return shiftHex(base, shift)
}

function shiftHex(hex: string, amount: number): string {
  const raw = hex.replace("#", "")
  if (raw.length !== 6) return hex
  const clamp = (n: number) => Math.min(255, Math.max(0, n))
  const r = clamp(Number.parseInt(raw.slice(0, 2), 16) + amount)
  const g = clamp(Number.parseInt(raw.slice(2, 4), 16) + amount * 0.4)
  const b = clamp(Number.parseInt(raw.slice(4, 6), 16) - amount * 0.3)
  return `#${[r, g, b]
    .map((n) => Math.round(n).toString(16).padStart(2, "0"))
    .join("")}`
}

export const COUNTED_SCALE = ["#E8EEF5", "#C5D4E8", "#8FA8C9", "#5A7AA3", "#2F4F78"]

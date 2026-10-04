/**
 * Proxy TSE → ElectionDataset (tempo real)
 *
 * Padrão: ambiente OFICIAL das Eleições 2026
 *   https://resultados.tse.jus.br/oficial/ele2026/...
 *
 * Simulado (homologação):
 *   TSE_BASE_URL=https://resultados-sim.tse.jus.br/simulado/simulado2026 \
 *   TSE_MODE=sim pnpm proxy
 *
 * Uso:
 *   pnpm proxy
 *
 * Frontend (Vite faz proxy de /results → :8787):
 *   pnpm dev
 */

import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { URL } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? "0.0.0.0"
const DIST_DIR =
  process.env.DIST_DIR ?? path.resolve(__dirname, "../dist")
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS ?? 5000)
const STATUS_OVERRIDE = process.env.ELECTION_STATUS ?? ""
const TSE_MODE = (process.env.TSE_MODE ?? "oficial").toLowerCase()
const TSE_BASE =
  process.env.TSE_BASE_URL ??
  (TSE_MODE === "sim"
    ? "https://resultados-sim.tse.jus.br/simulado/simulado2026"
    : "https://resultados.tse.jus.br/oficial")
const USER_AGENT =
  process.env.TSE_USER_AGENT ??
  "PainelApuracaoEleitoral/1.0 (+divulgacao-resultados; uso informativo)"

/**
 * Códigos oficiais 1º turno 04/10/2026 (ele-c.json do TSE).
 * Simulado usa 21270/21272 quando TSE_MODE=sim.
 */
const OFFICE_CONFIG =
  TSE_MODE === "sim"
    ? {
        Presidente: {
          election: "21270",
          election2: "21271",
          cargo: "0001",
          majoritarian: true,
        },
        Governador: {
          election: "21272",
          election2: "21273",
          cargo: "0003",
          majoritarian: true,
        },
        Senador: {
          election: "21272",
          election2: "21273",
          cargo: "0005",
          majoritarian: true,
        },
        "Deputado Federal": {
          election: "21272",
          election2: "21273",
          cargo: "0006",
          majoritarian: false,
          limit: 40,
        },
        "Deputado Estadual": {
          election: "21272",
          election2: "21273",
          cargo: "0007",
          majoritarian: false,
          limit: 40,
        },
      }
    : {
        Presidente: {
          election: "6257",
          election2: "6258",
          cargo: "0001",
          majoritarian: true,
        },
        Governador: {
          election: "6259",
          election2: "6260",
          cargo: "0003",
          majoritarian: true,
        },
        Senador: {
          election: "6259",
          election2: "6260",
          cargo: "0005",
          majoritarian: true,
        },
        "Deputado Federal": {
          election: "6259",
          election2: "6260",
          cargo: "0006",
          majoritarian: false,
          limit: 40,
        },
        "Deputado Estadual": {
          election: "6259",
          election2: "6260",
          cargo: "0007",
          majoritarian: false,
          limit: 40,
        },
      }

const STATES = [
  ["AC", "Acre"],
  ["AL", "Alagoas"],
  ["AP", "Amapá"],
  ["AM", "Amazonas"],
  ["BA", "Bahia"],
  ["CE", "Ceará"],
  ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"],
  ["GO", "Goiás"],
  ["MA", "Maranhão"],
  ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"],
  ["PA", "Pará"],
  ["PB", "Paraíba"],
  ["PR", "Paraná"],
  ["PE", "Pernambuco"],
  ["PI", "Piauí"],
  ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"],
  ["RR", "Roraima"],
  ["SC", "Santa Catarina"],
  ["SP", "São Paulo"],
  ["SE", "Sergipe"],
  ["TO", "Tocantins"],
]

const cache = new Map()

/** Visitantes ativos (aba aberta) — Map<visitorId, lastSeenMs> */
const PRESENCE_TTL_MS = Number(process.env.PRESENCE_TTL_MS ?? 45000)
const presence = new Map()

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Cache-Control, Content-Type",
  })
  res.end(status === 204 ? "" : JSON.stringify(payload))
}

function prunePresence(now = Date.now()) {
  for (const [id, at] of presence) {
    if (now - at > PRESENCE_TTL_MS) presence.delete(id)
  }
}

function normalizeVisitorId(value) {
  if (typeof value !== "string") return null
  const id = value.trim()
  if (!id || id.length > 64) return null
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null
  return id
}

function touchPresence(rawId) {
  const now = Date.now()
  prunePresence(now)
  const id = normalizeVisitorId(rawId)
  if (id) presence.set(id, now)
  return {
    online: presence.size,
    ttlMs: PRESENCE_TTL_MS,
  }
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return {}
  }
}

function padElection(code) {
  return String(code).padStart(6, "0")
}

function parsePtNumber(value) {
  if (typeof value === "number") return value
  if (value == null || value === "") return 0
  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".")
  const number = Number(normalized)
  return Number.isFinite(number) ? number : 0
}

function toIsoFromTse(date, time) {
  if (!date || !time) return new Date().toISOString()
  const [day, month, year] = date.split("/")
  if (!day || !month || !year) return new Date().toISOString()
  return new Date(`${year}-${month}-${day}T${time}-03:00`).toISOString()
}

function unifiedUrl(election, cargo, uf) {
  const code = padElection(election)
  return `${TSE_BASE}/ele2026/${election}/dados/${uf}/${uf}-c${cargo}-e${code}-u.json`
}

function acompanhamentoUrl(election, uf) {
  const code = padElection(election)
  return `${TSE_BASE}/ele2026/${election}/dados/${uf}/${uf}-e${code}-ab.json`
}

function candidatePhotoUrl(election, stateId, sqcand) {
  if (!sqcand) return undefined
  const uf = String(stateId || "BR").toLowerCase()
  return `${TSE_BASE}/ele2026/${election}/fotos/${uf}/${sqcand}.jpeg`
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`TSE ${response.status} em ${url}`)
  }
  return response.json()
}

function resolveCandidateStateId(payload, fallbackUf) {
  if (fallbackUf) return String(fallbackUf).toUpperCase()
  if (payload?.tpabr === "br" || payload?.cdabr === "br") return "BR"
  return String(payload?.cdabr || "BR").toUpperCase()
}

function extractCandidates(payload, office, limit, fallbackUf, election) {
  const cargo = payload.carg?.[0]
  if (!cargo) return []
  const stateId = resolveCandidateStateId(payload, fallbackUf)

  const collected = []
  for (const agr of cargo.agr ?? []) {
    for (const party of agr.par ?? []) {
      for (const candidate of party.cand ?? []) {
        const votes = parsePtNumber(candidate.vap)
        const percentage = parsePtNumber(candidate.pvapn || candidate.pvap)
        const id = String(
          candidate.sqcand || `${stateId}-${party.sg}-${candidate.n}`,
        )
        collected.push({
          id,
          name: candidate.nm || candidate.nmu || `Candidato ${candidate.n}`,
          ballotName: candidate.nmu || candidate.nm || `Candidato ${candidate.n}`,
          party: party.sg || agr.nm || "—",
          number: parsePtNumber(candidate.n),
          office,
          stateId,
          photoUrl: candidatePhotoUrl(election, stateId, candidate.sqcand),
          votes,
          percentage,
          sequence: parsePtNumber(candidate.seq) || Number.MAX_SAFE_INTEGER,
          destiny: candidate.dvt || "",
        })
      }
    }
  }

  collected.sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes
    return a.sequence - b.sequence
  })

  return typeof limit === "number" ? collected.slice(0, limit) : collected
}

function resolveStatus(payload) {
  if (["scheduled", "counting", "completed"].includes(STATUS_OVERRIDE)) {
    return STATUS_OVERRIDE
  }
  const progress = parsePtNumber(payload?.s?.pstn || payload?.s?.pst)
  // and: f=finalizado, p=parcial/em apuração, a=andamento (legado)
  if (payload?.and === "f" || payload?.tf === "s") return "completed"
  if (
    progress > 0 ||
    payload?.and === "a" ||
    payload?.and === "p" ||
    payload?.dv === "s"
  ) {
    return "counting"
  }
  return "scheduled"
}

function buildStateResult(
  ufCode,
  ufName,
  payload,
  office,
  candidates,
  national,
  election,
  limit,
) {
  const updatedAt = toIsoFromTse(payload.dt || payload.dg, payload.ht || payload.hg)
  // Proporcional (deputados): mesmo recorte do catálogo (top N por UF).
  // Majoritário estadual: chapa completa da UF.
  const local = extractCandidates(payload, office, limit, ufCode, election)
  const localById = new Map(local.map((item) => [item.id, item]))

  const sectionsTotal = parsePtNumber(payload.s?.ts)
  const sectionsCounted = parsePtNumber(payload.s?.st)
  const percentageCounted = Math.min(
    100,
    Math.max(0, parsePtNumber(payload.s?.pstn || payload.s?.pst)),
  )
  const electorate = parsePtNumber(payload.e?.te)
  const totalVotes = parsePtNumber(payload.v?.tv || payload.e?.c)
  const validVotes = parsePtNumber(payload.v?.vv || payload.v?.vvc)
  const blankVotes = parsePtNumber(payload.v?.vb)
  const nullVotes = parsePtNumber(payload.v?.tvn || payload.v?.vn)
  const abstentions = parsePtNumber(payload.e?.a)

  // Cargo nacional: mesma chapa em todas as UFs.
  // Cargo estadual: só os candidatos da própria UF (nomes reais daquele estado).
  const voteSource = national
    ? candidates.map((candidate) => {
        const match = localById.get(candidate.id)
        return {
          candidateId: candidate.id,
          stateId: ufCode,
          officeId: office,
          votes: match?.votes ?? 0,
          percentage: match?.percentage ?? 0,
          updatedAt,
        }
      })
    : local.map((item) => ({
        candidateId: item.id,
        stateId: ufCode,
        officeId: office,
        votes: item.votes,
        percentage: Math.min(100, Math.max(0, item.percentage)),
        updatedAt,
      }))

  const leaderId = [...voteSource].sort((a, b) => b.votes - a.votes)[0]
    ?.candidateId
  const leader =
    candidates.find((candidate) => candidate.id === leaderId) ||
    (leaderId
      ? {
          id: leaderId,
          name: localById.get(leaderId)?.name || leaderId,
          ballotName: localById.get(leaderId)?.ballotName || leaderId,
          party: localById.get(leaderId)?.party || "—",
          number: localById.get(leaderId)?.number || 0,
          office,
          stateId: ufCode,
          photoUrl: localById.get(leaderId)?.photoUrl,
        }
      : undefined)

  return {
    state: {
      id: ufCode,
      abbreviation: ufCode,
      name: ufName,
      electorate,
    },
    status: {
      stateId: ufCode,
      sectionsTotal,
      sectionsCounted,
      percentageCounted,
      totalVotes,
      validVotes,
      blankVotes,
      nullVotes,
      abstentions,
    },
    votes: voteSource,
    leader,
  }
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length)
  let index = 0

  async function run() {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await worker(items[current], current)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  )
  return results
}

async function buildDataset(office, round) {
  const config = OFFICE_CONFIG[office]
  if (!config) throw new Error(`Cargo não mapeado: ${office}`)

  const election =
    Number(round) === 2 && config.election2
      ? config.election2
      : config.election

  const statePayloads = await mapPool(STATES, 8, async ([uf]) => {
    const url = unifiedUrl(election, config.cargo, uf.toLowerCase())
    try {
      return { uf, payload: await fetchJson(url) }
    } catch (error) {
      return { uf, error: error.message }
    }
  })

  let national = null
  try {
    national = await fetchJson(unifiedUrl(election, config.cargo, "br"))
  } catch {
    national =
      statePayloads.find((item) => item.payload)?.payload ?? null
  }
  if (!national) {
    throw new Error("TSE não retornou dados unificados para este cargo")
  }

  const status = resolveStatus(national)
  const updatedAt = toIsoFromTse(
    national.dt || national.dg,
    national.ht || national.hg,
  )

  const isNationalOffice = office === "Presidente"
  const candidateMap = new Map()
  const seedLists = isNationalOffice
    ? [extractCandidates(national, office, config.limit, "BR", election)]
    : statePayloads
        .filter((item) => item.payload)
        .map((item) =>
          extractCandidates(
            item.payload,
            office,
            config.limit,
            item.uf,
            election,
          ),
        )

  for (const list of seedLists) {
    for (const item of list) {
      const previous = candidateMap.get(item.id)
      if (!previous || item.votes > previous.votes) candidateMap.set(item.id, item)
    }
  }

  const ranked = [...candidateMap.values()].sort((a, b) => {
    if (a.stateId !== b.stateId) return String(a.stateId).localeCompare(String(b.stateId))
    return b.votes - a.votes
  })
  const candidates = ranked.map(
    ({ votes, percentage, sequence, destiny, ...candidate }) => candidate,
  )

  const states = STATES.map(([uf, name], index) => {
    const entry = statePayloads[index]
    if (!entry?.payload) return null
    return buildStateResult(
      uf,
      name,
      entry.payload,
      office,
      candidates,
      isNationalOffice,
      election,
      config.limit,
    )
  }).filter(Boolean)

  if (!states.length) {
    throw new Error("Nenhum estado retornou dados do TSE para este cargo")
  }

  return {
    election: {
      id: `tse-sim-${election}`,
      year: 2026,
      round: Number(round) === 2 ? 2 : 1,
      status,
    },
    office,
    source: `TSE ${TSE_MODE === "sim" ? "simulado" : "oficial"} · ele ${election} · cargo ${config.cargo}`,
    updatedAt,
    candidates,
    states,
    snapshots: [],
  }
}

async function getResults(office, round) {
  const key = `${office}:${round}:${STATUS_OVERRIDE || "auto"}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.payload

  const payload = await buildDataset(office, round)
  cache.set(key, { at: Date.now(), payload })
  return payload
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
}

function serveStatic(req, res, pathname) {
  if (!fs.existsSync(DIST_DIR)) return false
  const safePath = pathname === "/" ? "/index.html" : pathname
  const filePath = path.normalize(path.join(DIST_DIR, safePath))
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403).end("Forbidden")
    return true
  }
  let finalPath = filePath
  if (!fs.existsSync(finalPath) || fs.statSync(finalPath).isDirectory()) {
    finalPath = path.join(DIST_DIR, "index.html")
  }
  if (!fs.existsSync(finalPath)) return false
  const ext = path.extname(finalPath)
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control":
      ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  })
  fs.createReadStream(finalPath).pipe(res)
  return true
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {})
    return
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`)

  if (req.method === "GET" && url.pathname === "/health") {
    prunePresence()
    sendJson(res, 200, {
      ok: true,
      mode: TSE_MODE,
      base: TSE_BASE,
      statusOverride: STATUS_OVERRIDE || null,
      offices: Object.keys(OFFICE_CONFIG),
      servesUi: fs.existsSync(DIST_DIR),
      online: presence.size,
      sampleAcompanhamento: acompanhamentoUrl(
        OFFICE_CONFIG.Presidente.election,
        "ac",
      ),
      sampleUnificado: unifiedUrl(
        OFFICE_CONFIG.Presidente.election,
        OFFICE_CONFIG.Presidente.cargo,
        "br",
      ),
    })
    return
  }

  if (
    (req.method === "GET" || req.method === "POST") &&
    url.pathname === "/presence"
  ) {
    let visitorId = url.searchParams.get("id")
    if (req.method === "POST") {
      const body = await readJsonBody(req)
      visitorId = body?.id ?? visitorId
    }
    sendJson(res, 200, touchPresence(visitorId))
    return
  }

  if (req.method === "GET" && url.pathname === "/results") {
    const office = url.searchParams.get("office") ?? "Presidente"
    if (!OFFICE_CONFIG[office]) {
      sendJson(res, 400, {
        error: `Cargo não suportado: ${office}`,
        supported: Object.keys(OFFICE_CONFIG),
      })
      return
    }

    const round = url.searchParams.get("round") ?? "1"
    try {
      const payload = await getResults(office, round)
      sendJson(res, 200, payload)
    } catch (error) {
      sendJson(res, 502, {
        error:
          error instanceof Error ? error.message : "Falha ao consultar o TSE",
      })
    }
    return
  }

  if (req.method === "GET" && serveStatic(req, res, url.pathname)) return

  sendJson(res, 404, {
    error:
      "Rota não encontrada. Use /, GET /results?office=Presidente&round=1 ou POST /presence",
  })
})

server.listen(PORT, HOST, () => {
  const sampleElection = OFFICE_CONFIG.Presidente.election
  console.log(`Painel/Proxy TSE em http://${HOST}:${PORT}`)
  console.log(`Modo: ${TSE_MODE}`)
  console.log(`Base: ${TSE_BASE}`)
  console.log(`UI: ${fs.existsSync(DIST_DIR) ? DIST_DIR : "não encontrada"}`)
  console.log(`Cache: ${CACHE_TTL_MS}ms`)
  console.log(
    STATUS_OVERRIDE
      ? `Status forçado: ${STATUS_OVERRIDE}`
      : "Status derivado do campo and/tf/pst do TSE",
  )
  console.log(`Exemplo U:  ${unifiedUrl(sampleElection, "0001", "br")}`)
})

import type {
  Candidate,
  ElectionDataset,
  Office,
  State,
  StateResult,
  VoteSnapshot,
} from "../types/election"

// Sem env: usa o mesmo origin (/results) — Vite em DEV e Docker/Easypanel em PROD.
function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_ELECTION_API_BASE_URL
  if (configured) return configured
  if (typeof window !== "undefined") return window.location.origin
  return ""
}

export const API_BASE_URL = resolveApiBaseUrl()
const API_RESULTS_PATH =
  import.meta.env.VITE_ELECTION_RESULTS_PATH ?? "/results"
const REQUEST_TIMEOUT_MS = 45000
const MAX_REQUEST_ATTEMPTS = 3

const states: State[] = [
  ["AC", "Acre", 590000],
  ["AL", "Alagoas", 2325000],
  ["AP", "Amapá", 550000],
  ["AM", "Amazonas", 2647000],
  ["BA", "Bahia", 11290000],
  ["CE", "Ceará", 6820000],
  ["DF", "Distrito Federal", 2200000],
  ["ES", "Espírito Santo", 2921000],
  ["GO", "Goiás", 4870000],
  ["MA", "Maranhão", 5042000],
  ["MT", "Mato Grosso", 2469000],
  ["MS", "Mato Grosso do Sul", 1996000],
  ["MG", "Minas Gerais", 16300000],
  ["PA", "Pará", 6082000],
  ["PB", "Paraíba", 3091000],
  ["PR", "Paraná", 8475000],
  ["PE", "Pernambuco", 7018000],
  ["PI", "Piauí", 2573000],
  ["RJ", "Rio de Janeiro", 12820000],
  ["RN", "Rio Grande do Norte", 2555000],
  ["RS", "Rio Grande do Sul", 8593000],
  ["RO", "Rondônia", 1226000],
  ["RR", "Roraima", 367000],
  ["SC", "Santa Catarina", 5489000],
  ["SP", "São Paulo", 34210000],
  ["SE", "Sergipe", 1671000],
  ["TO", "Tocantins", 1094000],
].map(([abbreviation, name, electorate]) => ({
  id: abbreviation as string,
  abbreviation: abbreviation as string,
  name: name as string,
  electorate: electorate as number,
}))

const candidateSets: Record<Office, Array<[string, string, number]>> = {
  Presidente: [
    ["Candidatura Horizonte", "PHA", 18],
    ["Candidatura Futuro", "PFB", 24],
    ["Candidatura União", "PUN", 31],
    ["Candidatura Cívica", "PCV", 42],
  ],
  Governador: [
    ["Chapa Estadual A", "PEA", 16],
    ["Chapa Estadual B", "PEB", 27],
    ["Chapa Estadual C", "PEC", 35],
    ["Chapa Estadual D", "PED", 48],
  ],
  Senador: [
    ["Candidatura ao Senado A", "PSA", 15],
    ["Candidatura ao Senado B", "PSB", 22],
    ["Candidatura ao Senado C", "PSC", 33],
    ["Candidatura ao Senado D", "PSD", 44],
  ],
  "Deputado Federal": [
    ["Candidatura Federal A", "PFA", 1510],
    ["Candidatura Federal B", "PFB", 2240],
    ["Candidatura Federal C", "PFC", 3370],
    ["Candidatura Federal D", "PFD", 4480],
  ],
  "Deputado Estadual": [
    ["Candidatura Estadual A", "PEA", 15123],
    ["Candidatura Estadual B", "PEB", 22456],
    ["Candidatura Estadual C", "PEC", 33789],
    ["Candidatura Estadual D", "PED", 44101],
  ],
}

const NATIONAL_OFFICES: Office[] = ["Presidente"]

function isNationalOffice(office: Office) {
  return NATIONAL_OFFICES.includes(office)
}

function createCandidates(office: Office, stateId: string): Candidate[] {
  return candidateSets[office].map(([name, party, number], index) => {
    const scopedName = isNationalOffice(office)
      ? name
      : `${name} (${stateId})`
    return {
      id: `${office}-${stateId}-${index}`,
      name: scopedName,
      ballotName: scopedName,
      party,
      number,
      office,
      stateId: isNationalOffice(office) ? "BR" : stateId,
    }
  })
}

function seedFor(value: string) {
  return [...value].reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  )
}

function createDemoDataset(office: Office): ElectionDataset {
  const updatedAt = new Date().toISOString()
  const national = isNationalOffice(office)
  const candidateMap = new Map<string, Candidate>()
  const results: StateResult[] = states.map((state, stateIndex) => {
    const seed = seedFor(`${state.id}-${office}`)
    const percentageCounted = Math.min(99.86, 61 + (seed % 3800) / 100)
    const sectionsTotal = Math.round(state.electorate / 360)
    const sectionsCounted = Math.round(
      (sectionsTotal * percentageCounted) / 100,
    )
    const totalVotes = Math.round(
      (state.electorate * 0.79 * percentageCounted) / 100,
    )
    const blankVotes = Math.round(totalVotes * (0.018 + (seed % 9) / 1000))
    const nullVotes = Math.round(totalVotes * (0.031 + (seed % 13) / 1000))
    const validVotes = totalVotes - blankVotes - nullVotes
    const localCandidates = createCandidates(
      office,
      national ? "BR" : state.id,
    )
    for (const candidate of localCandidates) {
      candidateMap.set(candidate.id, candidate)
    }
    const weights = [
      42 + (seed % 8),
      31 + ((seed * 3) % 7),
      17 + (stateIndex % 4),
      10,
    ]
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0)
    const votes = localCandidates.map((candidate, index) => ({
      candidateId: candidate.id,
      stateId: state.id,
      officeId: office,
      votes: Math.round((validVotes * weights[index]) / weightTotal),
      percentage: (weights[index] / weightTotal) * 100,
      updatedAt,
    }))
    return {
      state,
      status: {
        stateId: state.id,
        sectionsTotal,
        sectionsCounted,
        percentageCounted,
        totalVotes,
        validVotes,
        blankVotes,
        nullVotes,
        abstentions: Math.max(0, state.electorate - totalVotes),
      },
      votes,
      leader: localCandidates[0],
    }
  })

  const snapshots: VoteSnapshot[] = [8, 19, 34, 51, 67, 79, 88].map(
    (value, index) => ({
      timestamp: new Date(
        Date.now() - (6 - index) * 30 * 60 * 1000,
      ).toISOString(),
      percentageCounted: value + (seedFor(office) % 5),
    }),
  )

  return {
    election: {
      id: "demo-current",
      year: new Date().getFullYear(),
      round: 1,
      status: "counting",
    },
    office,
    source: "Ambiente de demonstração — preparado para TSE/TRE",
    updatedAt,
    isDemo: true,
    candidates: [...candidateMap.values()],
    states: results,
    snapshots,
  }
}

function validateDataset(value: unknown): asserts value is ElectionDataset {
  if (!value || typeof value !== "object")
    throw new Error("A fonte oficial retornou uma resposta vazia")

  const data = value as Partial<ElectionDataset>
  if (
    !data.election?.id ||
    !data.election.year ||
    !data.office ||
    !data.source ||
    !data.updatedAt
  ) {
    throw new Error("A resposta não contém identificação completa da eleição")
  }
  if (Number.isNaN(Date.parse(data.updatedAt)))
    throw new Error("A fonte oficial retornou um timestamp inválido")
  if (!Array.isArray(data.candidates) || !Array.isArray(data.states))
    throw new Error("A resposta não contém candidatos e estados válidos")
  if (!data.states.length)
    throw new Error("A fonte oficial ainda não disponibilizou resultados")

  const candidateIds = new Set(data.candidates.map((candidate) => candidate.id))
  const hasInvalidState = data.states.some(
    (result) =>
      !result.state?.id ||
      !result.status ||
      !Array.isArray(result.votes) ||
      result.status.percentageCounted < 0 ||
      result.status.percentageCounted > 100 ||
      result.votes.some(
        (vote) =>
          !candidateIds.has(vote.candidateId) ||
          vote.votes < 0 ||
          vote.percentage < 0 ||
          vote.percentage > 100 ||
          !vote.updatedAt,
      ),
  )
  if (hasInvalidState)
    throw new Error("A fonte oficial retornou totais eleitorais inconsistentes")
}

function shouldRetry(status: number) {
  return status === 408 || status === 429 || status >= 500
}

async function delay(duration: number) {
  await new Promise((resolve) => window.setTimeout(resolve, duration))
}

export class ElectionDataService {
  private timer: number | null = null
  private snapshots = new Map<string, VoteSnapshot[]>()
  private inFlight: Promise<ElectionDataset> | null = null
  private inFlightKey = ""

  private async request(endpoint: URL): Promise<unknown> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_REQUEST_ATTEMPTS; attempt += 1) {
      const controller = new AbortController()
      const timeout = window.setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      )

      try {
        const response = await fetch(endpoint, {
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
          },
          cache: "no-store",
          signal: controller.signal,
        })
        if (!response.ok) {
          const error = new Error(`Falha na fonte oficial (${response.status})`)
          if (!shouldRetry(response.status)) throw error
          lastError = error
        } else {
          return await response.json()
        }
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          lastError = new Error("A fonte oficial excedeu o tempo de resposta")
        } else {
          lastError =
            reason instanceof Error
              ? reason
              : new Error("Falha de comunicação com a fonte oficial")
        }
      } finally {
        window.clearTimeout(timeout)
      }

      if (attempt < MAX_REQUEST_ATTEMPTS) {
        await delay(600 * 2 ** (attempt - 1))
      }
    }

    throw lastError ?? new Error("Fonte oficial indisponível")
  }

  private recordSnapshot(dataset: ElectionDataset) {
    const key = `${dataset.election.id}:${dataset.office}`
    const sectionsTotal = dataset.states.reduce(
      (sum, result) => sum + result.status.sectionsTotal,
      0,
    )
    const sectionsCounted = dataset.states.reduce(
      (sum, result) => sum + result.status.sectionsCounted,
      0,
    )
    const percentageCounted = sectionsTotal
      ? (sectionsCounted / sectionsTotal) * 100
      : 0
    const existing = this.snapshots.get(key) ?? []
    const snapshots = [
      ...existing,
      { timestamp: dataset.updatedAt, percentageCounted },
    ].filter(
      (snapshot, index, list) =>
        list.findIndex((item) => item.timestamp === snapshot.timestamp) ===
        index,
    )
    this.snapshots.set(key, snapshots.slice(-48))
    return snapshots.slice(-48)
  }

  async fetchData(office: Office, round = 1): Promise<ElectionDataset> {
    const key = `${office}:${round}`
    if (this.inFlight && this.inFlightKey === key) return this.inFlight

    const run = this.fetchDataUncached(office, round)
    this.inFlight = run
    this.inFlightKey = key
    try {
      return await run
    } finally {
      if (this.inFlight === run) {
        this.inFlight = null
        this.inFlightKey = ""
      }
    }
  }

  private async fetchDataUncached(
    office: Office,
    round = 1,
  ): Promise<ElectionDataset> {
    const baseUrl = resolveApiBaseUrl()
    const forceDemo = import.meta.env.VITE_ELECTION_USE_DEMO === "true"

    if (forceDemo || !baseUrl) {
      await new Promise((resolve) => window.setTimeout(resolve, 420))
      return createDemoDataset(office)
    }

    const endpoint = new URL(API_RESULTS_PATH, baseUrl)
    endpoint.searchParams.set("office", office)
    endpoint.searchParams.set("round", String(round))
    // Evita cache intermediário do browser/CDN no caminho do painel.
    endpoint.searchParams.set("_ts", String(Date.now()))
    const payload = await this.request(endpoint)
    validateDataset(payload)
    if (payload.office !== office)
      throw new Error("A fonte oficial retornou dados de outro cargo")

    const dataset: ElectionDataset = {
      ...payload,
      isDemo: false,
      snapshots: Array.isArray(payload.snapshots) ? payload.snapshots : [],
    }
    // Se a fonte já publicou votos, não mantenha o painel em "scheduled".
    const published = dataset.states.some(
      (result) =>
        result.status.totalVotes > 0 ||
        result.status.percentageCounted > 0 ||
        result.votes.some((vote) => vote.votes > 0),
    )
    if (
      published &&
      dataset.election.status !== "counting" &&
      dataset.election.status !== "completed"
    ) {
      dataset.election = { ...dataset.election, status: "counting" }
    }
    const snapshots = dataset.snapshots.length
      ? dataset.snapshots
      : this.recordSnapshot(dataset)
    return { ...dataset, snapshots }
  }

  startPolling(callback: () => void, intervalMs = 5000) {
    this.stopPolling()
    this.timer = window.setInterval(callback, intervalMs)
  }

  stopPolling() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }
}

export const electionDataService = new ElectionDataService()

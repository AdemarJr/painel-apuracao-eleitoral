import { useCallback, useEffect, useMemo, useState } from "react"
import { brazilStatePaths } from "./data/brazilMap"
import { electionDataService } from "./services/ElectionDataService"
import type {
  Candidate,
  ConnectionStatus,
  ElectionDataset,
  Office,
  StateResult,
  VoteCount,
} from "./types/election"

const offices: Office[] = [
  "Presidente",
  "Governador",
  "Senador",
  "Deputado Federal",
  "Deputado Estadual",
]
const NATIONAL_OFFICES: Office[] = ["Presidente"]

function isNationalOffice(office: Office) {
  return NATIONAL_OFFICES.includes(office)
}
const numberFormat = new Intl.NumberFormat("pt-BR")
const compactFormat = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const percentFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

type IconName = "refresh" | "chevron" | "search" | "clock" | "database" | "map" | "trend" | "table" | "close"

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    refresh: (
      <>
        <path d="M20 11a8 8 0 1 0-2.34 5.66" />
        <path d="M20 4v7h-7" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </>
    ),
    map: (
      <>
        <path d="m3 6 5-2 8 2 5-2v14l-5 2-8-2-5 2Z" />
        <path d="M8 4v14M16 6v14" />
      </>
    ),
    trend: (
      <>
        <path d="M3 17 9 11l4 4 8-9" />
        <path d="M15 6h6v6" />
      </>
    ),
    table: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M9 4v16" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return <section className={`card ${className}`}>{children}</section>
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="select-wrap">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
        <Icon name="chevron" size={15} />
      </span>
    </label>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      className="toggle-row"
      onClick={onChange}
      aria-pressed={checked}
    >
      <span className={`toggle ${checked ? "active" : ""}`}>
        <span />
      </span>
      <span>{label}</span>
    </button>
  )
}

function SectionTitle({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: IconName
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="section-heading">
      <div className="section-heading-main">
        <span className="section-icon">
          <Icon name={icon} />
        </span>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

function candidatesForScope(dataset: ElectionDataset, selectedState: string) {
  if (selectedState === "BR") {
    if (isNationalOffice(dataset.office)) return dataset.candidates
    // Cargos estaduais no recorte Brasil: líderes de cada UF
    return dataset.states
      .map((result) => result.leader)
      .filter((candidate): candidate is Candidate => Boolean(candidate))
  }

  const stateResult = dataset.states.find(
    (result) => result.state.id === selectedState,
  )
  if (!stateResult) return []

  const ids = new Set(stateResult.votes.map((vote) => vote.candidateId))
  const fromCatalog = dataset.candidates.filter(
    (candidate) =>
      ids.has(candidate.id) || candidate.stateId === selectedState,
  )
  if (fromCatalog.length) return fromCatalog

  // Fallback: monta a partir dos votos da UF (proxy TSE)
  return stateResult.votes
    .map((vote) => {
      const known = dataset.candidates.find(
        (candidate) => candidate.id === vote.candidateId,
      )
      return (
        known ??
        ({
          id: vote.candidateId,
          name: vote.candidateId,
          ballotName: vote.candidateId,
          party: "—",
          number: 0,
          office: dataset.office,
          stateId: selectedState,
        } satisfies Candidate)
      )
    })
    .filter(Boolean)
}

function aggregateVotes(dataset: ElectionDataset, selectedState: string) {
  const scope =
    selectedState === "BR"
      ? dataset.states
      : dataset.states.filter((result) => result.state.id === selectedState)
  const scopedCandidates = candidatesForScope(dataset, selectedState)

  return scopedCandidates
    .map((candidate) => {
      const votes = scope.reduce((sum, result) => {
        return (
          sum +
          (result.votes.find((vote) => vote.candidateId === candidate.id)
            ?.votes ?? 0)
        )
      }, 0)
      return { candidate, votes }
    })
    .filter((item) => selectedState === "BR" || item.votes > 0 || !isNationalOffice(dataset.office))
    .sort((a, b) => b.votes - a.votes)
}

function SummaryCards({
  dataset,
  selectedState,
}: {
  dataset: ElectionDataset
  selectedState: string
}) {
  const scope =
    selectedState === "BR"
      ? dataset.states
      : dataset.states.filter((item) => item.state.id === selectedState)
  const totalVotes = scope.reduce(
    (sum, item) => sum + item.status.totalVotes,
    0,
  )
  const validVotes = scope.reduce(
    (sum, item) => sum + item.status.validVotes,
    0,
  )
  const sections = scope.reduce(
    (sum, item) => sum + item.status.sectionsTotal,
    0,
  )
  const counted = scope.reduce(
    (sum, item) => sum + item.status.sectionsCounted,
    0,
  )
  const percentage = sections ? (counted / sections) * 100 : 0
  const completed = scope.filter(
    (item) => item.status.percentageCounted >= 95,
  ).length
  const time = new Date(dataset.updatedAt).toLocaleTimeString("pt-BR")
  const items = [
    ["Total de votos", numberFormat.format(totalVotes), "Votos recebidos"],
    ["Votos válidos", numberFormat.format(validVotes), "Após brancos e nulos"],
    [
      "Percentual apurado",
      `${percentFormat.format(percentage)}%`,
      `${numberFormat.format(counted)} seções totalizadas`,
    ],
    [
      "Estados apurados",
      selectedState === "BR" ? `${completed} / 27` : "1 selecionado",
      "Acima de 95%",
    ],
    ["Última atualização", time, "Atualizado agora"],
  ]
  return (
    <div className="summary-grid">
      {items.map(([label, value, detail], index) => (
        <Card key={label} className="summary-card">
          <div className="summary-top">
            <span>{label}</span>
            {index === 2 && <span className="live-dot" />}
          </div>
          <strong>{value}</strong>
          <small>{detail}</small>
        </Card>
      ))}
    </div>
  )
}

function BrazilMap({
  dataset,
  selectedState,
  onSelect,
}: {
  dataset: ElectionDataset
  selectedState: string
  onSelect: (state: string) => void
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const resultMap = useMemo(
    () =>
      Object.fromEntries(
        dataset.states.map((result) => [result.state.id, result]),
      ),
    [dataset],
  )
  const tooltip = hovered ? resultMap[hovered] : undefined
  const leader = tooltip
    ? dataset.candidates.find(
        (candidate) =>
          candidate.id ===
          tooltip.votes.slice().sort((a, b) => b.votes - a.votes)[0]
            ?.candidateId,
      )
    : undefined
  const leaderVote = tooltip?.votes.slice().sort((a, b) => b.votes - a.votes)[0]

  return (
    <Card className="map-card">
      <SectionTitle
        icon="map"
        title="Distribuição geográfica"
        subtitle="Intensidade por percentual de totalização"
      />
      <div className="map-layout">
        <div className="map-stage" onMouseLeave={() => setHovered(null)}>
          <svg
            className="brazil-map"
            viewBox="0 0 620 570"
            role="img"
            aria-label="Mapa do Brasil dividido por estados"
          >
            {Object.entries(brazilStatePaths).map(([uf, path]) => {
              const percentage = resultMap[uf]?.status.percentageCounted ?? 0
              const level = Math.min(
                4,
                Math.max(1, Math.ceil((percentage - 55) / 11)),
              )
              return (
                <path
                  key={uf}
                  d={path}
                  className={`state-shape level-${level} ${
                    selectedState === uf ? "selected" : ""
                  }`}
                  onMouseEnter={() => setHovered(uf)}
                  onFocus={() => setHovered(uf)}
                  onClick={() => onSelect(uf)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Selecionar ${resultMap[uf]?.state.name ?? uf}`}
                />
              )
            })}
          </svg>
          {tooltip && (
            <div className="map-tooltip">
              <div className="tooltip-title">
                <strong>{tooltip.state.name}</strong>
                <span>{tooltip.state.id}</span>
              </div>
              <div>
                <span>Votos contabilizados</span>
                <b>{numberFormat.format(tooltip.status.totalVotes)}</b>
              </div>
              <div>
                <span>Apuração</span>
                <b>{percentFormat.format(tooltip.status.percentageCounted)}%</b>
              </div>
              <div>
                <span>Liderança</span>
                <b>
                  {leader?.ballotName ?? "—"} ·{" "}
                  {percentFormat.format(leaderVote?.percentage ?? 0)}%
                </b>
              </div>
              <div>
                <span>Válidos</span>
                <b>{numberFormat.format(tooltip.status.validVotes)}</b>
              </div>
              <div>
                <span>Brancos / nulos</span>
                <b>
                  {numberFormat.format(tooltip.status.blankVotes)} /{" "}
                  {numberFormat.format(tooltip.status.nullVotes)}
                </b>
              </div>
            </div>
          )}
        </div>
        <div className="map-legend">
          <span>Menor totalização</span>
          <div>
            {[1, 2, 3, 4].map((level) => (
              <i key={level} className={`level-${level}`} />
            ))}
          </div>
          <span>Maior totalização</span>
        </div>
      </div>
    </Card>
  )
}

function CandidateRanking({
  ranking,
  isDemo,
  selectedState,
  office,
}: {
  ranking: Array<{ candidate: Candidate; votes: number }>
  isDemo: boolean
  selectedState: string
  office: Office
}) {
  const total = ranking.reduce((sum, item) => sum + item.votes, 0)
  const stateScoped = !isNationalOffice(office)
  const subtitle =
    selectedState === "BR"
      ? stateScoped
        ? "Líder de cada estado — selecione uma UF para ver a chapa completa"
        : "Classificação nacional"
      : `Candidatos em ${selectedState}`

  return (
    <Card className="ranking-card">
      <SectionTitle
        icon="trend"
        title={
          selectedState === "BR" && stateScoped
            ? "Líderes por estado"
            : "Ranking de candidatos"
        }
        subtitle={subtitle}
      />
      <div className="ranking-list">
        {ranking.length === 0 ? (
          <p className="ranking-note">
            Nenhum candidato disponível para este recorte. Selecione um estado.
          </p>
        ) : (
          ranking.map((item, index) => {
            const percentage = total ? (item.votes / total) * 100 : 0
            const ufLabel =
              item.candidate.stateId && item.candidate.stateId !== "BR"
                ? item.candidate.stateId
                : selectedState !== "BR"
                  ? selectedState
                  : null
            return (
              <div className="rank-item" key={`${item.candidate.id}-${ufLabel ?? "br"}`}>
                <div className="rank-line">
                  <span className="rank-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="candidate-info">
                    <strong>
                      {item.candidate.ballotName}
                      {selectedState === "BR" && ufLabel ? (
                        <em className="uf-tag"> {ufLabel}</em>
                      ) : null}
                    </strong>
                    <span>
                      {item.candidate.party} · {item.candidate.number}
                    </span>
                  </div>
                  <div className="rank-value">
                    <strong>{percentFormat.format(percentage)}%</strong>
                    <span>{compactFormat.format(item.votes)} votos</span>
                  </div>
                </div>
                <div className="bar-track">
                  <span style={{ width: `${percentage}%` }} />
                </div>
              </div>
            )
          })
        )}
      </div>
      {isDemo && (
        <p className="ranking-note">
          Nomes e resultados exibidos são exclusivamente demonstrativos.
        </p>
      )}
    </Card>
  )
}

function BarChart({
  ranking,
}: {
  ranking: Array<{ candidate: Candidate; votes: number }>
}) {
  const [mode, setMode] = useState<"votes" | "percentage">("votes")
  const total = ranking.reduce((sum, item) => sum + item.votes, 0)
  const maximum =
    mode === "votes" ? Math.max(...ranking.map((item) => item.votes), 1) : 100
  return (
    <Card className="chart-card">
      <SectionTitle
        icon="trend"
        title="Votos por candidato"
        subtitle="Comparativo de desempenho"
        action={
          <div className="segmented">
            <button
              type="button"
              className={mode === "votes" ? "active" : ""}
              onClick={() => setMode("votes")}
            >
              Votos
            </button>
            <button
              type="button"
              className={mode === "percentage" ? "active" : ""}
              onClick={() => setMode("percentage")}
            >
              Percentual
            </button>
          </div>
        }
      />
      <div className="bar-chart">
        {ranking.map((item, index) => {
          const value =
            mode === "votes"
              ? item.votes
              : total
                ? (item.votes / total) * 100
                : 0
          return (
            <div className="bar-column" key={item.candidate.id}>
              <span className="bar-value">
                {mode === "votes"
                  ? compactFormat.format(value)
                  : `${percentFormat.format(value)}%`}
              </span>
              <div className="vertical-track">
                <span
                  className={`candidate-${index}`}
                  style={{ height: `${(value / maximum) * 100}%` }}
                />
              </div>
              <strong>
                {item.candidate.ballotName.replace("Candidatura ", "")}
              </strong>
              <small>{item.candidate.party}</small>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function EvolutionChart({ dataset }: { dataset: ElectionDataset }) {
  const width = 640
  const height = 210
  const points = dataset.snapshots.map((snapshot, index) => {
    const x =
      24 + index * ((width - 48) / Math.max(dataset.snapshots.length - 1, 1))
    const y = height - 28 - (snapshot.percentageCounted / 100) * (height - 56)
    return { x, y, snapshot }
  })
  const area = points.length
    ? `M${points[0].x},${height - 28} ${points.map((point) => `L${point.x},${point.y}`).join(" ")} L${points.at(-1)?.x},${height - 28}Z`
    : ""
  return (
    <Card className="chart-card">
      <SectionTitle
        icon="clock"
        title="Evolução da apuração"
        subtitle="Snapshots registrados a cada atualização"
      />
      <div className="line-chart">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Gráfico da evolução da apuração"
        >
          {[25, 50, 75, 100].map((value) => {
            const y = height - 28 - (value / 100) * (height - 56)
            return (
              <g key={value}>
                <line x1="24" y1={y} x2={width - 24} y2={y} />
                <text x="26" y={y - 6}>
                  {value}%
                </text>
              </g>
            )
          })}
          <path className="line-area" d={area} />
          <polyline
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          />
          {points.map((point) => (
            <circle
              key={point.snapshot.timestamp}
              cx={point.x}
              cy={point.y}
              r="4"
            />
          ))}
          {points.map(
            (point, index) =>
              index % 2 === 0 && (
                <text
                  className="time-label"
                  key={`time-${point.snapshot.timestamp}`}
                  x={point.x}
                  y={height - 8}
                  textAnchor="middle"
                >
                  {new Date(point.snapshot.timestamp).toLocaleTimeString(
                    "pt-BR",
                    { hour: "2-digit", minute: "2-digit" },
                  )}
                </text>
              ),
          )}
        </svg>
      </div>
    </Card>
  )
}

type SortKey = "state" | "electorate" | "votes" | "percentage"

function StateTable({
  dataset,
  onSelect,
  situation,
}: {
  dataset: ElectionDataset
  onSelect: (state: string) => void
  situation: string
}) {
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<SortKey>("percentage")
  const [ascending, setAscending] = useState(false)
  const rows = useMemo(
    () =>
      dataset.states
        .filter((row) => {
          const matchesSearch = `${row.state.name} ${row.state.id}`
            .toLowerCase()
            .includes(search.toLowerCase())
          const matchesSituation =
            situation === "all" ||
            (situation === "counted" && row.status.percentageCounted >= 95) ||
            (situation === "counting" && row.status.percentageCounted < 95)
          return matchesSearch && matchesSituation
        })
        .sort((a, b) => {
          const values = {
            state: [a.state.name, b.state.name],
            electorate: [a.state.electorate, b.state.electorate],
            votes: [a.status.totalVotes, b.status.totalVotes],
            percentage: [
              a.status.percentageCounted,
              b.status.percentageCounted,
            ],
          }[sort]
          const result =
            typeof values[0] === "string"
              ? String(values[0]).localeCompare(String(values[1]), "pt-BR")
              : Number(values[0]) - Number(values[1])
          return ascending ? result : -result
        }),
    [ascending, dataset.states, search, situation, sort],
  )

  function changeSort(key: SortKey) {
    if (sort === key) setAscending(!ascending)
    else {
      setSort(key)
      setAscending(false)
    }
  }

  return (
    <Card className="table-card">
      <SectionTitle
        icon="table"
        title="Apuração por estado"
        subtitle={`${rows.length} unidades federativas`}
        action={
          <label className="search-box">
            <Icon name="search" size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar estado"
            />
          </label>
        }
      />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>
                <button type="button" onClick={() => changeSort("state")}>
                  Estado <span>↕</span>
                </button>
              </th>
              <th>UF</th>
              <th>
                <button type="button" onClick={() => changeSort("electorate")}>
                  Eleitorado <span>↕</span>
                </button>
              </th>
              <th>
                <button type="button" onClick={() => changeSort("votes")}>
                  Votos apurados <span>↕</span>
                </button>
              </th>
              <th>
                <button type="button" onClick={() => changeSort("percentage")}>
                  % apurado <span>↕</span>
                </button>
              </th>
              <th>Votos válidos</th>
              <th>Candidato líder</th>
              <th>%</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const vote = row.votes
                .slice()
                .sort((a, b) => b.votes - a.votes)[0]
              const candidate = dataset.candidates.find(
                (item) => item.id === vote?.candidateId,
              )
              return (
                <tr key={row.state.id} onClick={() => onSelect(row.state.id)}>
                  <td>
                    <strong>{row.state.name}</strong>
                  </td>
                  <td>
                    <span className="uf-chip">{row.state.id}</span>
                  </td>
                  <td>{numberFormat.format(row.state.electorate)}</td>
                  <td>{numberFormat.format(row.status.totalVotes)}</td>
                  <td>
                    <div className="table-progress">
                      <span
                        style={{ width: `${row.status.percentageCounted}%` }}
                      />
                    </div>
                    <b>{percentFormat.format(row.status.percentageCounted)}%</b>
                  </td>
                  <td>{numberFormat.format(row.status.validVotes)}</td>
                  <td>{candidate?.ballotName ?? "—"}</td>
                  <td>
                    <b>{percentFormat.format(vote?.percentage ?? 0)}%</b>
                  </td>
                  <td>
                    <Icon name="chevron" size={16} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function StateDetail({
  result,
  dataset,
  onClose,
}: {
  result: StateResult
  dataset: ElectionDataset
  onClose: () => void
}) {
  const ranking = result.votes
    .slice()
    .sort((a, b) => b.votes - a.votes)
    .map((vote) => {
      const known = dataset.candidates.find(
        (candidate) => candidate.id === vote.candidateId,
      )
      const candidate =
        known ??
        (result.leader?.id === vote.candidateId ? result.leader : undefined) ??
        ({
          id: vote.candidateId,
          name: vote.candidateId,
          ballotName: vote.candidateId,
          party: "—",
          number: 0,
          office: dataset.office,
          stateId: result.state.id,
        } satisfies Candidate)
      return { vote, candidate }
    })
  const metrics = [
    ["Eleitorado", result.state.electorate],
    ["Seções", result.status.sectionsTotal],
    ["Seções totalizadas", result.status.sectionsCounted],
    ["Votos válidos", result.status.validVotes],
    ["Votos brancos", result.status.blankVotes],
    ["Votos nulos", result.status.nullVotes],
    ["Abstenções", result.status.abstentions],
  ]
  return (
    <Card className="detail-card">
      <div className="detail-header">
        <div>
          <span className="eyebrow">Detalhamento da unidade federativa</span>
          <h2>
            {result.state.name} <em>— {result.state.id}</em>
          </h2>
          <p>
            {dataset.office} ·{" "}
            {dataset.isDemo ? "Dados demonstrativos" : dataset.source}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Fechar detalhes"
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="detail-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{numberFormat.format(value as number)}</strong>
          </div>
        ))}
        <div className="accent">
          <span>Totalização</span>
          <strong>
            {percentFormat.format(result.status.percentageCounted)}%
          </strong>
        </div>
      </div>
      <div className="detail-ranking">
        <h3>Resultado no estado</h3>
        {ranking.map(({ vote, candidate }, index) => (
          <div key={vote.candidateId}>
            <span>{index + 1}</span>
            <strong>{candidate?.ballotName}</strong>
            <small>{candidate?.party}</small>
            <b>{numberFormat.format(vote.votes)} votos</b>
            <em>{percentFormat.format(vote.percentage)}%</em>
          </div>
        ))}
      </div>
    </Card>
  )
}

function LoadingDashboard() {
  return (
    <>
      <div className="summary-grid">
        {[1, 2, 3, 4, 5].map((item) => (
          <Card key={item} className="skeleton summary-card" />
        ))}
      </div>
      <div className="hero-grid">
        <Card className="skeleton loading-panel" />
        <Card className="skeleton loading-panel" />
      </div>
    </>
  )
}

function hasPublishedVotes(dataset: ElectionDataset) {
  return dataset.states.some(
    (result) =>
      result.status.totalVotes > 0 ||
      result.status.percentageCounted > 0 ||
      result.votes.some((vote) => vote.votes > 0),
  )
}

function isApurationLive(dataset: ElectionDataset) {
  // Demo sempre mostra. Fonte oficial libera com status counting/completed
  // ou quando já existem votos/totalização publicados (ex.: simulado TSE).
  return (
    dataset.isDemo ||
    dataset.election.status === "counting" ||
    dataset.election.status === "completed" ||
    hasPublishedVotes(dataset)
  )
}

function AwaitingApuration({
  dataset,
  office,
  selectedState,
}: {
  dataset: ElectionDataset
  office: Office
  selectedState: string
}) {
  const candidates = candidatesForScope(dataset, selectedState).filter(
    (candidate) => candidate.office === office,
  )
  const scopeLabel =
    selectedState === "BR"
      ? isNationalOffice(office)
        ? "Brasil"
        : "líderes por estado"
      : selectedState

  return (
    <Card className="awaiting-card">
      <div className="awaiting-copy">
        <span className="awaiting-pill">
          <Icon name="clock" size={14} /> Aguardando apuração
        </span>
        <h2>A contagem ainda não começou</h2>
        <p>
          Os nomes abaixo já vêm da fonte oficial por estado. Os totais de
          votos só serão liberados quando a totalização começar.
        </p>
        <ul>
          <li>Cargo: {office}</li>
          <li>Recorte: {scopeLabel}</li>
          <li>Eleição: {dataset.election.year} · {dataset.election.round}º turno</li>
          <li>Fonte: {dataset.source}</li>
        </ul>
      </div>
      {candidates.length > 0 && (
        <div className="awaiting-candidates">
          <h3>Candidatos ({scopeLabel})</h3>
          <p>
            {isNationalOffice(office) || selectedState !== "BR"
              ? "Prévia sem totais — votos ocultos até o início da contagem."
              : "Selecione um estado no filtro para ver a chapa completa da UF."}
          </p>
          <div className="awaiting-list">
            {candidates.slice(0, 40).map((candidate) => (
              <div key={`${candidate.id}-${candidate.stateId ?? "br"}`}>
                <strong>
                  {candidate.ballotName}
                  {candidate.stateId && candidate.stateId !== "BR" ? (
                    <em className="uf-tag"> {candidate.stateId}</em>
                  ) : null}
                </strong>
                <span>
                  {candidate.party} · {candidate.number}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

export default function App() {
  const [dataset, setDataset] = useState<ElectionDataset | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>("updating")
  const [error, setError] = useState("")
  const [autoUpdate, setAutoUpdate] = useState(true)
  const [office, setOffice] = useState<Office>("Presidente")
  const [pendingOffice, setPendingOffice] = useState<Office>("Presidente")
  const [pendingState, setPendingState] = useState("BR")
  const [selectedState, setSelectedState] = useState("BR")
  const [round, setRound] = useState("current")
  const [situation, setSituation] = useState("all")
  const [activeSituation, setActiveSituation] = useState("all")

  const loadData = useCallback(
    async (selectedOffice: Office = office) => {
      setStatus("updating")
      setError("")
      try {
        const data = await electionDataService.fetchData(
          selectedOffice,
          round === "second" ? 2 : 1,
        )
        setDataset(data)
        setStatus("online")
      } catch (reason) {
        setStatus("error")
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível atualizar os dados.",
        )
      }
    },
    [office, round],
  )

  useEffect(() => {
    loadData()
  }, [loadData])
  useEffect(() => {
    if (autoUpdate) electionDataService.startPolling(() => loadData(), 20000)
    else electionDataService.stopPolling()
    return () => electionDataService.stopPolling()
  }, [autoUpdate, loadData])

  function applyFilters() {
    setOffice(pendingOffice)
    setSelectedState(pendingState)
    setActiveSituation(situation)
    if (pendingOffice === office) loadData(pendingOffice)
  }

  function chooseState(state: string) {
    setSelectedState(state)
    setPendingState(state)
    window.setTimeout(
      () =>
        document
          .querySelector(".detail-card")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      80,
    )
  }

  const ranking = useMemo(
    () => (dataset ? aggregateVotes(dataset, selectedState) : []),
    [dataset, selectedState],
  )
  const selectedResult = dataset?.states.find(
    (result) => result.state.id === selectedState,
  )
  const updateTime = dataset
    ? new Date(dataset.updatedAt).toLocaleTimeString("pt-BR")
    : "--:--:--"
  const statusCopy =
    status === "updating"
      ? "Atualizando dados"
      : status === "error"
        ? "Falha na atualização"
        : "Dados atualizados"
  const isDemoMode = dataset?.isDemo ?? false
  const showLiveResults = dataset ? isApurationLive(dataset) : false
  const electionPhase = dataset?.election.status
  const contextBadge = !dataset
    ? {
        className: "scheduled-badge",
        title: status === "error" ? "Falha na conexão" : "Conectando ao TSE",
        detail:
          status === "error"
            ? error || "Não foi possível obter os resultados oficiais"
            : "Consultando resultados oficiais em tempo real…",
        chip: "TSE oficial",
      }
    : isDemoMode
      ? {
          className: "demo-badge",
          title: "Modo demonstração",
          detail: "Dados sintéticos — não representam resultados oficiais",
          chip: "Estrutura pronta para TSE/TRE",
        }
      : electionPhase === "scheduled" && !showLiveResults
        ? {
            className: "scheduled-badge",
            title: "Aguardando apuração",
            detail:
              "Fonte oficial conectada — votos serão liberados ao iniciar a contagem",
            chip: "TSE oficial",
          }
        : {
            className: "official-badge",
            title:
              electionPhase === "completed"
                ? "Apuração concluída"
                : "Apuração em andamento",
            detail: dataset.source || "Dados oficiais do TSE em tempo real",
            chip: "TSE oficial",
          }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h1>Painel de Apuração Eleitoral</h1>
            <p>Monitoramento de votos por estado</p>
          </div>
        </div>
        <div className="header-actions">
          <div className="connection">
            <span className={`status-dot ${status}`} />
            <div>
              <strong>{statusCopy}</strong>
              <small>
                {status === "error"
                  ? "Tentando novamente"
                  : `Última atualização · ${updateTime}`}
              </small>
            </div>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => loadData()}
            disabled={status === "updating"}
          >
            <Icon name="refresh" size={16} />
            {status === "updating" ? "Atualizando..." : "Atualizar"}
          </button>
          <Toggle
            checked={autoUpdate}
            onChange={() => setAutoUpdate(!autoUpdate)}
            label="Auto"
          />
        </div>
      </header>

      <main>
        <div className="context-row">
          <div className={contextBadge.className}>
            <span>{contextBadge.title}</span>
            <p>{contextBadge.detail}</p>
          </div>
          <div className="source-chip">
            <Icon name="database" size={15} /> {contextBadge.chip}
          </div>
        </div>

        <Card className="filter-bar">
          <SelectField label="Eleição" value={round} onChange={setRound}>
            <option value="current">Eleição atual</option>
            <option value="first">1º turno</option>
            <option value="second">2º turno</option>
          </SelectField>
          <SelectField
            label="Cargo"
            value={pendingOffice}
            onChange={(value) => setPendingOffice(value as Office)}
          >
            {offices.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </SelectField>
          <SelectField
            label="Estado"
            value={pendingState}
            onChange={setPendingState}
          >
            <option value="BR">Brasil</option>
            {dataset?.states.map((result) => (
              <option value={result.state.id} key={result.state.id}>
                {result.state.id} — {result.state.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Situação"
            value={situation}
            onChange={setSituation}
          >
            <option value="all">Todos</option>
            <option value="counting">Em apuração</option>
            <option value="counted">Apurado</option>
          </SelectField>
          <div className="filter-auto">
            <Toggle
              checked={autoUpdate}
              onChange={() => setAutoUpdate(!autoUpdate)}
              label="Atualização automática"
            />
          </div>
          <button
            type="button"
            className="primary-button"
            onClick={applyFilters}
          >
            Aplicar filtros <Icon name="chevron" size={16} />
          </button>
        </Card>

        {error && (
          <div className="error-banner">
            <strong>Não foi possível atualizar os dados.</strong>
            <span>{error} Tentaremos novamente automaticamente.</span>
          </div>
        )}
        {!dataset ? (
          <LoadingDashboard />
        ) : showLiveResults ? (
          <>
            <SummaryCards dataset={dataset} selectedState={selectedState} />
            <div className="scope-line">
              <span>Visualizando</span>
              <strong>
                {selectedState === "BR" ? "Brasil" : selectedResult?.state.name}
              </strong>
              <i /> <span>{office}</span>
              {!isDemoMode && (
                <>
                  <i />
                  <span>
                    {electionPhase === "completed"
                      ? "Totalização concluída"
                      : "Contagem liberada"}
                  </span>
                </>
              )}
            </div>
            <div className="hero-grid">
              <BrazilMap
                dataset={dataset}
                selectedState={selectedState}
                onSelect={chooseState}
              />
              <CandidateRanking
                ranking={ranking}
                isDemo={dataset.isDemo}
                selectedState={selectedState}
                office={office}
              />
            </div>
            <div className="charts-grid">
              <BarChart ranking={ranking} />
              <EvolutionChart dataset={dataset} />
            </div>
            {selectedResult && (
              <StateDetail
                result={selectedResult}
                dataset={dataset}
                onClose={() => chooseState("BR")}
              />
            )}
            <StateTable
              dataset={dataset}
              onSelect={chooseState}
              situation={activeSituation}
            />
          </>
        ) : (
          <AwaitingApuration
            dataset={dataset}
            office={office}
            selectedState={selectedState}
          />
        )}
      </main>

      <footer>
        <div className="footer-meta">
          <div>
            <span className={`status-dot ${status}`} />
            Fonte dos dados: <strong>{dataset?.source ?? "TSE/TRE"}</strong> ·
            Última atualização: {updateTime}
          </div>
          <p>
            Os dados apresentados dependem da disponibilidade e atualização da
            fonte oficial.
          </p>
        </div>
        <p className="copyright">
          Todos os Direitos Reservados · Ademar Farias Jr — Engenheiro de
          Software ·{" "}
          <a href="https://pyrou.com.br" target="_blank" rel="noreferrer">
            Pyrou.com.br
          </a>
        </p>
      </footer>
    </div>
  )
}

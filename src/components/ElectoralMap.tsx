import { useEffect, useMemo, useRef, useState } from "react"
import { brazilStatePaths } from "../data/brazilMap"
import {
  applyColorIntensity,
  buildPartyColorMap,
  candidateColor,
  COUNTED_SCALE,
  loadStoredPartyColors,
  partyKey,
  saveStoredPartyColors,
} from "../lib/partyColors"
import {
  buildPartyStandings,
  buildStateLeaders,
  collectParties,
  nationalCountedPercentage,
  type MapViewMode,
  type StateLeaderInfo,
} from "../lib/electoralMap"
import type { ElectionDataset, Office } from "../types/election"

const numberFormat = new Intl.NumberFormat("pt-BR")
const percentFormat = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

type ElectoralMapProps = {
  dataset: ElectionDataset
  office: Office
  selectedState: string
  onSelect: (state: string) => void
  updatedAtLabel: string
}

export default function ElectoralMap({
  dataset,
  office,
  selectedState,
  onSelect,
  updatedAtLabel,
}: ElectoralMapProps) {
  const [viewMode, setViewMode] = useState<MapViewMode>("party")
  const [hovered, setHovered] = useState<string | null>(null)
  const [focusParty, setFocusParty] = useState<string | null>(null)
  const [customColors, setCustomColors] = useState<Record<string, string>>(() =>
    typeof window !== "undefined" ? loadStoredPartyColors() : {},
  )
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareParties, setCompareParties] = useState<string[]>([])
  const [flashStates, setFlashStates] = useState<Set<string>>(new Set())
  const [livePulse, setLivePulse] = useState(false)
  const prevLeaders = useRef<Record<string, string>>({})

  const leaders = useMemo(() => buildStateLeaders(dataset), [dataset])
  const leaderByUf = useMemo(
    () => Object.fromEntries(leaders.map((item) => [item.stateId, item])),
    [leaders],
  )
  const parties = useMemo(() => collectParties(leaders), [leaders])
  const partyColors = useMemo(
    () => buildPartyColorMap(parties, customColors),
    [parties, customColors],
  )
  const standings = useMemo(() => buildPartyStandings(leaders), [leaders])
  const nationalCounted = useMemo(
    () => nationalCountedPercentage(dataset),
    [dataset],
  )

  const topParty = standings[0]
  const strongest = useMemo(() => {
    if (!leaders.length) return null
    return leaders.reduce((best, item) =>
      item.percentage > best.percentage ? item : best,
    )
  }, [leaders])
  const definedStates = leaders.filter(
    (item) => item.votes > 0 || item.countedPercentage > 0,
  ).length

  useEffect(() => {
    const previous = prevLeaders.current
    const next: Record<string, string> = {}
    const changed = new Set<string>()
    for (const leader of leaders) {
      const key = `${partyKey(leader.party)}:${leader.candidateId}`
      next[leader.stateId] = key
      if (previous[leader.stateId] && previous[leader.stateId] !== key) {
        changed.add(leader.stateId)
      }
    }
    prevLeaders.current = next
    if (changed.size) {
      setFlashStates(changed)
      const timer = window.setTimeout(() => setFlashStates(new Set()), 1200)
      return () => window.clearTimeout(timer)
    }
  }, [leaders])

  useEffect(() => {
    setLivePulse(true)
    const timer = window.setTimeout(() => setLivePulse(false), 1600)
    return () => window.clearTimeout(timer)
  }, [dataset.updatedAt])

  function setPartyColor(party: string, color: string) {
    const key = partyKey(party)
    const next = { ...customColors, [key]: color, [party]: color }
    setCustomColors(next)
    saveStoredPartyColors(next)
  }

  function fillForState(leader: StateLeaderInfo | undefined): string {
    if (!leader) return "#E8EEF5"
    if (viewMode === "counted") {
      const idx = Math.min(
        4,
        Math.max(0, Math.floor(leader.countedPercentage / 20)),
      )
      return COUNTED_SCALE[idx]
    }
    const base =
      viewMode === "candidate"
        ? candidateColor(leader.candidateId, leader.party, partyColors)
        : partyColors[partyKey(leader.party)] ||
          partyColors[leader.party] ||
          "#64748B"
    if (viewMode === "percentage") {
      return applyColorIntensity(base, leader.percentage / 100)
    }
    return base
  }

  function opacityForState(uf: string, leader: StateLeaderInfo | undefined) {
    if (!focusParty) return 1
    if (!leader) return 0.18
    return partyKey(leader.party) === partyKey(focusParty) ? 1 : 0.16
  }

  const hoveredLeader = hovered ? leaderByUf[hovered] : undefined
  const compareRows = standings.filter((item) =>
    compareParties.some((party) => partyKey(party) === partyKey(item.party)),
  )

  function toggleCompareParty(party: string) {
    setCompareParties((current) => {
      const key = partyKey(party)
      if (current.some((item) => partyKey(item) === key)) {
        return current.filter((item) => partyKey(item) !== key)
      }
      if (current.length >= 4) return current
      return [...current, party]
    })
  }

  return (
    <div className="electoral-map-shell">
      <div className="map-kpis">
        <div>
          <span>Partido com mais estados</span>
          <strong>
            {topParty ? `${topParty.party} — ${topParty.states}` : "—"}
          </strong>
        </div>
        <div>
          <span>Maior percentual estadual</span>
          <strong>
            {strongest
              ? `${strongest.party} — ${percentFormat.format(strongest.percentage)}%`
              : "—"}
          </strong>
        </div>
        <div>
          <span>Estados definidos</span>
          <strong>
            {definedStates} / 27
          </strong>
        </div>
        <div>
          <span>Apuração nacional</span>
          <strong>{percentFormat.format(nationalCounted)}%</strong>
        </div>
      </div>

      <div className="electoral-map-grid">
        <section className="map-card electoral-map-card">
          <div className="map-card-heading">
            <div>
              <h2>Mapa eleitoral do Brasil</h2>
              <p>
                {office} · coloração por{" "}
                {viewMode === "party"
                  ? "partido líder"
                  : viewMode === "candidate"
                    ? "candidato líder"
                    : viewMode === "percentage"
                      ? "intensidade do percentual"
                      : "apuracão"}
              </p>
            </div>
            <div className={`map-live-flag ${livePulse ? "pulse" : ""}`}>
              <span /> Atualizado agora · {updatedAtLabel}
            </div>
          </div>

          <div className="map-controls">
            <label>
              Visualização
              <select
                value={viewMode}
                onChange={(event) =>
                  setViewMode(event.target.value as MapViewMode)
                }
              >
                <option value="party">Partido líder</option>
                <option value="candidate">Candidato líder</option>
                <option value="percentage">Percentual de votos</option>
                <option value="counted">Apuração</option>
              </select>
            </label>
            <button
              type="button"
              className={`secondary-button ${compareOpen ? "active-soft" : ""}`}
              onClick={() => setCompareOpen((value) => !value)}
            >
              Comparar partidos
            </button>
            {focusParty ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setFocusParty(null)}
              >
                Mostrar todos
              </button>
            ) : null}
          </div>

          <div className="map-layout electoral">
            <div
              className="map-stage electoral"
              onMouseLeave={() => setHovered(null)}
            >
              <svg
                className="brazil-map electoral"
                viewBox="0 0 620 570"
                role="img"
                aria-label="Mapa eleitoral do Brasil por partidos"
              >
                {Object.entries(brazilStatePaths).map(([uf, path]) => {
                  const leader = leaderByUf[uf]
                  const selected = selectedState === uf
                  const flash = flashStates.has(uf)
                  return (
                    <path
                      key={uf}
                      d={path}
                      className={`state-shape electoral ${
                        selected ? "selected" : ""
                      } ${flash ? "flash" : ""}`}
                      style={{
                        fill: fillForState(leader),
                        opacity: opacityForState(uf, leader),
                      }}
                      onMouseEnter={() => setHovered(uf)}
                      onFocus={() => setHovered(uf)}
                      onClick={() => onSelect(uf)}
                      tabIndex={0}
                      role="button"
                      aria-label={`${leader?.stateName ?? uf}: ${leader?.party ?? "sem dados"}`}
                    />
                  )
                })}
              </svg>

              {hoveredLeader ? (
                <div className="map-tooltip electoral">
                  <div className="tooltip-title">
                    <strong>
                      {hoveredLeader.stateName} — {hoveredLeader.stateId}
                    </strong>
                  </div>
                  <div>
                    <span>Partido líder</span>
                    <b>{hoveredLeader.party}</b>
                  </div>
                  <div>
                    <span>Candidato</span>
                    <b>{hoveredLeader.candidateName}</b>
                  </div>
                  <div>
                    <span>Votos</span>
                    <b>{numberFormat.format(hoveredLeader.votes)}</b>
                  </div>
                  <div>
                    <span>Percentual</span>
                    <b>
                      {percentFormat.format(hoveredLeader.percentage)}%
                    </b>
                  </div>
                  <div>
                    <span>Apuração</span>
                    <b>
                      {percentFormat.format(hoveredLeader.countedPercentage)}%
                    </b>
                  </div>
                  <div>
                    <span>Seções totalizadas</span>
                    <b>
                      {numberFormat.format(hoveredLeader.sectionsCounted)} /{" "}
                      {numberFormat.format(hoveredLeader.sectionsTotal)}
                    </b>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {compareOpen ? (
            <div className="party-compare">
              <div className="party-compare-head">
                <strong>Comparar partidos</strong>
                <span>Selecione até 4 partidos</span>
              </div>
              <div className="party-compare-picks">
                {standings.map((item) => {
                  const active = compareParties.some(
                    (party) => partyKey(party) === partyKey(item.party),
                  )
                  return (
                    <button
                      key={item.party}
                      type="button"
                      className={active ? "active" : ""}
                      onClick={() => toggleCompareParty(item.party)}
                    >
                      <i
                        style={{
                          background:
                            partyColors[partyKey(item.party)] || "#64748B",
                        }}
                      />
                      {item.party}
                    </button>
                  )
                })}
              </div>
              {compareRows.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>Partido</th>
                      <th>Estados</th>
                      <th>Votos (líderes)</th>
                      <th>% médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareRows.map((item) => (
                      <tr key={item.party}>
                        <td>{item.party}</td>
                        <td>{item.states}</td>
                        <td>{numberFormat.format(item.votes)}</td>
                        <td>{percentFormat.format(item.avgPercentage)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="ranking-note">
                  Escolha partidos acima para comparar.
                </p>
              )}
            </div>
          ) : null}
        </section>

        <aside className="map-side-panel">
          <div className="map-side-card">
            <h3>Partidos</h3>
            <p className="map-side-hint">
              Clique para filtrar o mapa. {office}
            </p>
            <div className="party-legend-list">
              {standings.map((item) => {
                const color =
                  partyColors[partyKey(item.party)] ||
                  partyColors[item.party] ||
                  "#64748B"
                const active =
                  focusParty &&
                  partyKey(focusParty) === partyKey(item.party)
                return (
                  <button
                    key={item.party}
                    type="button"
                    className={`party-legend-item ${active ? "active" : ""}`}
                    onClick={() =>
                      setFocusParty((current) =>
                        current && partyKey(current) === partyKey(item.party)
                          ? null
                          : item.party,
                      )
                    }
                  >
                    <i style={{ background: color }} />
                    <span>
                      <strong>{item.party}</strong>
                      <small>
                        {item.states} estado{item.states === 1 ? "" : "s"}
                      </small>
                    </span>
                  </button>
                )
              })}
            </div>
            {focusParty ? (
              <button
                type="button"
                className="secondary-button full"
                onClick={() => setFocusParty(null)}
              >
                Mostrar todos
              </button>
            ) : null}
          </div>

          <div className="map-side-card">
            <h3>Cores dos partidos</h3>
            <p className="map-side-hint">
              Personalize a cor — o mapa atualiza na hora.
            </p>
            <div className="party-color-list">
              {standings.map((item) => {
                const key = partyKey(item.party)
                const color =
                  partyColors[key] || partyColors[item.party] || "#64748B"
                return (
                  <label key={item.party} className="party-color-row">
                    <span>
                      <i style={{ background: color }} />
                      {item.party}
                    </span>
                    <input
                      type="color"
                      value={color}
                      onChange={(event) =>
                        setPartyColor(item.party, event.target.value)
                      }
                      aria-label={`Cor de ${item.party}`}
                    />
                  </label>
                )
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

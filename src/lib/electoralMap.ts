import type { Candidate, ElectionDataset, StateResult } from "../types/election"
import { partyKey } from "./partyColors"

export type MapViewMode = "party" | "candidate" | "percentage" | "counted"

export interface StateLeaderInfo {
  stateId: string
  stateName: string
  candidateId: string
  candidateName: string
  party: string
  votes: number
  percentage: number
  countedPercentage: number
  sectionsCounted: number
  sectionsTotal: number
  validVotes: number
  blankVotes: number
  nullVotes: number
  abstentions: number
  electorate: number
}

export interface PartyStanding {
  party: string
  states: number
  votes: number
  percentageSum: number
  avgPercentage: number
  maxPercentage: number
  stateIds: string[]
}

export function ufResults(dataset: ElectionDataset): StateResult[] {
  return dataset.states.filter((result) => result.state.id !== "BR")
}

export function resolveLeader(
  result: StateResult,
  dataset: ElectionDataset,
): StateLeaderInfo | null {
  const top = result.votes.slice().sort((a, b) => b.votes - a.votes)[0]
  if (!top) return null

  const candidate =
    dataset.candidates.find((item) => item.id === top.candidateId) ||
    (result.leader?.id === top.candidateId ? result.leader : undefined)

  return {
    stateId: result.state.id,
    stateName: result.state.name,
    candidateId: top.candidateId,
    candidateName: candidate?.ballotName || candidate?.name || top.candidateId,
    party: candidate?.party || "—",
    votes: top.votes,
    percentage: top.percentage,
    countedPercentage: result.status.percentageCounted,
    sectionsCounted: result.status.sectionsCounted,
    sectionsTotal: result.status.sectionsTotal,
    validVotes: result.status.validVotes,
    blankVotes: result.status.blankVotes,
    nullVotes: result.status.nullVotes,
    abstentions: result.status.abstentions,
    electorate: result.state.electorate,
  }
}

export function buildStateLeaders(dataset: ElectionDataset): StateLeaderInfo[] {
  return ufResults(dataset)
    .map((result) => resolveLeader(result, dataset))
    .filter((item): item is StateLeaderInfo => Boolean(item))
}

export function buildPartyStandings(
  leaders: StateLeaderInfo[],
): PartyStanding[] {
  const map = new Map<string, PartyStanding>()
  for (const leader of leaders) {
    const key = partyKey(leader.party)
    const current = map.get(key) || {
      party: leader.party,
      states: 0,
      votes: 0,
      percentageSum: 0,
      avgPercentage: 0,
      maxPercentage: 0,
      stateIds: [],
    }
    current.states += 1
    current.votes += leader.votes
    current.percentageSum += leader.percentage
    current.maxPercentage = Math.max(current.maxPercentage, leader.percentage)
    current.stateIds.push(leader.stateId)
    // Mantém o rótulo mais frequente / primeiro
    if (!current.party || current.party === "—") current.party = leader.party
    map.set(key, current)
  }

  return [...map.values()]
    .map((item) => ({
      ...item,
      avgPercentage: item.states ? item.percentageSum / item.states : 0,
    }))
    .sort((a, b) => b.states - a.states || b.votes - a.votes)
}

export function nationalCountedPercentage(dataset: ElectionDataset): number {
  const brasil = dataset.states.find((result) => result.state.id === "BR")
  if (brasil) return brasil.status.percentageCounted

  const ufs = ufResults(dataset)
  const electorate = ufs.reduce((sum, item) => sum + item.state.electorate, 0)
  if (!electorate) return 0
  return (
    ufs.reduce(
      (sum, item) => sum + item.status.percentageCounted * item.state.electorate,
      0,
    ) / electorate
  )
}

export function collectParties(leaders: StateLeaderInfo[]): string[] {
  return [...new Set(leaders.map((item) => item.party).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  )
}

export function findCandidate(
  dataset: ElectionDataset,
  candidateId: string,
): Candidate | undefined {
  return dataset.candidates.find((item) => item.id === candidateId)
}

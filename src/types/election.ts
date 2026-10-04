export type Office = "Presidente" | "Governador" | "Senador" | "Deputado Federal" | "Deputado Estadual"

export type ConnectionStatus = "online" | "updating" | "offline" | "error"

export interface Election {
  id: string
  year: number
  round: 1 | 2
  status: "scheduled" | "counting" | "completed"
}

export interface Candidate {
  id: string
  name: string
  ballotName: string
  party: string
  number: number
  office: Office
  /** UF da candidatura; "BR" para cargos nacionais (Presidente). */
  stateId?: string
}

export interface State {
  id: string
  name: string
  abbreviation: string
  electorate: number
}

export interface VoteCount {
  candidateId: string
  stateId: string
  officeId: Office
  votes: number
  percentage: number
  updatedAt: string
}

export interface VoteSnapshot {
  timestamp: string
  percentageCounted: number
}

export interface ApurationStatus {
  stateId: string
  sectionsTotal: number
  sectionsCounted: number
  percentageCounted: number
  totalVotes: number
  validVotes: number
  blankVotes: number
  nullVotes: number
  abstentions: number
}

export interface StateResult {
  state: State
  status: ApurationStatus
  votes: VoteCount[]
  leader?: Candidate
}

export interface ElectionDataset {
  election: Election
  office: Office
  source: string
  updatedAt: string
  isDemo: boolean
  candidates: Candidate[]
  states: StateResult[]
  snapshots: VoteSnapshot[]
}

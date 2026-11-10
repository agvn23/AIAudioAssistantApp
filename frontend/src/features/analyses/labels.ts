import type { AnalysisStatus, Stage } from '../../api/types'

export const STATUS_LABEL: Record<AnalysisStatus, string> = {
  pending: 'Waiting to start',
  running: 'Analysing',
  done: 'Done',
  failed: 'Failed',
}

export const STAGE_LABEL: Record<Stage, string> = {
  demo: 'Demo',
  mix: 'Mix',
  master: 'Master',
}

export const STAGE_OPTIONS = [
  { value: '', label: 'Not set' },
  { value: 'demo', label: 'Demo' },
  { value: 'mix', label: 'Mix' },
  { value: 'master', label: 'Master' },
]

const STAGES: readonly Stage[] = ['demo', 'mix', 'master']

/** The stage for a select value, or null for "Not set" and anything unknown. */
export function toStage(value: string): Stage | null {
  return STAGES.find((stage) => stage === value) ?? null
}

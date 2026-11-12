/**
 * The AI feedback stored on an analysis. The generated API types describe it as
 * a free-form object, so this module gives it a shape (the one in
 * backend/app/services/feedback/schemas.py, snake_case as stored) and checks it
 * at runtime.
 *
 * The server already verified the feedback, so a malformed required part means
 * the contract changed: parseFeedback returns null and nothing is shown
 * partially (one dropped item could be the high-priority one). Optional parts
 * that are wrong are left out. Evidence paths are kept as plain text and not
 * checked against the metrics, because "reference.*" paths are computed per
 * call and are not stored. Values are kept exactly as stored.
 *
 * null also means "unreadable" only when the raw value was not null: callers
 * check for "no feedback yet" before parsing.
 */

import { isRecord, readNumber } from '../../lib/parse'

export interface FeedbackEvidence {
  metric: string
  value: number
}

export interface FeedbackItem {
  /** Plain strings, so a value the server adds later is still shown. */
  area: string
  priority: string
  observation: string
  suggestion: string
  evidence: FeedbackEvidence[]
}

export interface FeedbackContext {
  genre: string | null
  target_platform: string | null
  stage: string | null
}

export interface FeedbackMeta {
  model: string
  generated_at: string
  context_used: FeedbackContext
  feedback_schema_version: number
}

export interface Feedback {
  summary: string
  items: FeedbackItem[]
  caveats: string[]
  meta?: FeedbackMeta
}

/** A string with some text in it. */
function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function readTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const items: unknown[] = value
  return items.filter((item): item is string => readText(item) !== undefined)
}

function readEvidence(value: unknown): FeedbackEvidence[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const entries: unknown[] = value
  const evidence: FeedbackEvidence[] = []
  for (const entry of entries) {
    if (!isRecord(entry)) return undefined
    const metric = readText(entry.metric)
    const amount = readNumber(entry.value)
    if (metric === undefined || amount === undefined) return undefined
    evidence.push({ metric, value: amount })
  }
  return evidence
}

function readItem(raw: unknown): FeedbackItem | undefined {
  if (!isRecord(raw)) return undefined
  const area = readText(raw.area)
  const priority = readText(raw.priority)
  const observation = readText(raw.observation)
  const suggestion = readText(raw.suggestion)
  const evidence = readEvidence(raw.evidence)
  if (
    area === undefined ||
    priority === undefined ||
    observation === undefined ||
    suggestion === undefined ||
    evidence === undefined
  ) {
    return undefined
  }
  return { area, priority, observation, suggestion, evidence }
}

function readContext(raw: unknown): FeedbackContext | undefined {
  if (!isRecord(raw)) return undefined
  return {
    genre: readText(raw.genre) ?? null,
    target_platform: readText(raw.target_platform) ?? null,
    stage: readText(raw.stage) ?? null,
  }
}

function readMeta(raw: unknown): FeedbackMeta | undefined {
  if (!isRecord(raw)) return undefined
  const model = readText(raw.model)
  const generatedAt = readText(raw.generated_at)
  const contextUsed = readContext(raw.context_used)
  const version = readNumber(raw.feedback_schema_version)
  if (
    model === undefined ||
    generatedAt === undefined ||
    contextUsed === undefined ||
    version === undefined
  ) {
    return undefined
  }
  return {
    model,
    generated_at: generatedAt,
    context_used: contextUsed,
    feedback_schema_version: version,
  }
}

/** The checked feedback, or null when a required part is missing or malformed. */
export function parseFeedback(raw: unknown): Feedback | null {
  if (!isRecord(raw)) return null
  const summary = readText(raw.summary)
  if (summary === undefined || !Array.isArray(raw.items) || raw.items.length === 0) return null

  const rawItems: unknown[] = raw.items
  const items: FeedbackItem[] = []
  for (const rawItem of rawItems) {
    const item = readItem(rawItem)
    if (item === undefined) return null
    items.push(item)
  }

  return {
    summary,
    items,
    caveats: readTextList(raw.caveats),
    meta: readMeta(raw.meta),
  }
}

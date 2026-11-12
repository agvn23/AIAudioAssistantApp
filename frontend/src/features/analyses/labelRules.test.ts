/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LABEL_MAX_LENGTH, validateLabel } from './labelRules'

interface SchemaProperty {
  anyOf?: Array<{ maxLength?: number }>
}

interface Spec {
  components: { schemas: Record<string, { properties?: Record<string, SchemaProperty> }> }
}

// Tests run from frontend/, so the contract is one folder up.
const spec = JSON.parse(
  readFileSync(join(process.cwd(), '..', 'schema', 'openapi.json'), 'utf8'),
) as Spec

function labelLimit(schemaName: string): number | undefined {
  return spec.components.schemas[schemaName]?.properties?.label?.anyOf?.find(
    (option) => option.maxLength !== undefined,
  )?.maxLength
}

describe('validateLabel', () => {
  it('accepts an empty label and a short one', () => {
    expect(validateLabel('')).toBe(true)
    expect(validateLabel('vocals up')).toBe(true)
  })

  it('accepts exactly the limit, ignoring spaces around it', () => {
    expect(validateLabel('a'.repeat(LABEL_MAX_LENGTH))).toBe(true)
    expect(validateLabel(`  ${'a'.repeat(LABEL_MAX_LENGTH)}  `)).toBe(true)
  })

  it('refuses one character more than the limit, with a message', () => {
    expect(validateLabel('a'.repeat(LABEL_MAX_LENGTH + 1))).toBe('Use at most 100 characters')
  })

  it('counts characters, not UTF-16 units', () => {
    expect(validateLabel('😀'.repeat(LABEL_MAX_LENGTH))).toBe(true)
    expect(validateLabel('😀'.repeat(LABEL_MAX_LENGTH + 1))).toBe('Use at most 100 characters')
  })
})

describe('the limit against schema/openapi.json', () => {
  it('matches the PATCH body', () => {
    expect(labelLimit('AnalysisUpdate')).toBe(LABEL_MAX_LENGTH)
  })

  it('matches the upload form body', () => {
    expect(labelLimit('Body_upload_analysis_tracks__track_id__analyses_post')).toBe(
      LABEL_MAX_LENGTH,
    )
  })
})

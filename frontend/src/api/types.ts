import type { components } from './schema'

type Schemas = components['schemas']

export type User = Schemas['UserRead']
export type Track = Schemas['TrackRead']
export type TrackPage = Schemas['TrackPage']
export type TrackCreate = Schemas['TrackCreate']
export type TrackUpdate = Schemas['TrackUpdate']
export type Analysis = Schemas['AnalysisRead']
export type AnalysisSummary = Schemas['AnalysisSummary']
export type AnalysisUpdate = Schemas['AnalysisUpdate']
export type AnalysisStatus = Schemas['AnalysisStatus']
export type Stage = Schemas['Stage']
export type FieldError = Schemas['FieldError']

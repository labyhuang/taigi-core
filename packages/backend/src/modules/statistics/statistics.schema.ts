import { Type, type Static } from '@sinclair/typebox'

// ========== Recompute ==========

export const RecomputeBody = Type.Object({
  scope: Type.Union([
    Type.Literal('session'),
    Type.Literal('cumulative'),
    Type.Literal('all'),
  ]),
  examSessionId: Type.Optional(Type.String({ format: 'uuid' })),
})
export type RecomputeBodyType = Static<typeof RecomputeBody>

export const JobIdParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
export type JobIdParamsType = Static<typeof JobIdParams>

// ========== 單題統計 ==========

export const QuestionStatsParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
export type QuestionStatsParamsType = Static<typeof QuestionStatsParams>

export const QuestionStatsQuery = Type.Object({
  view: Type.Optional(
    Type.Union([Type.Literal('cumulative'), Type.Literal('by-session')], { default: 'cumulative' }),
  ),
})
export type QuestionStatsQueryType = Static<typeof QuestionStatsQuery>

// ========== 試卷統計 ==========

export const PaperStatsParams = Type.Object({
  id: Type.String({ format: 'uuid' }),
})
export type PaperStatsParamsType = Static<typeof PaperStatsParams>

export const PaperStatsQuery = Type.Object({
  examSessionId: Type.Optional(Type.String({ format: 'uuid' })),
})
export type PaperStatsQueryType = Static<typeof PaperStatsQuery>

// ========== Explore ==========

export const ExploreQuery = Type.Object({
  groupBy: Type.String({ minLength: 1 }), // 多選逗號
  examSessionId: Type.Optional(Type.String({ format: 'uuid' })),
  metric: Type.Optional(
    Type.Union([Type.Literal('difficulty'), Type.Literal('discrimination')], {
      default: 'difficulty',
    }),
  ),
  aggregation: Type.Optional(
    Type.Union([Type.Literal('mean'), Type.Literal('median')], { default: 'mean' }),
  ),
})
export type ExploreQueryType = Static<typeof ExploreQuery>

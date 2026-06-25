export const PermissionAction = {
  // 使用者管理
  USER_INVITE: 'user:invite',
  USER_LIST: 'user:list',
  USER_READ: 'user:read',
  USER_DEACTIVATE: 'user:deactivate',
  USER_ASSIGN_ROLE: 'user:assign-role',

  // 題庫管理
  QUESTION_CREATE: 'question:create',
  QUESTION_READ: 'question:read',
  QUESTION_UPDATE: 'question:update',
  QUESTION_DELETE: 'question:delete',
  QUESTION_SUBMIT: 'question:submit',
  QUESTION_REVIEW: 'question:review',
  QUESTION_APPROVE: 'question:approve',
  QUESTION_REJECT: 'question:reject',

  // 測驗組卷
  EXAM_CREATE: 'exam:create',
  EXAM_READ: 'exam:read',
  EXAM_UPDATE: 'exam:update',
  EXAM_DELETE: 'exam:delete',
  EXAM_ASSEMBLE: 'exam:assemble',

  // 多媒體素材
  MEDIA_UPLOAD: 'media:upload',
  MEDIA_READ: 'media:read',
  MEDIA_DELETE: 'media:delete',

  // 考期 / 應答匯入（spec-exam-session.md）
  EXAM_SESSION_CREATE: 'exam-session:create',
  EXAM_SESSION_READ: 'exam-session:read',
  EXAM_SESSION_UPDATE: 'exam-session:update',
  EXAM_SESSION_DELETE: 'exam-session:delete',
  EXAM_SESSION_IMPORT: 'exam-session:import',

  // API client 管理（spec-exam-session.md §7）
  API_CLIENT_MANAGE: 'api-client:manage',

  // 系統管理
  SYSTEM_MANAGE: 'system:manage',
} as const

export type PermissionActionValue =
  (typeof PermissionAction)[keyof typeof PermissionAction]

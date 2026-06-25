/**
 * 試卷輸出 — 純文字渲染（pure functions，不含任何 IO）
 *
 * 規格：specs/spec-export.md
 * 輸入：題目樹（依 orderIndex 排序，含題組父子結構與 media 關聯）
 * 輸出：純文字檔內容 + 媒體檔引用清單（給 ZIP 打包層）
 */

// ========== 題型 banner ==========

export const SUBTYPE_BANNER: Record<string, string> = {
  // GTPT
  GRAMMAR: '閱讀 - 詞彙語法 (GRAMMAR)',
  COMPREHENSION: '閱讀 - 閱讀理解 (COMPREHENSION)',
  CONVERSATION: '聽力 - 對話 (CONVERSATION)',
  SPEECH: '聽力 - 演說 (SPEECH)',
  DICTATION_FILL: '聽寫 (DICTATION_FILL)',
  STORYTELLING: '口說 - 看圖講古 (STORYTELLING)',
  READ_ALOUD: '口說 - 朗讀 (READ_ALOUD)',
  EXPRESSION: '口說 - 口語表達 (EXPRESSION)',
  // TSH
  LISTEN_PICK_IMAGE: '聽力 - 聽話揀圖 (LISTEN_PICK_IMAGE)',
  IMAGE_PICK_ANSWER: '聽力 - 看圖揀話 (IMAGE_PICK_ANSWER)',
  TSH_DIALOGUE: '聽力 - 對話理解 (TSH_DIALOGUE)',
  IMAGE_PICK_SENTENCE: '閱讀 - 看圖揀句 (IMAGE_PICK_SENTENCE)',
  TSH_FILL_BLANK: '閱讀 - 讀句補詞 (TSH_FILL_BLANK)',
  TSH_COMPREHENSION: '閱讀 - 短文理解 (TSH_COMPREHENSION)',
}

// 題型預設指導語（stem 為 null/空時自動套用）
export const SUBTYPE_DEFAULT_INSTRUCTION: Record<string, string> = {
  LISTEN_PICK_IMAGE: '（題型預設指導語）聽看覓，揀 1 个上符合題目意思 ê 圖',
  IMAGE_PICK_ANSWER: '（題型預設指導語）聽看覓，揀 1 个 kap 圖 ê 內容上符合 ê 答案',
  IMAGE_PICK_SENTENCE: '（題型預設指導語）下面 tó 1 句 ê 講法上合這幅圖？',
  DICTATION_FILL: '（題型預設指導語）請以聽 tióh ê 語音來書寫',
  STORYTELLING: '（題型預設指導語）請根據圖內容來進行描述',
}

// 題組類型（spec-question-bank.md：父子結構）
const GROUP_SUBTYPES = new Set(['COMPREHENSION', 'SPEECH'])

const SEPARATOR = '='.repeat(80)
const SUB_SEPARATOR = '-'.repeat(40)

// ========== 型別 ==========

export interface RenderedMedia {
  id: string
  filename: string
  mimeType: string
}

export interface RenderedQuestionMedia {
  purpose: 'AUDIO' | 'IMAGE' | 'OPTION_IMAGE' | string
  media: RenderedMedia
}

export interface QuestionContent {
  options?: { id: string; text?: string; mediaId?: string }[]
}

export interface QuestionAnswer {
  correctOptionIds?: string[]
  correctText?: string
  acceptableAlternatives?: string[]
  transcript?: string
  gradingRubric?: string
}

export interface RenderedQuestion {
  id: string
  category: string
  type: string
  subType: string
  stem: string | null
  content: QuestionContent | null
  answer: QuestionAnswer | null
  isGroupParent: boolean
  groupId: string | null
  questionMedia: RenderedQuestionMedia[]
}

export interface RenderedPaperQuestion {
  orderIndex: number
  score: number
  question: RenderedQuestion
}

export interface RenderedPaperInput {
  id: string
  name: string
  status: string
  blueprintSnapshot: unknown
  blueprintCategory: string
  totalQuestions: number
  totalScore: number
  generatedAt: Date
  questions: RenderedPaperQuestion[]
}

/** ZIP 內媒體引用，包含 ZIP 內檔名與來源 mediaId（用於 service 層讀檔）。 */
export interface MediaRef {
  mediaId: string
  filename: string         // ZIP 內路徑（不含 audio/ 或 images/ 前綴；由 purpose 推得）
  mimeType: string
  purpose: 'AUDIO' | 'IMAGE' | 'OPTION_IMAGE'
}

export interface FormatterOutput {
  text: string
  mediaRefs: MediaRef[]
  warnings: string[]
}

// ========== Mime → ext ==========

const MIME_EXT_MAP: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function extFromMime(mime: string): string {
  return MIME_EXT_MAP[mime.toLowerCase()] ?? 'bin'
}

const OPTION_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

// ========== 題目樹（將父題與子題收攏） ==========

interface SingleItem {
  kind: 'single'
  displayNumber: number      // 卷面題號
  score: number
  question: RenderedQuestion
}

interface GroupItem {
  kind: 'group'
  parent: RenderedQuestion
  parentScore: number        // 通常為 0
  startNumber: number        // 子題第一題的卷面題號
  endNumber: number          // 子題最後一題的卷面題號
  totalScore: number         // 子題配分總和
  children: { displayNumber: number; score: number; question: RenderedQuestion }[]
}

type RenderItem = SingleItem | GroupItem

interface Section {
  subType: string
  items: RenderItem[]
  totalCount: number          // 給 banner 顯示，single = items.length；group 則為 sub group count
  totalChildCount: number     // 子題總數（group 用），non-group 則 = items.length
  hasGroup: boolean
}

/**
 * 把 paper.questions 走過一次，組成（依出現順序的）section 陣列。
 * - 同 subType 連續的題目歸到同一 section
 * - 題組父題開新的 GroupItem，後續 groupId 指向它的子題加入該 GroupItem
 * - 卷面題號：group parent 不佔號；child 與 ungrouped 各自佔一號
 */
function buildSections(questions: RenderedPaperQuestion[]): Section[] {
  const sections: Section[] = []
  let currentSection: Section | null = null
  let currentGroup: GroupItem | null = null
  let displayNumber = 0

  const flushGroup = (): void => {
    if (currentGroup) {
      currentGroup.endNumber = currentGroup.children.at(-1)?.displayNumber ?? currentGroup.startNumber
      currentGroup.totalScore = currentGroup.children.reduce((s, c) => s + c.score, 0)
      currentGroup = null
    }
  }

  const ensureSection = (subType: string): Section => {
    if (currentSection && currentSection.subType === subType) return currentSection
    flushGroup()
    const next: Section = {
      subType,
      items: [],
      totalCount: 0,
      totalChildCount: 0,
      hasGroup: false,
    }
    sections.push(next)
    currentSection = next
    return next
  }

  for (const pq of questions) {
    const q = pq.question
    const sec = ensureSection(q.subType)

    if (q.isGroupParent) {
      flushGroup()
      const groupItem: GroupItem = {
        kind: 'group',
        parent: q,
        parentScore: pq.score,
        startNumber: displayNumber + 1,    // 暫填，後續子題加入時若有差會修正
        endNumber: displayNumber + 1,
        totalScore: 0,
        children: [],
      }
      sec.items.push(groupItem)
      sec.hasGroup = true
      currentGroup = groupItem
      // parent 不佔號
    } else if (q.groupId && currentGroup && currentGroup.parent.id === q.groupId) {
      displayNumber += 1
      if (currentGroup.children.length === 0) {
        currentGroup.startNumber = displayNumber
      }
      currentGroup.children.push({
        displayNumber,
        score: pq.score,
        question: q,
      })
    } else {
      // 一般題（或子題前面沒對到父題的 fallback：當作獨立題處理）
      flushGroup()
      displayNumber += 1
      sec.items.push({
        kind: 'single',
        displayNumber,
        score: pq.score,
        question: q,
      })
    }
  }

  flushGroup()

  // 聚合 section 統計
  for (const sec of sections) {
    sec.totalCount = sec.items.length
    sec.totalChildCount = sec.items.reduce((s, it) => {
      return s + (it.kind === 'group' ? it.children.length : 1)
    }, 0)
  }

  return sections
}

// ========== 媒體檔名工具 ==========

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

interface MediaPlanItem {
  ref: MediaRef
  /** 給文字檔占位符使用的檔名（不含 audio/ 或 images/ 前綴） */
  displayName: string
}

/**
 * 為單一題目（與父題的共用媒體）規劃媒體 ZIP 內檔名。
 * 回傳：
 *  - audio: 該題的音檔占位資訊（最多 1 個）
 *  - stemImages: 題幹圖片（可多張，STORYTELLING 等）
 *  - optionImages: 選項圖片（LISTEN_PICK_IMAGE，依 content.options 順序對到 A/B/C/D）
 */
function planMediaForQuestion(
  questionNumber: number,
  question: RenderedQuestion,
): {
  audio: MediaPlanItem | null
  stemImages: MediaPlanItem[]
  optionImages: Map<string, MediaPlanItem>      // optionId → plan
} {
  const stemImages: MediaPlanItem[] = []
  let audio: MediaPlanItem | null = null
  const optionImages = new Map<string, MediaPlanItem>()

  // 先處理選項圖片（IMAGE_OPTION_SUBTYPE）：用 optionId 對應 A/B/C/D
  const options = question.content?.options ?? []
  options.forEach((opt, idx) => {
    if (!opt.mediaId) return
    const m = question.questionMedia.find((qm) => qm.media.id === opt.mediaId)
    if (!m) return
    const label = OPTION_LABELS[idx] ?? String(idx + 1)
    const ext = extFromMime(m.media.mimeType)
    const filename = `Q${pad2(questionNumber)}_option${label}.${ext}`
    optionImages.set(opt.id, {
      ref: {
        mediaId: m.media.id,
        filename,
        mimeType: m.media.mimeType,
        purpose: 'OPTION_IMAGE',
      },
      displayName: filename,
    })
  })

  for (const qm of question.questionMedia) {
    // 已被當成 OPTION_IMAGE 處理的略過（避免重覆）
    const usedAsOption = [...optionImages.values()].some((p) => p.ref.mediaId === qm.media.id)
    if (usedAsOption) continue

    const ext = extFromMime(qm.media.mimeType)

    if (qm.purpose === 'AUDIO') {
      if (audio) continue   // 同題只取第一個音檔
      const filename = `Q${pad2(questionNumber)}_audio.${ext}`
      audio = {
        ref: {
          mediaId: qm.media.id,
          filename,
          mimeType: qm.media.mimeType,
          purpose: 'AUDIO',
        },
        displayName: filename,
      }
    } else if (qm.purpose === 'IMAGE') {
      const idx = stemImages.length + 1
      const suffix = idx === 1 ? '_stem' : `_stem${idx}`
      const filename = `Q${pad2(questionNumber)}${suffix}.${ext}`
      stemImages.push({
        ref: {
          mediaId: qm.media.id,
          filename,
          mimeType: qm.media.mimeType,
          purpose: 'IMAGE',
        },
        displayName: filename,
      })
    }
  }

  return { audio, stemImages, optionImages }
}

// ========== 渲染單題 ==========

function renderOptions(
  question: RenderedQuestion,
  optionImages: Map<string, MediaPlanItem>,
): string[] {
  const lines: string[] = []
  const options = question.content?.options ?? []
  options.forEach((opt, idx) => {
    const label = OPTION_LABELS[idx] ?? String(idx + 1)
    const optionImage = optionImages.get(opt.id)
    if (optionImage) {
      lines.push(`  (${label}) [IMAGE: ${optionImage.displayName}]`)
    } else {
      const text = opt.text ?? ''
      lines.push(`  (${label}) ${text}`)
    }
  })
  return lines
}

function getStemForRender(question: RenderedQuestion): string {
  const stem = question.stem?.trim() ?? ''
  if (stem.length > 0) return stem
  return SUBTYPE_DEFAULT_INSTRUCTION[question.subType] ?? ''
}

function renderSingle(
  item: SingleItem,
  collectedRefs: MediaRef[],
): string[] {
  const { displayNumber, score, question } = item
  const lines: string[] = []
  const plan = planMediaForQuestion(displayNumber, question)

  // 收集 mediaRefs（給 ZIP 用）
  if (plan.audio) collectedRefs.push(plan.audio.ref)
  for (const img of plan.stemImages) collectedRefs.push(img.ref)
  for (const opt of plan.optionImages.values()) collectedRefs.push(opt.ref)

  lines.push(`第 ${displayNumber} 題（${score} 分）`)
  if (plan.audio) lines.push(`[AUDIO: ${plan.audio.displayName}]`)
  for (const img of plan.stemImages) lines.push(`[IMAGE: ${img.displayName}]`)

  const stem = getStemForRender(question)
  if (stem.length > 0) lines.push(`題幹：${stem}`)

  // 選項：選擇題才印（含圖片選項題）
  if (question.content?.options && question.content.options.length > 0) {
    lines.push(...renderOptions(question, plan.optionImages))
  } else if (question.subType === 'DICTATION_FILL') {
    lines.push('  ＿＿＿＿＿＿＿＿＿＿＿＿（請依音檔內容書寫）')
  }

  return lines
}

function renderGroup(
  item: GroupItem,
  collectedRefs: MediaRef[],
): string[] {
  const lines: string[] = []
  // 父題的共用媒體用首個子題編號
  const parentDisplayNumber = item.startNumber
  const parentPlan = planMediaForQuestion(parentDisplayNumber, item.parent)
  if (parentPlan.audio) collectedRefs.push(parentPlan.audio.ref)
  for (const img of parentPlan.stemImages) collectedRefs.push(img.ref)
  // 父題不會有 option image（題組父題無選項）

  const range = item.startNumber === item.endNumber
    ? `第 ${item.startNumber} 題`
    : `第 ${item.startNumber}–${item.endNumber} 題`

  lines.push(`${range}（題組，共 ${item.totalScore} 分）`)
  if (parentPlan.audio) lines.push(`[AUDIO: ${parentPlan.audio.displayName}]`)
  for (const img of parentPlan.stemImages) lines.push(`[IMAGE: ${img.displayName}]`)

  const parentStem = getStemForRender(item.parent)
  if (parentStem.length > 0) {
    lines.push('')
    lines.push('[題組共用題幹]')
    lines.push(parentStem)
  }

  for (const child of item.children) {
    lines.push('')
    lines.push(...renderSingle(
      { kind: 'single', displayNumber: child.displayNumber, score: child.score, question: child.question },
      collectedRefs,
    ))
  }

  return lines
}

// ========== 解答 / 逐字稿 / 評分標準 區塊 ==========

interface AnswerRow {
  displayNumber: number
  question: RenderedQuestion
  score: number
}

function collectAnswerRows(sections: Section[]): AnswerRow[] {
  const rows: AnswerRow[] = []
  for (const sec of sections) {
    for (const item of sec.items) {
      if (item.kind === 'single') {
        rows.push({ displayNumber: item.displayNumber, question: item.question, score: item.score })
      } else {
        for (const child of item.children) {
          rows.push({
            displayNumber: child.displayNumber,
            question: child.question,
            score: child.score,
          })
        }
      }
    }
  }
  return rows
}

function renderAnswerKey(rows: AnswerRow[]): string[] {
  const lines: string[] = []
  lines.push('題號  正確答案')
  lines.push('----  --------')
  for (const r of rows) {
    const correct = formatCorrectAnswer(r.question)
    lines.push(`${r.displayNumber.toString().padStart(4, ' ')}   ${correct}`)
  }
  return lines
}

function formatCorrectAnswer(q: RenderedQuestion): string {
  // 選擇題：對應 option 的字母
  const correctIds = q.answer?.correctOptionIds ?? []
  if (correctIds.length > 0 && q.content?.options) {
    const labels = correctIds
      .map((id) => {
        const idx = q.content!.options!.findIndex((o) => o.id === id)
        return idx >= 0 ? OPTION_LABELS[idx] ?? `(?)` : '(?)'
      })
      .join(', ')
    return labels
  }
  // 聽寫題
  if (q.answer?.correctText) {
    const alt = q.answer.acceptableAlternatives && q.answer.acceptableAlternatives.length > 0
      ? `（亦可：${q.answer.acceptableAlternatives.join(' / ')}）`
      : ''
    return `${q.answer.correctText}${alt}`
  }
  // 口說題：見評分標準
  if (q.answer?.gradingRubric) {
    return '（依評分標準）'
  }
  return '—'
}

function renderTranscripts(rows: AnswerRow[]): string[] {
  const filtered = rows.filter((r) => {
    const t = r.question.answer?.transcript?.trim()
    return typeof t === 'string' && t.length > 0
  })
  if (filtered.length === 0) return []

  const lines: string[] = []
  lines.push(SEPARATOR)
  lines.push('逐字稿（聽力題用）：')
  lines.push(SEPARATOR)
  lines.push('')
  for (const r of filtered) {
    lines.push(`第 ${r.displayNumber} 題（${r.question.subType}）：`)
    lines.push(r.question.answer!.transcript!.trim())
    lines.push('')
  }
  return lines
}

function renderRubrics(rows: AnswerRow[]): string[] {
  const filtered = rows.filter((r) => {
    const g = r.question.answer?.gradingRubric?.trim()
    return typeof g === 'string' && g.length > 0
  })

  const lines: string[] = []
  lines.push(SEPARATOR)
  lines.push('評分標準（口說 / 聽寫題用）：')
  lines.push(SEPARATOR)
  lines.push('')
  if (filtered.length === 0) {
    lines.push('（本卷無此題型，略）')
    return lines
  }
  for (const r of filtered) {
    lines.push(`第 ${r.displayNumber} 題（${r.question.subType}）：`)
    lines.push(r.question.answer!.gradingRubric!.trim())
    lines.push('')
  }
  return lines
}

// ========== Section banner ==========

function bannerLabel(subType: string): string {
  return SUBTYPE_BANNER[subType] ?? subType
}

function sectionBanner(sec: Section): string[] {
  const lines: string[] = []
  lines.push(SEPARATOR)
  if (sec.hasGroup) {
    const groupCount = sec.items.filter((i) => i.kind === 'group').length
    const childCount = sec.items.reduce(
      (s, it) => s + (it.kind === 'group' ? it.children.length : 1),
      0,
    )
    lines.push(`【${bannerLabel(sec.subType)}】共 ${groupCount} 題組（${childCount} 個子題）`)
  } else {
    lines.push(`【${bannerLabel(sec.subType)}】共 ${sec.totalCount} 題`)
  }
  lines.push(SEPARATOR)
  return lines
}

// ========== 主入口 ==========

/**
 * 把試卷結構渲染成純文字檔。
 * 所有 IO（讀媒體檔、寫 ZIP）都不在此處——僅回傳 text + mediaRefs 給上層 service。
 */
export function renderPaperToText(paper: RenderedPaperInput): FormatterOutput {
  const warnings: string[] = []
  const collectedRefs: MediaRef[] = []
  const sections = buildSections(paper.questions)

  const lines: string[] = []

  // ===== 表頭 =====
  lines.push(SEPARATOR)
  lines.push(`試卷名稱：${paper.name}`)
  lines.push(`考試類型：${paper.blueprintCategory}`)
  lines.push(
    `總題數：${paper.totalQuestions} 題    總分：${paper.totalScore} 分`,
  )
  lines.push(`狀態：${paper.status}`)
  lines.push(`產生時間：${formatDate(paper.generatedAt)}`)
  lines.push('藍圖快照：見 blueprint_snapshot.json（zip 內附）')
  lines.push(SEPARATOR)
  lines.push('')

  // ===== 各題型區塊 =====
  for (const sec of sections) {
    lines.push('')
    lines.push(...sectionBanner(sec))
    lines.push('')

    for (const item of sec.items) {
      if (item.kind === 'single') {
        lines.push(...renderSingle(item, collectedRefs))
      } else {
        lines.push(...renderGroup(item, collectedRefs))
      }
      lines.push('')
      lines.push('')
    }
  }

  // ===== 解答區 =====
  lines.push('')
  lines.push(SEPARATOR)
  lines.push(SEPARATOR)
  lines.push('                              【解 答】                              ')
  lines.push(SEPARATOR)
  lines.push(SEPARATOR)
  lines.push('')

  const rows = collectAnswerRows(sections)
  lines.push(...renderAnswerKey(rows))
  lines.push('')

  // ===== 逐字稿 =====
  lines.push(...renderTranscripts(rows))

  // ===== 評分標準 =====
  lines.push(...renderRubrics(rows))

  lines.push(SEPARATOR)

  // 媒體檔重複偵測
  const seen = new Set<string>()
  const dedupRefs = collectedRefs.filter((ref) => {
    const key = `${ref.mediaId}|${ref.filename}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 警告：題目參照的 mediaId 不存在於 questionMedia（理論不會發生，但防呆）
  for (const pq of paper.questions) {
    const optionMediaIds = (pq.question.content?.options ?? []).map((o) => o.mediaId).filter((m): m is string => Boolean(m))
    const linkedIds = new Set(pq.question.questionMedia.map((qm) => qm.media.id))
    for (const mid of optionMediaIds) {
      if (!linkedIds.has(mid)) {
        warnings.push(`題目 ${pq.question.id} 的 option 參照 mediaId=${mid}，但無對應 questionMedia。`)
      }
    }
  }

  return {
    text: lines.join('\n'),
    mediaRefs: dedupRefs,
    warnings,
  }
}

// 工具：給檔名與表頭使用的時間格式
function formatDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const HH = String(d.getHours()).padStart(2, '0')
  const MM = String(d.getMinutes()).padStart(2, '0')
  const SS = String(d.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${HH}:${MM}:${SS}`
}

// ========== ZIP 內 README 樣板 ==========

export const README_TEXT = `================================================================================
試卷檔案說明（請勿將此檔印入正式試卷）
================================================================================

本 ZIP 包含：

1. paper.txt
   試卷正文（純文字）。內含題目、選項、解答、逐字稿、評分標準。
   排版時請以 paper.txt 為主，把 [AUDIO: ...] 與 [IMAGE: ...] 占位符
   替換為對應的 audio/images 檔案。

2. blueprint_snapshot.json
   組卷時的雙向細目表（藍圖）原始設定，供查核試卷組成依據。

3. audio/
   題幹音檔，命名為 Q{題號}_audio.{ext}。

4. images/
   題幹／選項圖片。命名規則：
     - Q{題號}_stem.jpg     題幹圖片
     - Q{題號}_stem1.jpg    題幹多張圖中的第 1 張
     - Q{題號}_optionA.jpg  選項 A 的圖片（依 content.options 順序對到 A/B/C/D）
     - Q{題號}_optionB.jpg  選項 B 的圖片
     ...

----------------------------------------------------------------------
注意事項：
- 解答區與逐字稿請印於另一張紙，或標註為「教師用卷」
- 圖片若需上色或重繪，請與題庫管理員確認版權
================================================================================
`

// ========== 檔名清理（給 zip 檔名用） ==========

export function sanitizeFilename(input: string): string {
  // 只保留中英文、數字、底線、橫線；其他全替換為底線
  const cleaned = input.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')
  return cleaned.length > 0 ? cleaned : 'paper'
}

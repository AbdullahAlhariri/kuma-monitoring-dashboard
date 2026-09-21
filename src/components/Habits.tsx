'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type ViewMode = 'graph' | 'classic'

const LONG_PRESS_MS = 550
/** Days shown by the classic dot row. */
const CLASSIC_DAYS = 14

export interface HistoryDay {
  date: string
  dayName: string
  dayNum: string
  dow: number
  monthLabel: string
  isToday: boolean
  done: boolean
  isSkipped: boolean
  color?: string | null
  tagText?: string | null
}

export interface TagOption {
  tag: string
  color: string
}

export interface Habit {
  id: string
  name: string
  star: boolean
  todayDone: boolean
  todayColor?: string | null
  streak: number
  streakLenient: number
  streakStrict: number
  /** true = a missed day resets the streak */
  strictStreak: boolean
  showStreak: boolean
  view: ViewMode
  history: HistoryDay[]
  availableTags: TagOption[]
  visualization?: string | null
}

interface HabitUiConfig {
  hideCompleted?: boolean
  twoColumns?: boolean
  order?: string[]
}

/** Applies the saved order, appending habits the config hasn't seen yet. */
function sortByConfigOrder(habits: Habit[], order?: string[]): Habit[] {
  if (!order || order.length === 0) return habits
  const rank = new Map(order.map((name, i) => [name, i]))
  return [...habits].sort(
    (a, b) => (rank.get(a.name) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.name) ?? Number.MAX_SAFE_INTEGER)
  )
}

interface HabitsApiResponse {
  habits: Habit[]
  ui: HabitUiConfig
  fetchedAt: string
}

type ApiResponse = HabitsApiResponse | { error: string }

function parseWakeUpTime(text?: string | null): { val: number; label: string } | null {
  if (!text) return null
  const lower = text.toLowerCase()
  if (lower.includes('late')) {
    return { val: 9.0, label: 'LATE' }
  }
  const match = /#?(\d+(\.\d+)?)/.exec(text)
  if (match) {
    const val = parseFloat(match[1])
    const hrs = Math.floor(val)
    const mins = Math.round((val - hrs) * 60)
    const label = `${hrs}:${mins < 10 ? '0' : ''}${mins}`
    return { val, label }
  }
  return null
}

function parseDurationMinutes(text?: string | null): { val: number; label: string } | null {
  if (!text) return null
  const hourMatch = /#?(\d+(\.\d+)?)\s*(hour|hr|h)/i.exec(text)
  if (hourMatch) {
    const hrs = parseFloat(hourMatch[1])
    return { val: hrs * 60, label: `${hrs}h` }
  }
  const minMatch = /#?(\d+(\.\d+)?)\s*(min|minute|m)/i.exec(text)
  if (minMatch) {
    const mins = parseFloat(minMatch[1])
    return { val: mins, label: `${mins}m` }
  }
  const numMatch = /#?(\d+(\.\d+)?)/.exec(text)
  if (numMatch) {
    const val = parseFloat(numMatch[1])
    return { val, label: `${val}m` }
  }
  return null
}

function getReadingColorForMinutes(mins: number, isQuran = false): string {
  if (isQuran) {
    if (mins <= 20) return '#3b82f6' // 15m -> Blue
    if (mins <= 35) return '#06b6d4' // 30m -> Teal / Cyan
    if (mins <= 50) return '#10b981' // 45m -> Emerald Green
    return '#22c55e'                 // 1h+ -> Bright Green
  }
  // Read other: 15m Blue, all higher durations Light Green to Darker Green
  if (mins <= 20) return '#3b82f6'   // 15m -> Blue
  if (mins <= 35) return '#4ade80'   // 30m -> Light Green
  if (mins <= 50) return '#22c55e'   // 45m -> Green
  return '#16a34a'                   // 1h+ -> Darker Forest Green
}

/**
 * Colour of a completed day. Tag colours (resolved server side from
 * habit-tags.json / Beaver ##color directives) always win; duration habits fall
 * back to the same blue → green scale the bar charts used.
 */
function getDayColor(habit: Habit, day: HistoryDay): string {
  if (day.color) return day.color
  const name = habit.name.toLowerCase()
  if (name.includes('read') || name.includes('quran')) {
    const mins = parseDurationMinutes(day.tagText)?.val ?? 30
    return getReadingColorForMinutes(mins, name.includes('quran'))
  }
  return '#22c55e'
}

/** Short value shown in the cell tooltip, e.g. "6:30" or "45m". */
function getDayLabel(habit: Habit, day: HistoryDay): string {
  const name = habit.name.toLowerCase()
  if (name.includes('woke')) {
    return parseWakeUpTime(day.tagText)?.label ?? 'Done'
  }
  if (name.includes('read') || name.includes('quran')) {
    return parseDurationMinutes(day.tagText)?.label ?? 'Done'
  }
  return 'Done'
}

/** Splits the day range into Monday-first columns, like the GitHub graph. */
function chunkIntoWeeks(days: HistoryDay[]): HistoryDay[][] {
  const weeks: HistoryDay[][] = []
  for (const day of days) {
    if (weeks.length === 0 || day.dow === 0) {
      weeks.push([])
    }
    weeks[weeks.length - 1].push(day)
  }
  return weeks
}

/** Month caption per column: printed on the first column of each new month. */
function getMonthLabels(weeks: HistoryDay[][]): (string | null)[] {
  let previous = ''
  return weeks.map((week) => {
    const label = week[0].monthLabel
    if (label === previous) return null
    previous = label
    return label
  })
}

interface HabitsProps {
  isKumaFolded?: boolean
}

export default function Habits({ isKumaFolded = true }: HabitsProps) {
  const [data, setData] = useState<HabitsApiResponse | null>(null)
  const [error, setError] = useState(false)
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [activeModalHabit, setActiveModalHabit] = useState<Habit | null>(null)
  const [settingsHabit, setSettingsHabit] = useState<Habit | null>(null)
  const [draggingName, setDraggingName] = useState<string | null>(null)
  /** Live order while a drag is in flight; committed to the JSON on drop. */
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null)
  /** Cards only become draggable once the grip is pressed. */
  const [dragArmedName, setDragArmedName] = useState<string | null>(null)

  // FLIP: remember where every card was, so a reorder animates instead of jumping
  const cardRefs = useRef(new Map<string, HTMLDivElement>())
  const prevRects = useRef(new Map<string, DOMRect>())
  const flipAnims = useRef(new Map<string, Animation>())

  // Long press opens the per-habit settings sheet; the click that ends the
  // press must not fall through to the tag modal.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

  const fetchHabits = (): void => {
    fetch('/api/habits')
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((d) => {
        if ('error' in d) {
          setError(true)
        } else {
          setData(d)
          setError(false)
        }
      })
      .catch(() => {
        setError(true)
      })
  }

  useEffect(() => {
    fetchHabits()
    const id = setInterval(fetchHabits, 10_000)
    return () => {
      clearInterval(id)
    }
  }, [])

  // Animate cards from their previous position to the new one (FLIP), so the
  // preview reorder reads as movement rather than a jump.
  useLayoutEffect(() => {
    // Cancel anything in flight FIRST: a running animation offsets the element,
    // and measuring it would fold that offset into the next delta — which is
    // what made repeated dragover renders compound into a jitter.
    for (const anim of flipAnims.current.values()) {
      anim.cancel()
    }
    flipAnims.current.clear()

    const rects = new Map<string, DOMRect>()
    for (const [name, el] of cardRefs.current) {
      rects.set(name, el.getBoundingClientRect())
    }

    for (const [name, el] of cardRefs.current) {
      const rect = rects.get(name)
      const old = prevRects.current.get(name)
      // The dragged card is already following the cursor — leave it alone
      if (!rect || !old || name === draggingName) continue

      const dx = old.left - rect.left
      const dy = old.top - rect.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue

      const anim = el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
        { duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
      )
      flipAnims.current.set(name, anim)
      anim.addEventListener('finish', () => flipAnims.current.delete(name))
    }

    prevRects.current = rects
  })

  // Listen for Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveModalHabit(null)
        setSettingsHabit(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  /** Writes a habit's display settings straight into habit-tags.json. */
  const patchHabitSettings = async (
    habit: Habit,
    patch: { view?: ViewMode; showStreak?: boolean; strictNoSkip?: boolean }
  ) => {
    // Optimistic: reflect the change before the file write round-trips
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        habits: prev.habits.map((h) =>
          h.id === habit.id
            ? {
                ...h,
                view: patch.view ?? h.view,
                showStreak: patch.showStreak ?? h.showStreak,
                strictStreak: patch.strictNoSkip ?? h.strictStreak,
                streak: (patch.strictNoSkip ?? h.strictStreak) ? h.streakStrict : h.streakLenient,
              }
            : h
        ),
      }
    })
    setSettingsHabit((prev) =>
      prev?.id === habit.id
        ? {
            ...prev,
            view: patch.view ?? prev.view,
            showStreak: patch.showStreak ?? prev.showStreak,
            strictStreak: patch.strictNoSkip ?? prev.strictStreak,
          }
        : prev
    )

    try {
      const res = await fetch('/api/habits/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitName: habit.name, habit: patch }),
      })
      if (!res.ok) fetchHabits()
    } catch {
      fetchHabits()
    }
  }

  /** Writes a tag's colour into habit-tags.json under that habit. */
  const patchTagColor = async (habit: Habit, tag: string, color: string) => {
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        habits: prev.habits.map((h) =>
          h.id === habit.id
            ? {
                ...h,
                availableTags: h.availableTags.map((t) => (t.tag === tag ? { ...t, color } : t)),
              }
            : h
        ),
      }
    })
    setSettingsHabit((prev) =>
      prev?.id === habit.id
        ? { ...prev, availableTags: prev.availableTags.map((t) => (t.tag === tag ? { ...t, color } : t)) }
        : prev
    )

    try {
      const res = await fetch('/api/habits/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ habitName: habit.name, tags: { [tag]: color } }),
      })
      if (!res.ok) fetchHabits()
    } catch {
      fetchHabits()
    }
  }

  /** Persists a panel-level preference into habit-tags.json. */
  const patchUi = async (patch: HabitUiConfig) => {
    setData((prev) => (prev ? { ...prev, ui: { ...prev.ui, ...patch } } : prev))

    try {
      const res = await fetch('/api/habits/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui: patch }),
      })
      if (!res.ok) fetchHabits()
    } catch {
      fetchHabits()
    }
  }

  /**
   * Shows, while still dragging, where the card would land. The slot comes from
   * which half of the target the pointer is over, so holding still can never
   * flip-flop between two orders.
   */
  const previewMove = (targetName: string, after: boolean) => {
    if (!data || !draggingName || draggingName === targetName) return

    // Reorder the full list, not just the visible subset, so hidden habits keep
    // their place when "hide done" is switched back off.
    const base = previewOrder ?? sortByConfigOrder(data.habits, data.ui.order).map((h) => h.name)
    const next = base.filter((n) => n !== draggingName)
    const idx = next.indexOf(targetName)
    if (idx < 0) return

    next.splice(after ? idx + 1 : idx, 0, draggingName)
    if (next.every((n, i) => n === base[i])) return
    setPreviewOrder(next)
  }

  const endDrag = (commit: boolean) => {
    const order = previewOrder
    setDraggingName(null)
    setPreviewOrder(null)
    if (commit && order) {
      void patchUi({ order })
    }
  }

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const startLongPress = (habit: Habit) => {
    clearLongPress()
    longPressFired.current = false
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setSettingsHabit(habit)
    }, LONG_PRESS_MS)
  }

  const handleCardClick = (habit: Habit) => {
    if (longPressFired.current) {
      longPressFired.current = false
      return
    }
    if (habit.availableTags.length > 0) {
      setActiveModalHabit(habit)
    } else {
      void toggleTodaySimple(habit)
    }
  }

  const toggleTodaySimple = async (habit: Habit) => {
    if (toggling[habit.id]) return

    const newTodayDone = !habit.todayDone
    setToggling((prev) => ({ ...prev, [habit.id]: true }))

    // Optimistic UI update
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        habits: prev.habits.map((h) => {
          if (h.id !== habit.id) return h
          const newHistory = h.history.map((day) =>
            day.isToday ? { ...day, done: newTodayDone } : day
          )
          let newStreak = h.streak
          if (newTodayDone) {
            newStreak += 1
          } else {
            newStreak = Math.max(0, newStreak - 1)
          }
          return {
            ...h,
            todayDone: newTodayDone,
            streak: newStreak,
            history: newHistory,
          }
        }),
      }
    })

    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          habitId: habit.id,
          done: newTodayDone,
        }),
      })

      if (!res.ok) {
        fetchHabits()
      }
    } catch {
      fetchHabits()
    } finally {
      setToggling((prev) => ({ ...prev, [habit.id]: false }))
    }
  }

  const completeWithTag = async (habit: Habit, tagOption?: TagOption) => {
    if (toggling[habit.id]) return

    setActiveModalHabit(null)
    setToggling((prev) => ({ ...prev, [habit.id]: true }))

    const tagText = tagOption ? `#${tagOption.tag}` : undefined
    const tagColor = tagOption ? tagOption.color : null

    // Optimistic UI update
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        habits: prev.habits.map((h) => {
          if (h.id !== habit.id) return h
          const newHistory = h.history.map((day) =>
            day.isToday ? { ...day, done: true, color: tagColor, tagText } : day
          )
          let newStreak = h.streak
          if (!h.todayDone) {
            newStreak += 1
          }
          return {
            ...h,
            todayDone: true,
            todayColor: tagColor,
            streak: newStreak,
            history: newHistory,
          }
        }),
      }
    })

    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          habitId: habit.id,
          done: true,
          text: tagText,
        }),
      })

      if (!res.ok) {
        fetchHabits()
      }
    } catch {
      fetchHabits()
    } finally {
      setToggling((prev) => ({ ...prev, [habit.id]: false }))
    }
  }

  const markPending = async (habit: Habit) => {
    if (toggling[habit.id]) return

    setActiveModalHabit(null)
    setToggling((prev) => ({ ...prev, [habit.id]: true }))

    // Optimistic UI update
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        habits: prev.habits.map((h) => {
          if (h.id !== habit.id) return h
          const newHistory = h.history.map((day) =>
            day.isToday ? { ...day, done: false, color: null, tagText: null } : day
          )
          const newStreak = Math.max(0, h.streak - 1)
          return {
            ...h,
            todayDone: false,
            todayColor: null,
            streak: newStreak,
            history: newHistory,
          }
        }),
      }
    })

    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          habitId: habit.id,
          done: false,
        }),
      })

      if (!res.ok) {
        fetchHabits()
      }
    } catch {
      fetchHabits()
    } finally {
      setToggling((prev) => ({ ...prev, [habit.id]: false }))
    }
  }

  if (error) {
    return (
      <div className="h-err">
        <span>●</span> Habits unreachable
      </div>
    )
  }

  if (!data) {
    return <div className="h-loading">Loading habits…</div>
  }

  const hideCompleted = data.ui.hideCompleted ?? false
  const twoColumns = data.ui.twoColumns ?? false
  // While dragging, the preview order drives the layout so cards slide into the
  // slot the drop would give them.
  const ordered = sortByConfigOrder(data.habits, previewOrder ?? data.ui.order)
  const visibleHabits = hideCompleted ? ordered.filter((h) => !h.todayDone) : ordered

  return (
    <div className="h-root">
      <div className="h-toolbar">
        <label className="h-check">
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(e) => {
              void patchUi({ hideCompleted: e.target.checked })
            }}
          />
          <span>Hide done</span>
        </label>

        <label className="h-check">
          <input
            type="checkbox"
            checked={twoColumns}
            onChange={(e) => {
              void patchUi({ twoColumns: e.target.checked })
            }}
          />
          <span>2 per row</span>
        </label>
      </div>

      <div
        className={`h-grid ${isKumaFolded ? '' : 'h-grid--compact'} ${twoColumns ? 'h-grid--two' : ''}`}
      >
        {visibleHabits.map((h) => {
          // An expanded Kuma leaves no room for graphs, so every habit falls
          // back to the dot row until it collapses again. The saved setting in
          // habit-tags.json is untouched.
          const mode: ViewMode = isKumaFolded ? h.view : 'classic'
          const showStreak = h.showStreak
          const strictStreak = h.strictStreak
          const streak = strictStreak ? h.streakStrict : h.streakLenient
          const allWeeks = chunkIntoWeeks(h.history)
          // Half the width means half the history, so the squares stay readable
          const weeks = twoColumns ? allWeeks.slice(Math.floor(allWeeks.length / 2)) : allWeeks
          const monthLabels = getMonthLabels(weeks)

          const cardStyle =
            h.todayDone && h.todayColor
              ? {
                  background: `linear-gradient(90deg, ${h.todayColor}26 0%, ${h.todayColor}08 100%)`,
                  borderColor: `${h.todayColor}55`,
                }
              : undefined

          return (
            <div
              key={h.id}
              ref={(el) => {
                if (el) cardRefs.current.set(h.name, el)
                else cardRefs.current.delete(h.name)
              }}
              className={`h-card h-card--${mode} ${h.todayDone ? 'h-card--done' : ''} ${
                draggingName === h.name ? 'h-card--dragging' : ''
              }`}
              style={cardStyle}
              onClick={() => {
                handleCardClick(h)
              }}
              onPointerDown={() => {
                startLongPress(h)
              }}
              onPointerUp={clearLongPress}
              onPointerLeave={clearLongPress}
              onPointerCancel={clearLongPress}
              draggable={dragArmedName === h.name}
              onDragStart={(e) => {
                clearLongPress()
                setDraggingName(h.name)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                const rect = e.currentTarget.getBoundingClientRect()
                const after = twoColumns
                  ? e.clientX > rect.left + rect.width / 2
                  : e.clientY > rect.top + rect.height / 2
                previewMove(h.name, after)
              }}
              onDrop={(e) => {
                e.preventDefault()
                endDrag(true)
                setDragArmedName(null)
              }}
              onDragEnd={() => {
                // Fires after drop too; committing there already cleared the preview
                endDrag(false)
                setDragArmedName(null)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleCardClick(h)
                }
              }}
              title="Click to log today · hold for habit settings"
            >
              <span
                className="h-drag-handle"
                title="Drag to reorder"
                onPointerDown={(e) => {
                  // Arm the drag without arming the card's long-press or click
                  e.stopPropagation()
                  setDragArmedName(h.name)
                }}
                onPointerUp={(e) => {
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.stopPropagation()
                }}
              >
                <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
                  {[4, 9, 14].map((cy) =>
                    [4, 10].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.5" fill="currentColor" />)
                  )}
                </svg>
              </span>

              {mode === 'classic' && (
                <div className="h-card-left">
                  <span className="h-name">
                    {h.name}
                    {h.star && <span className="h-star" title="Starred">★</span>}
                  </span>
                </div>
              )}

              {mode === 'graph' ? (
                <>
                  <span className="h-title-overlay">
                    {h.name}
                    {h.star && <span className="h-star" title="Starred">★</span>}
                  </span>

                  {showStreak && (
                    <span
                      className="h-streak-overlay"
                      title={`${streak} day streak${strictStreak ? ' (a missed day resets it)' : ' (one missed day forgiven)'}`}
                    >
                      <span
                        className={
                          streak === 0
                            ? 'h-streak-zero'
                            : h.todayDone
                            ? 'h-streak-active'
                            : 'h-streak-pending'
                        }
                      >
                        {streak}
                      </span>
                    </span>
                  )}

                  <div className="h-contrib">
                  <div className="h-contrib-weeks">
                    {weeks.map((week) => (
                      <div key={week[0].date} className="h-contrib-week">
                        {Array.from({ length: 7 }, (_, row) => {
                          const day = week.find((d) => d.dow === row)
                          if (!day) {
                            return <span key={row} className="h-contrib-cell h-contrib-cell--empty" />
                          }

                          const color = getDayColor(h, day)
                          const status = day.done
                            ? getDayLabel(h, day)
                            : day.isSkipped
                            ? 'Skipped'
                            : 'Missed'

                          const cellStyle = day.done
                            ? { background: color, borderColor: color, boxShadow: `0 0 6px ${color}66` }
                            : undefined

                          return (
                            <span
                              key={day.date}
                              className={`h-contrib-cell ${
                                day.done
                                  ? 'h-contrib-cell--done'
                                  : day.isSkipped
                                  ? 'h-contrib-cell--skipped'
                                  : 'h-contrib-cell--missed'
                              } ${day.isToday ? 'h-contrib-cell--today' : ''}`}
                              style={cellStyle}
                              title={`${day.dayName} ${day.dayNum}: ${status}`}
                            />
                          )
                        })}
                      </div>
                    ))}
                    </div>

                    {/* Month captions sit below the squares — the title owns the top band */}
                    <div className="h-contrib-months">
                      {monthLabels.map((label, i) => (
                        <span key={weeks[i][0].date} className="h-contrib-month">
                          {label ?? ''}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-card-right">
                  <div className="h-history">
                    {h.history.slice(-CLASSIC_DAYS).map((day) => {
                      const statusLabel = day.done ? 'Done' : day.isSkipped ? 'Skipped' : 'Missed'
                      const dotStyle =
                        day.done && day.color
                          ? {
                              background: day.color,
                              borderColor: day.color,
                              boxShadow: `0 0 10px ${day.color}aa`,
                            }
                          : undefined

                      return (
                        <div
                          key={day.date}
                          className={`h-day-col ${day.isToday ? 'h-day-col--today' : ''}`}
                          title={`${day.dayName} ${day.dayNum}: ${statusLabel}`}
                        >
                          <div
                            className={`h-day-dot ${
                              day.done
                                ? 'h-day-dot--done'
                                : day.isSkipped
                                ? 'h-day-dot--skipped'
                                : ''
                            } ${day.isToday ? 'h-day-dot--today' : ''}`}
                            style={dotStyle}
                          >
                            {(day.done || day.isSkipped) && <span className="h-dot-inner" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {showStreak && (
                    <div className="h-streak" title={`${streak} day streak`}>
                      {streak > 0 ? (
                        <span className={h.todayDone ? 'h-streak-active' : 'h-streak-pending'}>
                          {streak}
                        </span>
                      ) : (
                        <span className="h-streak-zero">0</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Per-habit display settings (opened by long press) */}
      {settingsHabit && (
        <div
          className="h-modal-backdrop"
          onClick={() => {
            setSettingsHabit(null)
          }}
        >
          <div
            className="h-modal-card"
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <div className="h-modal-header">
              <span className="h-modal-title">{settingsHabit.name}</span>
              <span className="h-modal-sub">Display settings for this habit</span>
            </div>

            {(() => {
              const mode: ViewMode = settingsHabit.view
              const showStreak = settingsHabit.showStreak
              const strictStreak = settingsHabit.strictStreak

              return (
                <div className="h-settings">
                  <div className="h-setting-row">
                    <span className="h-setting-label">View</span>
                    <div className="h-seg">
                      <button
                        type="button"
                        className={`h-seg-btn ${mode === 'graph' ? 'h-seg-btn--on' : ''}`}
                        onClick={() => {
                          void patchHabitSettings(settingsHabit, { view: 'graph' })
                        }}
                      >
                        Contribution graph
                      </button>
                      <button
                        type="button"
                        className={`h-seg-btn ${mode === 'classic' ? 'h-seg-btn--on' : ''}`}
                        onClick={() => {
                          void patchHabitSettings(settingsHabit, { view: 'classic' })
                        }}
                      >
                        Classic dots
                      </button>
                    </div>
                  </div>

                  <div className="h-setting-row">
                    <span className="h-setting-label">Show streak</span>
                    <div className="h-seg">
                      <button
                        type="button"
                        className={`h-seg-btn ${showStreak ? 'h-seg-btn--on' : ''}`}
                        onClick={() => {
                          void patchHabitSettings(settingsHabit, { showStreak: true })
                        }}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={`h-seg-btn ${showStreak ? '' : 'h-seg-btn--on'}`}
                        onClick={() => {
                          void patchHabitSettings(settingsHabit, { showStreak: false })
                        }}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  <div className="h-setting-row">
                    <span className="h-setting-label">Missed day resets streak</span>
                    <div className="h-seg">
                      <button
                        type="button"
                        className={`h-seg-btn ${strictStreak ? 'h-seg-btn--on' : ''}`}
                        onClick={() => {
                          void patchHabitSettings(settingsHabit, { strictNoSkip: true })
                        }}
                      >
                        Yes ({settingsHabit.streakStrict})
                      </button>
                      <button
                        type="button"
                        className={`h-seg-btn ${strictStreak ? '' : 'h-seg-btn--on'}`}
                        onClick={() => {
                          void patchHabitSettings(settingsHabit, { strictNoSkip: false })
                        }}
                      >
                        No, forgive one ({settingsHabit.streakLenient})
                      </button>
                    </div>
                  </div>

                  {settingsHabit.availableTags.length > 0 && (
                    <div className="h-setting-row">
                      <span className="h-setting-label">Tag colours</span>
                      <div className="h-tag-colors">
                        {settingsHabit.availableTags.map((t) => (
                          <label key={t.tag} className="h-tag-color" style={{ borderColor: `${t.color}66` }}>
                            <input
                              type="color"
                              value={t.color}
                              onChange={(e) => {
                                void patchTagColor(settingsHabit, t.tag, e.target.value)
                              }}
                            />
                            <span className="h-tag-color-swatch" style={{ background: t.color }} />
                            <span className="h-tag-color-name">{t.tag}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            <div className="h-modal-actions">
              <button
                type="button"
                className="h-btn h-btn--secondary"
                onClick={() => {
                  setSettingsHabit(null)
                }}
              >
                Done (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tag Selection Modal */}
      {activeModalHabit && (
        <div
          className="h-modal-backdrop"
          onClick={() => {
            setActiveModalHabit(null)
          }}
        >
          <div
            className="h-modal-card"
            onClick={(e) => {
              e.stopPropagation()
            }}
          >
            <div className="h-modal-header">
              <span className="h-modal-title">{activeModalHabit.name}</span>
              <span className="h-modal-sub">Select status tag to record completion</span>
            </div>

            <div className="h-tag-grid">
              {activeModalHabit.availableTags.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  className="h-tag-btn"
                  onClick={() => {
                    void completeWithTag(activeModalHabit, t)
                  }}
                >
                  <span
                    className="h-tag-dot"
                    style={{
                      background: t.color,
                      boxShadow: `0 0 8px ${t.color}99`,
                    }}
                  />
                  <span className="h-tag-label">{t.tag}</span>
                </button>
              ))}
            </div>

            <div className="h-modal-actions">
              <button
                type="button"
                className="h-btn h-btn--secondary"
                onClick={() => {
                  void completeWithTag(activeModalHabit, undefined)
                }}
              >
                Done (No Tag)
              </button>

              {activeModalHabit.todayDone && (
                <button
                  type="button"
                  className="h-btn h-btn--danger"
                  onClick={() => {
                    void markPending(activeModalHabit)
                  }}
                >
                  Undo (Mark Pending)
                </button>
              )}

              <button
                type="button"
                className="h-btn h-btn--ghost"
                onClick={() => {
                  setActiveModalHabit(null)
                }}
              >
                Cancel (Esc)
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .h-root {
          display: flex;
          flex-direction: column;
          gap: 12px;
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow-y: auto;
          padding-right: 4px;
        }

        .h-root::-webkit-scrollbar {
          width: 3px;
        }
        .h-root::-webkit-scrollbar-thumb {
          background: var(--border-bright);
          border-radius: 3px;
        }

        .h-err,
        .h-loading {
          font-family: var(--font-mono);
          font-size: 19px;
          color: var(--text-muted);
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .h-err span {
          color: var(--down);
        }

        .h-toolbar {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          flex-shrink: 0;
        }

        .h-check {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-family: var(--font-mono);
          font-size: 14px;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          cursor: pointer;
          user-select: none;
        }

        .h-check:hover {
          color: var(--text-secondary);
        }

        .h-check input {
          width: 14px;
          height: 14px;
          accent-color: #38bdf8;
          cursor: pointer;
        }

        /* One habit per row */
        .h-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
          --cell-gap: 3px;
        }

        /* Two per row */
        /* Same square size as one-per-row — the cards show fewer weeks instead */
        .h-grid--two {
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-content: start;
        }

        .h-grid--two .h-title-overlay {
          font-size: 28px;
        }

        .h-card--dragging {
          opacity: 0.45;
          border-color: #38bdf8 !important;
        }

        /* Grip: hidden until the card is hovered, and the only way to start a drag */
        .h-drag-handle {
          position: absolute;
          top: 4px;
          right: 4px;
          z-index: 4;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px 2px;
          border-radius: 4px;
          color: var(--text-muted);
          opacity: 0;
          cursor: grab;
          transition: opacity 0.15s ease, color 0.15s ease;
        }

        .h-card:hover .h-drag-handle {
          opacity: 0.75;
        }

        .h-drag-handle:hover {
          opacity: 1 !important;
          color: #38bdf8;
          background: rgba(255, 255, 255, 0.06);
        }

        .h-drag-handle:active {
          cursor: grabbing;
        }

        .h-grid--compact {
          --cell-gap: 2px;
          gap: 6px;
        }

        /* Kuma expanded: drop the month strip and tighten everything */
        .h-grid--compact .h-contrib-months {
          display: none;
        }

        .h-grid--compact .h-card {
          padding: 5px 10px;
        }

        .h-grid--compact .h-name {
          font-size: 16px;
        }

        /* Square size follows the graph width, so narrowing the graph is what
           buys back vertical space when Kuma takes over the screen. */
        .h-grid--compact .h-contrib {
          max-width: 62%;
          margin-left: auto;
        }

        /* Clickable Card layout */
        .h-card {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 14px;
          border-radius: var(--radius-sm);
          background: var(--surface);
          border: 1px solid var(--border);
          width: 100%;
          cursor: pointer;
          user-select: none;
          transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease;
        }

        .h-card:hover {
          background: var(--surface-hover);
          border-color: var(--border-bright);
        }

        .h-card:active {
          transform: scale(0.995);
        }

        .h-card--done {
          background: linear-gradient(90deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.04) 100%);
          border-color: rgba(34, 197, 94, 0.35);
          box-shadow: inset 0 0 10px rgba(34, 197, 94, 0.06);
        }

        .h-card--done:hover {
          background: linear-gradient(90deg, rgba(34, 197, 94, 0.22) 0%, rgba(34, 197, 94, 0.08) 100%);
          border-color: rgba(34, 197, 94, 0.5);
        }

        .h-card-left {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 170px;
          flex-shrink: 0;
          overflow: hidden;
        }

        .h-grid--compact .h-card-left {
          width: 120px;
        }

        .h-name {
          font-size: 20px;
          font-weight: 500;
          color: #ffffff;
          letter-spacing: 0.02em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
          display: block;
        }

        .h-star {
          color: #f59e0b;
          font-size: 15px;
          margin-left: 6px;
        }

        /* Title and streak float above the squares, each on a dark fade so the
           cells underneath stay readable. */
        .h-title-overlay,
        .h-streak-overlay {
          position: absolute;
          top: 0;
          display: flex;
          align-items: flex-start;
          pointer-events: none;
          z-index: 2;
          font-family: inherit;
        }

        .h-title-overlay {
          left: 0;
          /* Fades out around the text itself rather than banding the whole top */
          padding: 7px 44px 20px 14px;
          background: radial-gradient(
            ellipse at 20% 40%,
            rgba(6, 6, 8, 0.88) 0%,
            rgba(6, 6, 8, 0.6) 45%,
            rgba(6, 6, 8, 0) 78%
          );
          font-size: 36px;
          font-weight: 400;
          letter-spacing: 0.01em;
          color: #ffffff;
          white-space: nowrap;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.85);
        }

        /* Sits in the gutter the graph reserves on the right, so it never
           covers a square. */
        .h-streak-overlay {
          right: 0;
          bottom: 0;
          align-items: center;
          justify-content: flex-end;
          width: 54px;
          padding-right: 14px;
        }

        .h-grid--compact .h-streak-overlay {
          width: 40px;
          padding-right: 10px;
        }

        .h-grid--compact .h-title-overlay {
          font-size: 26px;
          padding-bottom: 16px;
        }

        /* GitHub-style contribution graph — the week columns flex, so the grid
           always spans the full remaining width of the row and the square size
           follows from it. */
        .h-contrib {
          display: flex;
          flex-direction: column;
          gap: 3px;
          flex: 1;
          min-width: 0;
          /* Gutter for the streak overlay */
          padding-right: 40px;
        }

        .h-grid--compact .h-contrib {
          padding-right: 30px;
        }

        .h-contrib-months,
        .h-contrib-weeks {
          display: flex;
          gap: var(--cell-gap);
          width: 100%;
        }

        .h-contrib-months {
          height: 12px;
        }

        .h-contrib-month {
          flex: 1 1 0;
          min-width: 0;
          font-family: var(--font-mono);
          font-size: 11px;
          line-height: 12px;
          color: var(--text-muted);
          white-space: nowrap;
        }

        .h-contrib-week {
          display: flex;
          flex-direction: column;
          gap: var(--cell-gap);
          flex: 1 1 0;
          min-width: 0;
        }

        .h-contrib-cell {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 2px;
          border: 1px solid transparent;
          box-sizing: border-box;
        }

        .h-contrib-cell--missed {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.08);
        }

        .h-contrib-cell--skipped {
          background: rgba(107, 114, 128, 0.45);
          border-color: rgba(107, 114, 128, 0.55);
        }

        .h-contrib-cell--empty {
          background: transparent;
          border-color: transparent;
        }

        .h-contrib-cell--today {
          outline: 1px solid #38bdf8;
          outline-offset: 1px;
        }

        /* Classic dot row (long-press to switch a habit back to this) */
        .h-card-right {
          display: flex;
          align-items: center;
          gap: 14px;
          flex: 1;
          min-width: 0;
          justify-content: flex-end;
        }

        .h-history {
          display: flex;
          align-items: center;
          gap: 7px;
          overflow: hidden;
          justify-content: flex-end;
          flex: 1;
          min-width: 0;
        }

        .h-day-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          flex-shrink: 0;
        }

        .h-day-dot {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .h-day-dot--today {
          border-color: #38bdf8;
          border-width: 2px;
          box-shadow: 0 0 8px rgba(56, 189, 248, 0.45);
        }

        .h-day-dot--done {
          background: var(--up);
          border-color: var(--up);
          box-shadow: 0 0 10px rgba(34, 197, 94, 0.55);
        }

        .h-day-dot--skipped {
          background: #6b7280;
          border-color: #6b7280;
          box-shadow: 0 0 6px rgba(107, 114, 128, 0.4);
        }

        .h-dot-inner {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.85);
        }

        .h-streak {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          min-width: 44px;
          flex-shrink: 0;
        }

        .h-streak-active {
          font-family: var(--font-mono);
          font-size: 26px;
          font-weight: 500;
          color: #ff8c38;
          text-align: right;
          letter-spacing: -0.02em;
        }

        .h-streak-pending {
          font-family: var(--font-mono);
          font-size: 26px;
          font-weight: 500;
          color: #6b7280;
          text-align: right;
          letter-spacing: -0.02em;
        }

        .h-streak-zero {
          font-family: var(--font-mono);
          font-size: 22px;
          font-weight: 400;
          color: var(--text-muted);
          text-align: right;
          opacity: 0.65;
        }

        /* Tag Selection Modal */
        .h-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
        }

        .h-modal-card {
          background: #0d0d0d;
          border: 1px solid var(--border-bright);
          border-radius: var(--radius);
          padding: 32px;
          width: 100%;
          max-width: 640px;
          display: flex;
          flex-direction: column;
          gap: 22px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8), 0 0 2px rgba(255, 255, 255, 0.2);
        }

        .h-modal-header {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .h-modal-title {
          font-size: 28px;
          font-weight: 400;
          color: var(--text-primary);
        }

        .h-modal-sub {
          font-size: 18px;
          color: var(--text-muted);
        }

        /* Long-press settings sheet */
        .h-settings {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .h-setting-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .h-setting-label {
          font-size: 16px;
          color: var(--text-muted);
          letter-spacing: 0.04em;
        }

        .h-seg {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .h-seg-btn {
          flex: 1;
          min-width: 120px;
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--text-muted);
          font-size: 17px;
          font-weight: 400;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .h-seg-btn:hover {
          background: var(--surface-hover);
          border-color: var(--border-bright);
        }

        .h-tag-colors {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .h-tag-color {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          background: var(--surface);
          border: 1px solid var(--border);
          cursor: pointer;
        }

        .h-tag-color:hover {
          background: var(--surface-hover);
        }

        /* The native swatch is the click target, drawn over our own swatch */
        .h-tag-color input {
          position: absolute;
          inset: 0;
          opacity: 0;
          width: 100%;
          height: 100%;
          cursor: pointer;
        }

        .h-tag-color-swatch {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .h-tag-color-name {
          font-size: 16px;
          color: var(--text-secondary);
        }

        .h-seg-btn--on {
          background: rgba(56, 189, 248, 0.16);
          border-color: rgba(56, 189, 248, 0.55);
          color: #e0f2fe;
        }

        .h-tag-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .h-tag-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--text-primary);
        }

        .h-tag-btn:hover {
          background: var(--surface-hover);
          border-color: var(--border-bright);
          transform: translateY(-1px);
        }

        .h-tag-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .h-tag-label {
          font-family: var(--font-mono);
          font-size: 18px;
          font-weight: 400;
        }

        .h-modal-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
          margin-top: 6px;
          padding-top: 14px;
          border-top: 1px solid var(--border);
        }

        .h-btn {
          padding: 8px 14px;
          border-radius: var(--radius-sm);
          font-size: 17px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .h-btn--secondary {
          background: var(--surface);
          border: 1px solid var(--border);
          color: var(--text-primary);
        }

        .h-btn--secondary:hover {
          background: var(--surface-hover);
        }

        .h-btn--danger {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
        }

        .h-btn--danger:hover {
          background: rgba(239, 68, 68, 0.25);
        }

        .h-btn--ghost {
          background: transparent;
          border: 1px solid transparent;
          color: var(--text-muted);
        }

        .h-btn--ghost:hover {
          color: var(--text-primary);
        }
      `}</style>
    </div>
  )
}

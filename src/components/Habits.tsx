/* eslint-disable @typescript-eslint/no-deprecated */
'use client'
import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  LabelList,
} from 'recharts'

export interface HistoryDay {
  date: string
  dayName: string
  dayNum: string
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
  showStreak?: boolean
  history7: HistoryDay[]
  availableTags: TagOption[]
  visualization?: string | null
}

interface HabitsApiResponse {
  habits: Habit[]
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

interface TooltipPayloadItem {
  payload: {
    dayName: string
    dayNum: string
    label: string
    color: string
    done: boolean
  }
}

function CustomChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (active && payload && payload.length > 0) {
    const item = payload[0].payload
    return (
      <div className="h-chart-tooltip">
        <div className="h-tooltip-top">
          <span className="h-tooltip-dot" style={{ background: item.color }} />
          <span className="h-tooltip-day">{item.dayName} {item.dayNum}</span>
        </div>
        <div className="h-tooltip-val" style={{ color: item.color }}>
          {item.done ? item.label : 'Missed'}
        </div>
        <style jsx>{`
          .h-chart-tooltip {
            background: #09090b;
            border: 1px solid var(--border-bright);
            border-radius: var(--radius-sm);
            padding: 6px 10px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.6);
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .h-tooltip-top {
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .h-tooltip-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
          }
          .h-tooltip-day {
            font-family: var(--font-mono);
            font-size: 12px;
            color: var(--text-muted);
          }
          .h-tooltip-val {
            font-family: var(--font-mono);
            font-size: 14px;
            font-weight: 700;
          }
        `}</style>
      </div>
    )
  }
  return null
}

interface HabitsProps {
  isKumaFolded?: boolean
}

export default function Habits({ isKumaFolded = true }: HabitsProps) {
  const [data, setData] = useState<HabitsApiResponse | null>(null)
  const [error, setError] = useState(false)
  const [toggling, setToggling] = useState<Record<string, boolean>>({})
  const [activeModalHabit, setActiveModalHabit] = useState<Habit | null>(null)

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

  // Listen for Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveModalHabit(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const handleCardClick = (habit: Habit) => {
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
          const newHistory = h.history7.map((day) =>
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
            history7: newHistory,
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
          const newHistory = h.history7.map((day) =>
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
            history7: newHistory,
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
          const newHistory = h.history7.map((day) =>
            day.isToday ? { ...day, done: false, color: null, tagText: null } : day
          )
          const newStreak = Math.max(0, h.streak - 1)
          return {
            ...h,
            todayDone: false,
            todayColor: null,
            streak: newStreak,
            history7: newHistory,
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

  return (
    <div className="h-root">
      <div className="h-grid">
        {data.habits.map((h) => {
          // Render Recharts Trend Card ONLY when Kuma is folded.
          // When Kuma un-collapses (expands), revert to standard dots row to save vertical space!
          const isChartHabit =
            isKumaFolded &&
            (h.visualization === 'chart' ||
              h.name.toLowerCase().includes('woke') ||
              h.name.toLowerCase().includes('read') ||
              h.name.toLowerCase().includes('quran'))

          if (isChartHabit) {
            // Render Full Expanded Recharts Trend Card with LabelList (direct values above bars)
            const isWake = h.name.toLowerCase().includes('woke')
            const chartData = h.history7.map((day) => {
              if (isWake) {
                const parsed = parseWakeUpTime(day.tagText)
                return {
                  date: day.date,
                  dayName: day.dayName,
                  dayNum: day.dayNum,
                  done: day.done,
                  val: parsed?.val ?? (day.done ? 6.0 : 9.0),
                  chartVal: parsed?.val ? 10.0 - parsed.val : day.done ? 4.0 : 1.0,
                  label: parsed?.label ?? (day.done ? 'DONE' : ''),
                  color: day.color ?? '#22c55e',
                }
              }
              const isQuran = h.name.toLowerCase().includes('quran')
              const parsed = parseDurationMinutes(day.tagText)
              const mins = parsed?.val ?? (day.done ? 30 : 0)
              const defaultColor = getReadingColorForMinutes(mins, isQuran)
              return {
                date: day.date,
                dayName: day.dayName,
                dayNum: day.dayNum,
                done: day.done,
                val: mins,
                chartVal: mins,
                label: parsed?.label ?? (day.done ? '30m' : ''),
                color: day.color ?? defaultColor,
              }
            })

            const trendCardStyle = h.todayDone
              ? {
                  background: `linear-gradient(135deg, ${h.todayColor ?? '#22c55e'}38 0%, ${h.todayColor ?? '#22c55e'}14 100%)`,
                  borderColor: `${h.todayColor ?? '#22c55e'}77`,
                  boxShadow: `0 0 20px ${h.todayColor ?? '#22c55e'}30, inset 0 0 15px ${h.todayColor ?? '#22c55e'}15`,
                }
              : undefined

            return (
              <div
                key={h.id}
                className={`h-trend-card h-trend-card--primary ${h.todayDone ? 'h-trend-card--done' : ''}`}
                style={trendCardStyle}
                onClick={() => {
                  handleCardClick(h)
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleCardClick(h)
                  }
                }}
                title="Click to log or update today's status"
              >
                <div className="h-trend-header">
                  <div className="h-trend-title">
                    <span>{h.name}</span>
                    {h.star && <span className="h-star" title="Starred">★</span>}
                  </div>
                  <div className="h-trend-metrics">
                    {h.showStreak !== false && (
                      <div className="h-streak" title={`${h.streak} day streak`}>
                        {h.streak > 0 ? (
                          <span className={h.todayDone ? 'h-streak-active' : 'h-streak-pending'}>
                            {h.streak}
                          </span>
                        ) : (
                          <span className="h-streak-zero">0</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="h-chart-wrapper">
                  <ResponsiveContainer width="100%" height={125}>
                    <BarChart data={chartData} margin={{ top: 18, right: 6, left: 6, bottom: 0 }}>
                      <XAxis dataKey="dayName" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                      <RechartsTooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.06)' }} />
                      {isWake && <ReferenceLine y={4} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />}
                      <Bar dataKey="chartVal" radius={[4, 4, 0, 0]}>
                        <LabelList
                          dataKey="label"
                          position="top"
                          fill="var(--text-primary)"
                          fontSize={10}
                          style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}
                        />
                        {chartData.map((d) => (
                          <Cell key={d.date} fill={d.done ? d.color : 'rgba(255,255,255,0.08)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          }

          // Standard Habit Card (Rendered for non-chart habits, or when Kuma is expanded)
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
              className={`h-card ${h.todayDone ? 'h-card--done' : ''}`}
              style={cardStyle}
              onClick={() => {
                handleCardClick(h)
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleCardClick(h)
                }
              }}
              title="Click to log or update today's tag"
            >
              <div className="h-card-left">
                <span className="h-name">
                  {h.name}
                  {h.star && <span className="h-star" title="Starred">★</span>}
                </span>
              </div>

              <div className="h-card-right">
                <div className="h-history">
                  {h.history7.map((day) => {
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

                {h.showStreak !== false && (
                  <div className="h-streak" title={`${h.streak} day streak`}>
                    {h.streak > 0 ? (
                      <span className={h.todayDone ? 'h-streak-active' : 'h-streak-pending'}>
                        {h.streak}
                      </span>
                    ) : (
                      <span className="h-streak-zero">0</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

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
          font-size: 17px;
          color: var(--text-muted);
          display: flex;
          gap: 6px;
          align-items: center;
        }
        .h-err span {
          color: var(--down);
        }

        .h-grid {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        /* Clickable Card layout */
        .h-card {
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
          min-width: 140px;
          flex-shrink: 0;
        }

        .h-name {
          font-size: 22px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: 0.02em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .h-star {
          color: #f59e0b;
          font-size: 14px;
        }

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

        .h-day-label {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--text-muted);
          text-transform: uppercase;
        }

        .h-day-col--today .h-day-label {
          color: var(--accent);
          font-weight: 700;
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
          font-size: 24px;
          font-weight: 800;
          color: #ff8c38;
          display: inline-block;
          text-align: right;
          letter-spacing: -0.02em;
        }

        .h-streak-pending {
          font-family: var(--font-mono);
          font-size: 24px;
          font-weight: 800;
          color: #6b7280;
          display: inline-block;
          text-align: right;
          letter-spacing: -0.02em;
        }

        .h-streak-zero {
          font-family: var(--font-mono);
          font-size: 20px;
          font-weight: 600;
          color: var(--text-muted);
          display: inline-block;
          text-align: right;
          opacity: 0.65;
        }

        /* Statistical Recharts Trend Cards */
        .h-trend-card {
          position: relative;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          cursor: pointer;
          transition: background 0.2s ease, border-color 0.2s ease;
        }

        .h-trend-card:hover {
          background: var(--surface-hover);
          border-color: var(--border-bright);
        }

        .h-trend-card--done {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.22) 0%, rgba(34, 197, 94, 0.08) 100%);
          border-color: rgba(34, 197, 94, 0.55);
          box-shadow: 0 0 20px rgba(34, 197, 94, 0.2), inset 0 0 15px rgba(34, 197, 94, 0.1);
        }

        .h-trend-header {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          min-height: 28px;
        }

        .h-trend-title {
          position: absolute;
          top: 10px;
          left: 12px;
          z-index: 5;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 0.03em;
          color: #ffffff;
          padding: 0;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
        }

        .h-trend-metrics {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .h-metric-badge {
          font-family: var(--font-mono);
          font-size: 18px;
          font-weight: 800;
          padding: 0;
          background: transparent;
          color: #ffffff;
          border: none;
          letter-spacing: 0.02em;
        }

        .h-metric-badge--green {
          background: transparent;
          color: #86efac;
          border: none;
          text-shadow: 0 0 10px rgba(134, 239, 172, 0.3);
        }

        .h-metric-badge--cyan {
          background: transparent;
          color: #7dd3fc;
          border: none;
          text-shadow: 0 0 10px rgba(125, 211, 252, 0.3);
        }

        .h-chart-wrapper {
          width: 100%;
          height: 125px;
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
          padding: 24px;
          width: 100%;
          max-width: 440px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8), 0 0 2px rgba(255, 255, 255, 0.2);
        }

        .h-modal-header {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .h-modal-title {
          font-size: 22px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .h-modal-sub {
          font-size: 15px;
          color: var(--text-muted);
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
          font-size: 16px;
          font-weight: 600;
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
          font-size: 14px;
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

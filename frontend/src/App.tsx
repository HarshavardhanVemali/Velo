import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, BrainCircuit, CalendarCheck2, Link2, RefreshCcw, ShieldCheck, Unplug } from 'lucide-react'

import { HumanReviewCard } from './components/HumanReviewCard'
import { ResultPanel } from './components/ResultPanel'
import { RunTimeline } from './components/RunTimeline'
import { StatusBadge } from './components/StatusBadge'
import { TaskComposer } from './components/TaskComposer'
import { ThemeToggle } from './components/ThemeToggle'
import { WorkspaceMetaBar } from './components/WorkspaceMetaBar'
import { useTheme } from './hooks/useTheme'
import {
  disconnectGoogleAuth,
  getGoogleAuthStartUrl,
  getGoogleAuthStatus,
  getRun,
  getRunEvents,
  listRuns,
  respondToRun,
  startRun,
} from './lib/api'
import type { GoogleAuthStatus, RunEvent, RunState } from './types'

const defaultPrompt = 'Book meeting with boss@example.com for tomorrow at 2 PM and email them.'

function sortRuns(runs: RunState[]) {
  return [...runs].sort(
    (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  )
}

function mergeEvents(existing: RunEvent[], incoming: RunEvent[]) {
  const knownIds = new Set(existing.map((event) => event.id))
  const merged = [...existing]
  for (const event of incoming) {
    if (!knownIds.has(event.id)) {
      merged.push(event)
    }
  }
  return merged.sort((left, right) => left.id - right.id)
}

function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const [runs, setRuns] = useState<RunState[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState(defaultPrompt)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResponding, setIsResponding] = useState(false)
  const [isDisconnectingAuth, setIsDisconnectingAuth] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [googleAuthStatus, setGoogleAuthStatus] = useState<GoogleAuthStatus | null>(null)
  const runsRef = useRef<RunState[]>([])
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const timelineStickBottomRef = useRef(true)

  useEffect(() => {
    runsRef.current = runs
  }, [runs])

  const syncGoogleAuth = useCallback(async () => {
    try {
      const status = await getGoogleAuthStatus()
      setGoogleAuthStatus(status)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to check Google Calendar auth.')
    }
  }, [])

  const activeRun = useMemo(
    () => runs.find((run) => run.id === activeRunId) ?? null,
    [activeRunId, runs],
  )

  const upsertRun = useCallback((run: RunState) => {
    setRuns((current) => {
      const existing = current.find((item) => item.id === run.id)
      const mergedRun = existing
        ? { ...run, events: mergeEvents(existing.events, run.events) }
        : run
      return sortRuns([mergedRun, ...current.filter((item) => item.id !== run.id)])
    })
  }, [])

  const syncRun = useCallback(
    async (runId: string) => {
      const current = runsRef.current.find((run) => run.id === runId) ?? null
      const since = current?.events.at(-1)?.id ?? 0
      const [snapshot, eventDelta] = await Promise.all([getRun(runId), getRunEvents(runId, since)])
      upsertRun({
        ...snapshot,
        events: current ? mergeEvents(current.events, eventDelta.events) : snapshot.events,
      })
    },
    [upsertRun],
  )

  useEffect(() => {
    void (async () => {
      try {
        const data = await listRuns()
        setRuns(sortRuns(data))
        await syncGoogleAuth()
        if (data.length > 0) {
          setActiveRunId(data[0].id)
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Failed to load runs.')
      }
    })()
  }, [syncGoogleAuth])

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'google-auth-success') {
        void syncGoogleAuth()
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [syncGoogleAuth])

  useEffect(() => {
    if (!activeRunId) {
      return
    }
    void syncRun(activeRunId)
  }, [activeRunId, syncRun])

  useEffect(() => {
    if (!activeRun || activeRun.status !== 'running') {
      return
    }
    const timer = window.setInterval(() => {
      void syncRun(activeRun.id)
    }, 1500)
    return () => window.clearInterval(timer)
  }, [activeRun, syncRun])

  const eventCount = activeRun?.events.length ?? 0
  useEffect(() => {
    timelineStickBottomRef.current = true
  }, [activeRunId])

  useEffect(() => {
    const el = timelineScrollRef.current
    if (!el || !timelineStickBottomRef.current) {
      return
    }
    el.scrollTop = el.scrollHeight
  }, [eventCount, activeRunId, activeRun?.status])

  async function handleSubmit() {
    setIsSubmitting(true)
    setLoadError(null)
    try {
      const run = await startRun(prompt)
      upsertRun(run)
      setActiveRunId(run.id)
      if (run.status !== 'waiting_for_user') {
        setPrompt('')
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to start the run.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleClarification(responseText: string) {
    if (!activeRun) {
      return
    }
    setIsResponding(true)
    setLoadError(null)
    try {
      const run = await respondToRun(activeRun.id, responseText)
      upsertRun(run)
      await syncRun(run.id)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to send the clarification.')
    } finally {
      setIsResponding(false)
    }
  }

  function handleConnectGoogleCalendar() {
    window.open(getGoogleAuthStartUrl(), 'google-calendar-auth', 'width=540,height=720')
  }

  async function handleDisconnectGoogleCalendar() {
    setIsDisconnectingAuth(true)
    setLoadError(null)
    try {
      const status = await disconnectGoogleAuth()
      setGoogleAuthStatus(status)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to disconnect Google Calendar.')
    } finally {
      setIsDisconnectingAuth(false)
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--text)]">
      <header className="shrink-0 border-b border-[var(--border)] bg-[var(--header-bg)]">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] text-[13px] font-bold text-white">
              V
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold tracking-tight text-[var(--text)]">Velo</p>
              <p className="truncate text-[11px] text-[var(--text-muted)]">Autonomous operations workspace</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 lg:flex">
              <span className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--chip-bg)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                Self-correct
              </span>
              <span className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--chip-bg)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
                <BrainCircuit className="h-3 w-3 text-[var(--accent)]" />
                Summarize
              </span>
              <span className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--chip-bg)] px-2 py-1 text-[11px] text-[var(--text-muted)]">
                <Activity className="h-3 w-3 text-violet-500" />
                Human loop
              </span>
            </div>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>
        <WorkspaceMetaBar />
      </header>

      {loadError ? (
        <div
          className="shrink-0 border-b px-4 py-2 text-[13px]"
          style={{
            background: 'var(--error-bg)',
            borderBottomColor: 'var(--error-border)',
            color: 'var(--error-text)',
          }}
        >
          {loadError}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Left: runs */}
        <aside className="flex min-h-0 w-[min(100%,280px)] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar-bg)]">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-[var(--text)]">Collections</p>
              <p className="text-[11px] text-[var(--text-subtle)]">Runs</p>
            </div>
            <button
              type="button"
              onClick={() => activeRunId && void syncRun(activeRunId)}
              className="rounded-md border border-[var(--border)] bg-[var(--chip-bg)] p-1.5 text-[var(--text-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
              title="Refresh active run"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {runs.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--border)] bg-[var(--app-bg)] px-3 py-6 text-center text-[12px] text-[var(--text-subtle)]">
                No runs yet. Send a request from the center panel.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {runs.map((run) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => setActiveRunId(run.id)}
                      className={`w-full rounded-md border px-2.5 py-2 text-left transition ${
                        activeRunId === run.id
                          ? 'border-[var(--accent-border)] bg-[var(--accent-muted)]'
                          : 'border-transparent bg-transparent hover:bg-[var(--elevated-bg)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="line-clamp-2 text-[12px] font-medium leading-snug text-[var(--text)]">
                          {run.prompt}
                        </p>
                        <StatusBadge status={run.status} />
                      </div>
                      <p className="mt-1 text-[10px] text-[var(--text-subtle)]">
                        {new Date(run.updated_at).toLocaleString()}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Center: composer + review + timeline */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--app-bg)]">
          <TaskComposer
            value={prompt}
            onChange={setPrompt}
            onSubmit={handleSubmit}
            isBusy={isSubmitting}
          />

          {activeRun?.status === 'waiting_for_user' && activeRun.clarification_prompt ? (
            <HumanReviewCard
              prompt={activeRun.clarification_prompt}
              options={activeRun.clarification_options}
              onRespond={handleClarification}
              isSubmitting={isResponding}
            />
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--border)]">
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--panel-bg)] px-4 py-2">
              <CalendarCheck2 className="h-4 w-4 shrink-0 text-[var(--accent)]" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[var(--text)]">Execution timeline</p>
                <p className="text-[11px] text-[var(--text-subtle)]">Tool calls, model steps, and events</p>
              </div>
            </div>
            <div
              ref={timelineScrollRef}
              className="min-h-0 flex-1 overflow-y-auto"
              onScroll={() => {
                const el = timelineScrollRef.current
                if (!el) {
                  return
                }
                const threshold = 80
                timelineStickBottomRef.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < threshold
              }}
            >
              <RunTimeline events={activeRun?.events ?? []} />
            </div>
          </div>
        </main>

        {/* Right: response + Google */}
        <aside className="flex min-h-0 w-[min(100%,340px)] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--panel-bg)]">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ResultPanel run={activeRun} />
          </div>

          <div className="shrink-0 border-t border-[var(--border)] px-4 py-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-[var(--text)]">Google Calendar</p>
                <p className="text-[11px] text-[var(--text-subtle)]">OAuth for event creation</p>
              </div>
              <StatusBadge status={googleAuthStatus?.connected ? 'completed' : 'waiting_for_user'} />
            </div>

            <p className="mb-2 text-[11px] text-[var(--text-muted)]">
              <span className="text-[var(--text-subtle)]">Status:</span>{' '}
              {googleAuthStatus?.connected ? 'Connected' : 'Not connected'}
            </p>
            <p className="mb-3 break-all font-mono text-[10px] leading-relaxed text-[var(--text-subtle)]">
              {googleAuthStatus?.redirectUri ?? 'http://127.0.0.1:8000/auth/google/callback'}
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleConnectGoogleCalendar}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[var(--accent-hover)]"
              >
                <Link2 className="h-3.5 w-3.5" />
                Connect
              </button>
              <button
                type="button"
                onClick={() => void syncGoogleAuth()}
                className="rounded-md border border-[var(--border)] bg-[var(--elevated-bg)] px-3 py-1.5 text-[12px] text-[var(--text)] transition hover:border-[var(--accent)]/40"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={handleDisconnectGoogleCalendar}
                disabled={isDisconnectingAuth}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--elevated-bg)] px-3 py-1.5 text-[12px] text-[var(--text)] transition hover:border-red-500/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Unplug className="h-3.5 w-3.5" />
                {isDisconnectingAuth ? '…' : 'Disconnect'}
              </button>
            </div>

            <details className="mt-3 border-t border-[var(--border)] pt-2">
              <summary className="cursor-pointer text-[11px] text-[var(--text-subtle)] hover:text-[var(--text-muted)]">
                Operational principles
              </summary>
              <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-[var(--text-muted)]">
                <li>
                  <span className="font-medium text-[var(--summary-text)]">Self-correction</span> - retries and
                  fallbacks on failures.
                </li>
                <li>
                  <span className="font-medium text-[var(--summary-text)]">State</span> - summarized context for long
                  runs.
                </li>
                <li>
                  <span className="font-medium text-[var(--summary-text)]">Human loop</span> - pauses for ambiguous
                  scheduling.
                </li>
              </ul>
            </details>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
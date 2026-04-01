import clsx from 'clsx'

import type { RunStatus } from '../types'

const badgeStyles: Record<RunStatus, string> = {
  running:
    'bg-[var(--accent-muted)] text-[var(--accent-hover)] ring-1 ring-inset ring-[var(--accent)]/35',
  waiting_for_user: 'bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/25 dark:text-amber-200',
  completed: 'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-300',
  failed: 'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/25 dark:text-red-300',
}

const labels: Record<RunStatus, string> = {
  running: 'Running',
  waiting_for_user: 'Waiting',
  completed: 'Done',
  failed: 'Failed',
}

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        badgeStyles[status],
      )}
    >
      {labels[status]}
    </span>
  )
}

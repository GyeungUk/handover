/** One recorded move of a task, kept as an append-only trail so the reason survives. */
export type ScheduleChange = {
  taskKey: string;
  personId: string;
  taskTitle: string;
  fromStart: number;
  toStart: number;
  reason: string;
  changedBy: string;
  changedAt: string;
};

/** Moving a task, with the reason that justifies it. Rejects by throwing. */
export type Reschedule = (personId: string, taskTitle: string, toStart: number, reason: string) => Promise<void>;

/**
 * Removing a task from the calendar for everyone. Rejects by throwing.
 *
 * A task authored in the workspace is deleted outright; one from the seed plan is code rather than
 * a row, so the server records the key as removed and every reader skips it from then on.
 */
export type DeleteTask = (personId: string, taskTitle: string) => Promise<void>;

/** Recording a confirmed day inside a task's period. Rejects by throwing. */
export type AddTaskDate = (personId: string, taskTitle: string, date: string, label: string) => Promise<void>;

/** Recording a pasted block of days in one write — all of them or none. Rejects by throwing. */
export type AddTaskDates = (
  personId: string,
  taskTitle: string,
  dates: { date: string; label: string }[],
) => Promise<void>;

/** Removing one confirmed day. Rejects by throwing. */
export type RemoveTaskDate = (id: number) => Promise<void>;

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

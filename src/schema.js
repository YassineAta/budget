import { z } from 'zod';

export const goalSchema = z.object({
  id: z.string(),
  name: z.string(),
  target: z.number().min(0),
  saved: z.number().min(0),
  priority: z.enum(['High', 'Medium', 'Low']).optional(),
  category: z.string().optional(),
  isBuffer: z.boolean().optional(),
  /** Priority reserve: funded from its own bucket alongside the buffer, before other goals. */
  isPriority: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  monthlyCost: z.number().min(0).optional(),
  targetDate: z.string().optional(),
  /** 'saving' = normal savings goal; 'wishlist' = does not affect balance */
  type: z.enum(['saving', 'wishlist']).optional(),
  /** Linked SICAV/FCP placement — external investment tracked for goal progress display only.
   *  Never touches goal.saved or cash; purely for UI progress computation. */
  placement: z.object({
    funds: z.array(z.object({
      slug: z.string(),
      label: z.string(),
      units: z.number().min(0),
    })),
    navCache: z.record(z.string(), z.object({
      nav: z.number().min(0),
      fetchedAt: z.string(),
    })).optional(),
  }).optional(),
}).passthrough();

export const recurringExpenseSchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number().min(0),
  period: z.enum(['monthly', 'weekly']),
  /** Day of month (1-31) on which this expense is cut. Only used for monthly period. */
  cut_day: z.number().int().min(1).max(31).optional(),
  start_date: z.string(),
  last_applied_date: z.string(),
  active: z.boolean(),
}).passthrough();

export const expenseSchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number().min(0),
  date: z.string(),
  /**
   * Actual balance deductions this ledger entry caused, so DELETE_EXPENSE can
   * refund EXACTLY what ADD_EXPENSE / applyDueExpenses removed (conservation
   * invariant #2 — no mint-on-delete). Absent on legacy entries, which are
   * treated as fully buffer-funded for backward compatibility.
   */
  paidFromCash: z.number().min(0).optional(),
  paidFromBuffer: z.number().min(0).optional(),
}).passthrough();

export const incomeEventSchema = z.object({
  id: z.string(),
  source: z.string(),
  amount: z.number().min(0),
  date: z.string(),
  /** goalId → amount routed to that goal by the allocation engine (derived, but
   *  persisted so a delete can attempt a conservative reversal). */
  allocations: z.record(z.string(), z.number()).optional(),
  /** portion of this income that stayed as free cash. */
  cashAllocated: z.number().min(0).optional(),
}).passthrough();

export const stateSchema = z.object({
  cash: z.number().min(0),
  monthly: z.object({
    budget: z.number().min(0),
    spent: z.number().min(0),
    expenses: z.array(expenseSchema),
    resetDate: z.string()
  }).passthrough(),
  safetyMonths: z.number().min(0).optional(),
  bufferMaxMonths: z.number().min(0).optional(),
  bufferLeveledUp: z.boolean().optional(),
  schemaVersion: z.number().int().min(0).optional(),
  goals: z.array(goalSchema),
  recurringExpenses: z.array(recurringExpenseSchema).optional(),
  incomeEvents: z.array(incomeEventSchema).optional(),
  settings: z.object({
    currency: z.string()
  }).passthrough(),
  /** Prior-year monthly spend entries used to seed seasonal burn estimates. */
  historicalSeasons: z.array(z.object({
    month: z.string(),
    total: z.number().min(0),
  }).passthrough()).optional(),
  /** Expected year-over-year growth in spending (inflation + income lift). Default 0.15 = 15%. */
  historicalGrowthRate: z.number().min(0).max(2).optional(),
  /** Persisted AI advisor data — priorities profile and metadata. */
  aiProfile: z.object({
    priorities: z.string().optional(),
    lastPrioritiesAt: z.string().optional(),
    lastReviewAt: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

/** Increment this whenever a new migration is added. */
export const CURRENT_SCHEMA_VERSION = 7;

export function validateState(data) {
  return stateSchema.parse(data);
}

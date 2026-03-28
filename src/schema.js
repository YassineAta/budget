import { z } from 'zod';

export const goalSchema = z.object({
  id: z.string(),
  name: z.string(),
  target: z.number().min(0),
  saved: z.number().min(0),
  priority: z.enum(['High', 'Medium', 'Low']).optional(),
  category: z.string().optional(),
  isBuffer: z.boolean().optional(),
  isRecurring: z.boolean().optional(),
  monthlyCost: z.number().min(0).optional(),
  targetDate: z.string().optional(),
  /** 'saving' = normal savings goal; 'wishlist' = does not affect balance */
  type: z.enum(['saving', 'wishlist']).optional(),
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
  date: z.string()
}).passthrough();

export const incomeEventSchema = z.object({
  id: z.string(),
  source: z.string(),
  amount: z.number().min(0),
  date: z.string()
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
  goals: z.array(goalSchema),
  recurringExpenses: z.array(recurringExpenseSchema).optional(),
  incomeEvents: z.array(incomeEventSchema).optional(),
  settings: z.object({
    currency: z.string()
  }).passthrough()
}).passthrough();

export function validateState(data) {
  return stateSchema.parse(data);
}

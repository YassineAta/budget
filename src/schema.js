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
  incomeEvents: z.array(incomeEventSchema).optional(),
  settings: z.object({
    currency: z.string()
  }).passthrough()
}).passthrough();

export function validateState(data) {
  return stateSchema.parse(data);
}

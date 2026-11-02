/**
 * The error agent API code throws to answer with a status and a message.
 * It lives on its own so the many modules that only throw it don't load
 * all of `issues.ts` (Prisma, events, notifications) just for this class.
 */
export class IssueApiError extends Error {
  constructor(public status: number, message: string, public body?: Record<string, unknown>) { super(message); }
}

/**
 * Error and id check shared by the client-activity routes (and, until
 * October 2026, the assistant client API they grew out of). `status` is the
 * HTTP status the route answers with; the message is written for the person
 * at the keyboard.
 */
export class AssistantClientError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function assertAssistantId(id: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new AssistantClientError(400, 'Invalid record identifier.');
}

import { ApiError } from '../api';

// Turns anything thrown by a request into something worth showing a user.
//
// The API answers a refusal with a sentence meant to be read ("Only a draft
// requisition can be submitted"), and ApiError carries it; anything else is a
// network or programming fault with no such sentence, so it is stringified as
// a last resort. Every page needs this, and before it existed the same
// expression was written out 95 times.
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : String(error);
}

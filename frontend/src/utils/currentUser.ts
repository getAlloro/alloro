/**
 * currentUser — shared helper to decode the signed-in user id from the JWT
 * payload without pulling in a full jwt lib. Returns null if the token is
 * missing or malformed — callers should treat that the same as "not the
 * author/uploader" (UI hides edit/delete controls; the server still
 * enforces the real authorization check).
 *
 * Uses the shared auth-token resolver so pilot mode, normal storage-backed
 * sessions, and shared-cookie sessions stay centralized in the API client.
 */
import { getAuthToken } from "../api";
import { decodeJwtUserId } from "./jwt";

export function getCurrentUserId(): number | null {
  return decodeJwtUserId(getAuthToken());
}

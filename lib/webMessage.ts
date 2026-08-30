/**
 * A direct message, on the wire.
 *
 * Its own module because the shape is the bug. The POST used to answer with the
 * Prisma row itself — `NextResponse.json({ success: true, message })` — and a
 * row carries `SenderSteamId` and `RecipientSteamId` as `BigInt`, which
 * `JSON.stringify` refuses outright:
 *
 *     TypeError: Do not know how to serialize a BigInt
 *
 * The row is written before the response is serialised, so the message was
 * saved and the request still returned 500. From the sender's side that looked
 * like a failure: the optimistic line was pulled back off the screen and the
 * text was put back in the box, while the message sat in the database waiting
 * for a reload. The GET had always mapped its rows properly, which is exactly
 * why reading worked and sending did not.
 *
 * One mapper, used by both, so the two cannot disagree about field names again
 * — and exported so a test can assert the shape without a database.
 */

/** What a `WebMessage` row looks like to this mapper. */
export type WebMessageRow = {
  Id: number;
  SenderSteamId: bigint;
  RecipientSteamId: bigint | null;
  Content: string;
  CreatedAtUtc: Date;
};

export type WireMessage = {
  id: number;
  from: string;
  to: string | undefined;
  content: string;
  ts: number;
  isAdmin?: boolean;
};

/**
 * Ids become strings, not numbers.
 *
 * A SteamID64 is larger than `Number.MAX_SAFE_INTEGER`, so sending one as a
 * JSON number would round it — silently, and to a value that still looks like a
 * SteamID. Every id that leaves this app is a string for that reason.
 */
export function toWireMessage(row: WebMessageRow, isAdmin?: boolean): WireMessage {
  const wire: WireMessage = {
    id: row.Id,
    from: row.SenderSteamId.toString(),
    to: row.RecipientSteamId?.toString(),
    content: row.Content,
    ts: row.CreatedAtUtc.getTime(),
  };

  if (isAdmin !== undefined) wire.isAdmin = isAdmin;
  return wire;
}

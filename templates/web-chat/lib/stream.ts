import type { ArcieStreamEvent } from "./types";

/**
 * Reads an NDJSON stream from `response.body` and yields decoded events.
 * Tolerates partial lines split across chunks and skips malformed rows so
 * one bad event doesn't stop the stream.
 */
export async function* readArcieStream(
  response: Response,
): AsyncIterable<ArcieStreamEvent> {
  if (response.body === null) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try {
        yield JSON.parse(trimmed) as ArcieStreamEvent;
      } catch {
        // Ignore malformed lines; a partial chunk may still finish next round.
      }
    }
  }

  const tail = buffer.trim();
  if (tail.length > 0) {
    try {
      yield JSON.parse(tail) as ArcieStreamEvent;
    } catch {
      /* ignore */
    }
  }
}

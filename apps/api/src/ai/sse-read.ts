/**
 * sse-read.ts — Read a fetch() streaming body as Server-Sent Events.
 *
 * The provider HTTP APIs (Anthropic, OpenAI, Gemini) all stream their responses
 * as SSE. This small helper turns the response body's byte stream into an async
 * iterator of parsed { event, data } records so each provider file can focus on
 * its own payload shape rather than re-implementing line buffering.
 */

export interface SSERecord {
  event: string;
  data: string;
}

export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSERecord> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE records are separated by a blank line.
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length) yield { event, data: dataLines.join("\n") };
    }
  }
}

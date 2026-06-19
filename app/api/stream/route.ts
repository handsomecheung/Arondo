import { eventBus, SseEvent } from "@/lib/event-bus";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send an initial heartbeat
      controller.enqueue(encoder.encode("data: {\"type\":\"connected\"}\n\n"));

      const unsubscribe = eventBus.subscribe((event: SseEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Client disconnected
          unsubscribe();
        }
      });

      // Heartbeat every 25 seconds to keep the connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      }, 25_000);

      // Cleanup when the client closes the connection
      return () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

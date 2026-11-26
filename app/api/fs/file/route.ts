import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifyRunnerPermission } from "@/lib/auth";
import { getMimeType } from "@/lib/media-types";

const STREAM_CHUNK_SIZE = 1024 * 1024; // 1MB per chunk

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get("path");
  const runnerId = searchParams.get("runner");
  const offsetParam = searchParams.get("offset");
  const lengthParam = searchParams.get("length");
  const isRaw = searchParams.get("raw") === "1" || searchParams.get("raw") === "true";
  const isDownload = searchParams.get("download") === "1" || searchParams.get("download") === "true";
  const rangeHeader = request.headers.get("range");

  if (!runnerId) {
    return NextResponse.json({ error: "runner query parameter is required" }, { status: 400 });
  }
  if (!filePath) {
    return NextResponse.json({ error: "path query parameter is required" }, { status: 400 });
  }

  const token = getArondoToken(request);
  if (!(await verifyRunnerPermission(runnerId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!runnerManager.getRunner(runnerId)) {
    return NextResponse.json({ error: "Runner not found or disconnected" }, { status: 503 });
  }

  if (isRaw || isDownload || rangeHeader) {
    try {
      const mimeType = getMimeType(filePath);
      const filename = path.basename(filePath);
      const encodedFilename = encodeURIComponent(filename);

      if (rangeHeader) {
        const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
        if (!match) {
          return new Response("Invalid Range", { status: 416, headers: { "Content-Range": "bytes */*" } });
        }

        let start: number;
        let end: number | undefined;

        if (match[1] === "" && match[2] !== "") {
          const probe = await runnerManager.sendRequest(runnerId, "fs.read", {
            path: filePath,
            offset: 0,
            length: 1,
            encoding: "base64",
          });
          const totalSize = probe.totalSize;
          const suffix = parseInt(match[2], 10);
          start = Math.max(0, totalSize - suffix);
          end = totalSize - 1;
        } else {
          start = parseInt(match[1], 10);
          if (match[2] !== "") {
            end = parseInt(match[2], 10);
          }
        }

        const requestedLength = end !== undefined ? end - start + 1 : STREAM_CHUNK_SIZE;
        const fetchLength = Math.min(requestedLength, STREAM_CHUNK_SIZE);

        const result = await runnerManager.sendRequest(runnerId, "fs.read", {
          path: filePath,
          offset: start,
          length: fetchLength,
          encoding: "base64",
        });

        const totalSize = result.totalSize;
        if (start >= totalSize && totalSize > 0) {
          return new Response("Range Not Satisfiable", {
            status: 416,
            headers: {
              "Content-Range": `bytes */${totalSize}`,
            },
          });
        }

        const chunk = Buffer.from(result.content, "base64");
        const actualEnd = start + chunk.length - 1;

        const headers = new Headers();
        headers.set("Content-Type", mimeType);
        headers.set("Content-Range", `bytes ${start}-${actualEnd}/${totalSize}`);
        headers.set("Content-Length", String(chunk.length));
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "private, max-age=3600");
        headers.set(
          "Content-Disposition",
          `${isDownload ? "attachment" : "inline"}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
        );

        return new Response(chunk, { status: 206, headers });
      }

      const firstChunkRes = await runnerManager.sendRequest(runnerId, "fs.read", {
        path: filePath,
        offset: 0,
        length: STREAM_CHUNK_SIZE,
        encoding: "base64",
      });

      const totalSize = firstChunkRes.totalSize;
      const firstChunk = Buffer.from(firstChunkRes.content, "base64");

      const headers = new Headers();
      headers.set("Content-Type", mimeType);
      headers.set("Content-Length", String(totalSize));
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "private, max-age=3600");
      headers.set(
        "Content-Disposition",
        `${isDownload ? "attachment" : "inline"}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
      );

      if (!firstChunkRes.hasMore || firstChunk.length >= totalSize) {
        return new Response(firstChunk, { status: 200, headers });
      }

      let currentOffset = firstChunk.length;
      let hasSentFirst = false;

      const stream = new ReadableStream({
        async pull(controller) {
          if (!hasSentFirst) {
            hasSentFirst = true;
            controller.enqueue(firstChunk);
            return;
          }
          if (currentOffset >= totalSize) {
            controller.close();
            return;
          }
          const next = await runnerManager.sendRequest(runnerId, "fs.read", {
            path: filePath,
            offset: currentOffset,
            length: STREAM_CHUNK_SIZE,
            encoding: "base64",
          });
          const buf = Buffer.from(next.content, "base64");
          if (buf.length === 0) {
            controller.close();
            return;
          }
          controller.enqueue(buf);
          currentOffset += buf.length;
          if (!next.hasMore || currentOffset >= totalSize) {
            controller.close();
          }
        },
      });

      return new Response(stream, { status: 200, headers });
    } catch (error: any) {
      const status = error.message?.includes("NOT_FOUND") ? 404 : 500;
      return NextResponse.json({ error: error.message || "Failed to read file" }, { status });
    }
  }

  const offset = parseInt(offsetParam ?? "0", 10);
  const length = parseInt(lengthParam ?? "0", 10);

  try {
    const payload: Record<string, unknown> = { path: filePath };
    if (offset > 0) payload.offset = offset;
    if (length > 0) payload.length = length;

    const result = await runnerManager.sendRequest(runnerId, "fs.read", payload);
    return NextResponse.json({
      path: result.path,
      content: result.content,
      size: result.size,
      totalSize: result.totalSize,
      offset: result.offset ?? 0,
      hasMore: result.hasMore ?? false,
    });
  } catch (error: any) {
    const status = error.message?.includes("NOT_FOUND") ? 404 : 500;
    return NextResponse.json({ error: error.message || "Failed to read file" }, { status });
  }
}

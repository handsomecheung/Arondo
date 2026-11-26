"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  IconX,
  IconCornerLeftUp,
  IconFolder,
  IconFile,
  IconCode,
  IconChevronDown,
  IconImage,
  IconVideo,
  IconDownload,
  IconExternalLink,
} from "@/components/Icons";
import {
  isImageFileName,
  isVideoFileName,
  isAudioFileName,
} from "@/lib/media-types";

const CHUNK_SIZE = 64 * 1024; // 64KB per chunk

interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  runnerId: string;
  initialPath?: string;
  initialFilePath?: string;
}

type View = "list" | "file";

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  py: "python", go: "go", rs: "rust", java: "java", rb: "ruby",
  sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
  md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
  toml: "toml", css: "css", scss: "css", html: "xml", xml: "xml",
  sql: "sql", c: "c", cpp: "cpp", h: "cpp", hpp: "cpp",
  kt: "kotlin", swift: "swift", cs: "csharp", php: "php",
  dockerfile: "dockerfile", tf: "hcl", svg: "xml",
};

async function highlightChunk(content: string, ext: string): Promise<string> {
  const hljs = (await import("highlight.js")).default;
  const lang = LANG_MAP[ext];
  const result = lang && hljs.getLanguage(lang)
    ? hljs.highlight(content, { language: lang })
    : hljs.highlightAuto(content);
  return result.value;
}

export default function FileBrowserModal({ open, onClose, runnerId, initialPath = "/", initialFilePath }: Props) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [dirLoading, setDirLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [highlightedChunks, setHighlightedChunks] = useState<string[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [loadedOffset, setLoadedOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [token, setToken] = useState<string>("");
  const [mediaDimensions, setMediaDimensions] = useState<{ width: number; height: number } | null>(null);
  const [svgMode, setSvgMode] = useState<"preview" | "code">("preview");
  const [imageFit, setImageFit] = useState(true);

  const [mobileView, setMobileView] = useState<View>("list");
  const [wordWrap, setWordWrap] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const filePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("arondo_token");
      if (stored) setToken(stored);
    }
  }, []);

  const loadDir = useCallback((path: string) => {
    if (!runnerId) return;
    setDirLoading(true);
    fetch(`/api/fs?runner=${encodeURIComponent(runnerId)}&path=${encodeURIComponent(path)}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load directory");
        return r.json();
      })
      .then((data) => {
        setEntries(data.entries || []);
        setParentPath(data.parentPath ?? null);
        if (data.currentPath) setCurrentPath(data.currentPath);
      })
      .catch(() => {
        setEntries([]);
        setParentPath(null);
      })
      .finally(() => setDirLoading(false));
  }, [runnerId]);

  const fetchChunk = useCallback(async (path: string, offset: number): Promise<void> => {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const r = await fetch(
      `/api/fs/file?runner=${encodeURIComponent(runnerId)}&path=${encodeURIComponent(path)}&offset=${offset}&length=${CHUNK_SIZE}`
    );
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${r.status}`);
    }
    const data = await r.json();
    const highlighted = await highlightChunk(data.content as string, ext);
    setHighlightedChunks((prev) => [...prev, highlighted]);
    setTotalSize(data.totalSize);
    setLoadedOffset(data.offset + data.size);
    setHasMore(data.hasMore);
  }, [runnerId]);

  const openFile = useCallback(async (filePath: string, forceCodeMode = false) => {
    setSelectedFile(filePath);
    setHighlightedChunks([]);
    setFileError(null);
    setMobileView("file");
    setTotalSize(0);
    setLoadedOffset(0);
    setHasMore(false);
    setMediaDimensions(null);
    setImageFit(true);

    const isSvg = filePath.toLowerCase().endsWith(".svg");
    const isImage = isImageFileName(filePath);
    const isVideo = isVideoFileName(filePath);
    const isAudio = isAudioFileName(filePath);

    if ((isImage && !(isSvg && forceCodeMode)) || isVideo || isAudio) {
      setFileLoading(false);
      return;
    }

    setFileLoading(true);
    try {
      await fetchChunk(filePath, 0);
    } catch (err: any) {
      setFileError(err.message || "Failed to load file");
    } finally {
      setFileLoading(false);
    }
  }, [fetchChunk]);

  const loadMoreChunk = useCallback(async () => {
    if (!selectedFile || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await fetchChunk(selectedFile, loadedOffset);
    } catch {
      // silently ignore transient chunk errors
    } finally {
      setLoadingMore(false);
    }
  }, [selectedFile, loadedOffset, hasMore, loadingMore, fetchChunk]);

  useEffect(() => {
    const el = filePanelRef.current;
    if (!el || !hasMore) return;

    const handleScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
        loadMoreChunk();
      }
    };

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [hasMore, loadMoreChunk]);

  useEffect(() => {
    if (!open || !runnerId) return;
    if (initialFilePath) {
      const lastSlash = initialFilePath.lastIndexOf("/");
      const dir = lastSlash > 0 ? initialFilePath.slice(0, lastSlash) : "/";
      loadDir(dir);
      openFile(initialFilePath);
    } else {
      loadDir(initialPath);
    }
  }, [open, runnerId, initialFilePath, loadDir, openFile, initialPath]);

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    loadDir(path);
  };

  const handleClose = () => {
    setMobileView("list");
    setSelectedFile(null);
    setHighlightedChunks([]);
    setFileError(null);
    setMediaDimensions(null);
    setSvgMode("preview");
    setImageFit(true);
    onClose();
  };

  const isSelectedSvg = Boolean(selectedFile && selectedFile.toLowerCase().endsWith(".svg"));
  const isSelectedImage = Boolean(selectedFile && isImageFileName(selectedFile));
  const isSelectedVideo = Boolean(selectedFile && isVideoFileName(selectedFile));
  const isSelectedAudio = Boolean(selectedFile && isAudioFileName(selectedFile));
  const isCodeMode = isSelectedSvg && svgMode === "code";
  const isSelectedMedia = (isSelectedImage || isSelectedVideo || isSelectedAudio) && !isCodeMode;

  const rawMediaUrl = useMemo(() => {
    if (!selectedFile || !runnerId) return "";
    const params = new URLSearchParams({
      runner: runnerId,
      path: selectedFile,
      raw: "1",
    });
    if (token) params.set("token", token);
    return `/api/fs/file?${params.toString()}`;
  }, [selectedFile, runnerId, token]);

  const downloadMediaUrl = useMemo(() => {
    if (!selectedFile || !runnerId) return "";
    const params = new URLSearchParams({
      runner: runnerId,
      path: selectedFile,
      download: "1",
    });
    if (token) params.set("token", token);
    return `/api/fs/file?${params.toString()}`;
  }, [selectedFile, runnerId, token]);

  const toggleSvgMode = (mode: "preview" | "code") => {
    setSvgMode(mode);
    if (selectedFile) {
      openFile(selectedFile, mode === "code");
    }
  };

  if (!open) return null;

  const loadedKB = Math.ceil(loadedOffset / 1024);
  const totalKB = Math.ceil(totalSize / 1024);
  const selectedBasename = selectedFile ? selectedFile.split("/").pop() : "";

  const renderMediaPreview = () => {
    if (!selectedFile) return null;

    if (isSelectedImage) {
      return (
        <div className="fb-media-preview">
          <div className="fb-media-toolbar">
            <span className="fb-media-filename" title={selectedBasename}>{selectedBasename}</span>
            {mediaDimensions && (
              <span className="fb-media-meta">{mediaDimensions.width} × {mediaDimensions.height}</span>
            )}
            <div className="fb-media-actions">
              <button
                type="button"
                className={`fb-media-action-btn${imageFit ? " active" : ""}`}
                onClick={() => setImageFit((v) => !v)}
                title={imageFit ? "View at 1:1 original size" : "Fit to window"}
              >
                {imageFit ? "⤢ Fit" : "1:1"}
              </button>
              {isSelectedSvg && (
                <button
                  type="button"
                  className={`fb-media-action-btn${svgMode === "code" ? " active" : ""}`}
                  onClick={() => toggleSvgMode("code")}
                >
                  <IconCode />
                  <span>Code</span>
                </button>
              )}
              <a href={downloadMediaUrl} download={selectedBasename} className="fb-media-action-btn" title="Download">
                <IconDownload size={13} />
                <span>Download</span>
              </a>
              <a href={rawMediaUrl} target="_blank" rel="noopener noreferrer" className="fb-media-action-btn" title="Open in new tab">
                <IconExternalLink size={13} />
              </a>
            </div>
          </div>
          <div className={`fb-image-container${imageFit ? "" : " fb-overflow"}`}>
            <img
              src={rawMediaUrl}
              alt={selectedBasename}
              className={`fb-image-element${imageFit ? " fb-fit" : " fb-original"}`}
              style={{ cursor: imageFit ? "zoom-in" : "zoom-out" }}
              onClick={() => setImageFit((v) => !v)}
              onLoad={(e) => {
                const img = e.currentTarget;
                setMediaDimensions({ width: img.naturalWidth, height: img.naturalHeight });
              }}
              onError={() => {
                setFileError("Failed to load image");
              }}
            />
          </div>
        </div>
      );
    }

    if (isSelectedVideo) {
      return (
        <div className="fb-media-preview">
          <div className="fb-media-toolbar">
            <span className="fb-media-filename" title={selectedBasename}>{selectedBasename}</span>
            {mediaDimensions && (
              <span className="fb-media-meta">{mediaDimensions.width} × {mediaDimensions.height}</span>
            )}
            <div className="fb-media-actions">
              <a href={downloadMediaUrl} download={selectedBasename} className="fb-media-action-btn" title="Download">
                <IconDownload size={13} />
                <span>Download</span>
              </a>
              <a href={rawMediaUrl} target="_blank" rel="noopener noreferrer" className="fb-media-action-btn" title="Open in new tab">
                <IconExternalLink size={13} />
              </a>
            </div>
          </div>
          <div className="fb-video-container">
            <video
              src={rawMediaUrl}
              controls
              playsInline
              className="fb-video-element"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setMediaDimensions({ width: v.videoWidth, height: v.videoHeight });
              }}
              onError={() => {
                setFileError("Failed to load video");
              }}
            />
          </div>
        </div>
      );
    }

    if (isSelectedAudio) {
      return (
        <div className="fb-media-preview">
          <div className="fb-media-toolbar">
            <span className="fb-media-filename" title={selectedBasename}>{selectedBasename}</span>
            <div className="fb-media-actions">
              <a href={downloadMediaUrl} download={selectedBasename} className="fb-media-action-btn" title="Download">
                <IconDownload size={13} />
                <span>Download</span>
              </a>
            </div>
          </div>
          <div className="fb-audio-container">
            <audio
              src={rawMediaUrl}
              controls
              className="fb-audio-element"
              onError={() => {
                setFileError("Failed to load audio");
              }}
            />
          </div>
        </div>
      );
    }

    return null;
  };

  const filePanel = (
    <div className="fb-file-panel" ref={filePanelRef}>
      {!selectedFile ? (
        <div className="fb-file-empty">
          <IconCode />
          <span>Select a file to preview</span>
        </div>
      ) : fileLoading ? (
        <div className="fb-file-loading">Loading…</div>
      ) : fileError ? (
        <div className="fb-file-error">{fileError}</div>
      ) : isSelectedMedia ? (
        renderMediaPreview()
      ) : (
        <>
          {isSelectedSvg && (
            <div className="fb-media-toolbar">
              <span className="fb-media-filename" title={selectedBasename}>{selectedBasename}</span>
              <div className="fb-media-actions">
                <button
                  type="button"
                  className="fb-media-action-btn"
                  onClick={() => toggleSvgMode("preview")}
                >
                  <IconImage size={13} />
                  <span>Preview</span>
                </button>
              </div>
            </div>
          )}
          <pre className={`fb-code-pre${wordWrap ? " fb-wrap" : ""}`}>
            {highlightedChunks.map((html, i) => (
              <code key={i} dangerouslySetInnerHTML={{ __html: html }} />
            ))}
            {(hasMore || loadingMore) && (
              <div className="fb-chunk-status">
                {loadingMore
                  ? `Loading… ${loadedKB} / ${totalKB} KB`
                  : `${loadedKB} / ${totalKB} KB — scroll to load more`}
              </div>
            )}
          </pre>
        </>
      )}
    </div>
  );

  const listPanel = (
    <div className="fb-list-panel">
      <div className="fs-current-path">{currentPath}</div>
      <div className="fs-list">
        {parentPath !== null && (
          <div className="fs-item fs-parent" onClick={() => navigateTo(parentPath)}>
            <span className="fs-item-icon"><IconCornerLeftUp /></span>
            <span className="fs-item-name">.. (Go Up)</span>
          </div>
        )}
        {dirLoading ? (
          <div className="fb-dir-loading">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="fb-dir-empty">Empty directory</div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.path}
              className={`fs-item${selectedFile === entry.path ? " active" : ""}${!entry.isDir ? " fb-file-item" : ""}`}
              onClick={() => entry.isDir ? navigateTo(entry.path) : openFile(entry.path)}
            >
              <span className="fs-item-icon">
                {entry.isDir ? (
                  <IconFolder />
                ) : isImageFileName(entry.name) ? (
                  <IconImage />
                ) : isVideoFileName(entry.name) ? (
                  <IconVideo />
                ) : (
                  <IconFile />
                )}
              </span>
              <span className="fs-item-name" title={entry.name}>{entry.name}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal modal-lg fb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          {mobileView === "file" ? (
            <button className="fb-back-btn" onClick={() => setMobileView("list")}>
              ← Back
            </button>
          ) : null}
          <span className="modal-title fb-modal-title">
            {mobileView === "file" && selectedFile
              ? selectedFile.split("/").pop()
              : "File Browser"}
          </span>
          <button
            className={`modal-close-btn fb-options-toggle${optionsOpen ? " active" : ""}`}
            onClick={() => setOptionsOpen((v) => !v)}
            aria-label="Toggle options"
          >
            <IconChevronDown className={optionsOpen ? "fb-chevron-up" : undefined} />
          </button>
          <button className="modal-close-btn" onClick={handleClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        {optionsOpen && (
          <div className="fb-options-bar">
            {!isSelectedMedia && (
              <button
                className={`fb-wrap-btn${wordWrap ? " active" : ""}`}
                onClick={() => setWordWrap((v) => !v)}
              >
                ↵ Wrap
              </button>
            )}
            {selectedFile && (
              <a
                href={downloadMediaUrl}
                download={selectedBasename}
                className="fb-wrap-btn"
                title="Download"
              >
                ↓ Download
              </a>
            )}
          </div>
        )}

        {/* Desktop: two-column layout */}
        <div className="fb-desktop-body">
          {listPanel}
          <div className="fb-divider" />
          {filePanel}
        </div>

        {/* Mobile: single-view switching */}
        <div className="fb-mobile-body">
          {mobileView === "list" ? listPanel : filePanel}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconMoreVertical, IconCopy, IconDownload, IconPaperclip, IconX } from "@/components/Icons";
import { useTaskMenuPlacement } from "@/components/useTaskMenuPlacement";
import { handleCardDoubleClick } from "@/components/ExecCard";

export interface MessageFileAttachment {
  name: string;
  serverFilename?: string;
  size?: number;
  mimeType?: string;
}

export interface UserMessageCardProps {
  content: string;
  timestamp?: string;
  renderContent?: (content: string) => React.ReactNode;
  userName?: string;
  userColor?: string;
  sessionId?: string;
  files?: MessageFileAttachment[];
}

interface ImagePreview {
  name: string;
  viewUrl: string;
  downloadUrl: string;
}

function isImage(filename: string, mimeType?: string): boolean {
  if (mimeType && mimeType.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(filename);
}

function isAudio(filename: string, mimeType?: string): boolean {
  if (mimeType && mimeType.startsWith("audio/")) return true;
  return /\.(mp3|wav|ogg|m4a)$/i.test(filename);
}

function isVideo(filename: string, mimeType?: string): boolean {
  if (mimeType && mimeType.startsWith("video/")) return true;
  return /\.(mp4|webm|mov)$/i.test(filename);
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * UserMessageCard represents a plain user chat message in the session
 * timeline, styled like UserAgentCommandCard (light purple background) so
 * user-authored entries are visually distinct from agent/system output.
 */
export default function UserMessageCard({
  content,
  timestamp,
  renderContent,
  userName,
  userColor,
  sessionId,
  files,
}: UserMessageCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { opensUpward, maxHeight } = useTaskMenuPlacement(menuOpen, menuRef, dropdownRef);
  const [token, setToken] = useState("");
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const previewHistoryEntryRef = useRef(false);
  const previewTriggerRef = useRef<HTMLImageElement>(null);

  const closeImagePreview = useCallback(() => {
    if (previewHistoryEntryRef.current) {
      window.history.back();
      return;
    }
    setImagePreview(null);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("arondo_token");
      if (stored) setToken(stored);
    }
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!imagePreview) return;

    const previousOverflow = document.body.style.overflow;
    const closeFromHistory = () => {
      previewHistoryEntryRef.current = false;
      setImagePreview(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeImagePreview();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("popstate", closeFromHistory);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("popstate", closeFromHistory);
      window.removeEventListener("keydown", handleKeyDown);
      previewTriggerRef.current?.focus();
    };
  }, [imagePreview, closeImagePreview]);

  // Discover attached files from either the explicit files prop or fallback to parsing the content
  const resolvedFiles = useMemo<MessageFileAttachment[]>(() => {
    if (files && files.length > 0) {
      return files;
    }
    const matches = Array.from(content.matchAll(/^[ \t]*📎 Uploaded a file:\s*(.+)$/gm));
    if (matches.length > 0) {
      return matches.map((m) => ({ name: m[1].trim() }));
    }
    return [];
  }, [files, content]);

  // Strip the "📎 Uploaded a file: ..." notes so the message body doesn't duplicate them
  const textContent = useMemo(() => {
    if (resolvedFiles.length === 0) return content;
    return content.replace(/^[ \t]*📎 Uploaded a file:\s*.+\r?\n?/gm, "").trim();
  }, [content, resolvedFiles.length]);

  const getFileUrls = (file: MessageFileAttachment) => {
    if (!sessionId) return { viewUrl: "", downloadUrl: "" };
    const query = new URLSearchParams();
    if (token) query.set("token", token);
    const viewQuery = query.toString() ? `?${query.toString()}` : "";

    query.set("download", "1");
    const downloadQuery = `?${query.toString()}`;

    const filenamePart = encodeURIComponent(file.serverFilename || file.name);
    const baseUrl = `/api/sessions/${encodeURIComponent(sessionId)}/files/${filenamePart}`;
    return {
      viewUrl: `${baseUrl}${viewQuery}`,
      downloadUrl: `${baseUrl}${downloadQuery}`,
    };
  };

  const openImagePreview = (file: MessageFileAttachment, viewUrl: string, downloadUrl: string, trigger: HTMLImageElement) => {
    previewTriggerRef.current = trigger;
    if (!imagePreview) {
      window.history.pushState({ ...window.history.state, arondoImagePreview: true }, "");
      previewHistoryEntryRef.current = true;
    }
    setImagePreview({ name: file.name, viewUrl, downloadUrl });
  };

  const displayName = userName || "User";
  const displayColor = userColor || "#6b7280";

  return (
    <div
      className="exec-card user-message-card"
      onDoubleClick={handleCardDoubleClick}
    >
      <div className="exec-card-header">
        <div
          title={displayName}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            backgroundColor: displayColor,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            flexShrink: 0,
            textTransform: "uppercase",
          }}
        >
          {displayName.charAt(0) || "?"}
        </div>
        <div className="exec-card-info user-message-card-content">
          {textContent ? (renderContent ? renderContent(textContent) : textContent) : null}

          {resolvedFiles.length > 0 && (
            <div className="user-message-files">
              {resolvedFiles.map((file, idx) => {
                const { viewUrl, downloadUrl } = getFileUrls(file);
                const fileKey = file.serverFilename || `${file.name}-${idx}`;

                if (isImage(file.name, file.mimeType) && viewUrl) {
                  return (
                    <div
                      key={fileKey}
                      className="user-message-attachment user-message-image-container"
                      style={{ maxWidth: "100%", overflow: "hidden" }}
                    >
                      <div
                        className="user-message-image-wrapper"
                        style={{ maxWidth: "100%", maxHeight: 260, overflow: "hidden" }}
                      >
                        <img
                          src={viewUrl}
                          alt={file.name}
                          className="user-message-image-preview"
                          loading="lazy"
                          style={{ maxWidth: "100%", maxHeight: 260, objectFit: "contain" }}
                          onClick={(event) => openImagePreview(file, viewUrl, downloadUrl, event.currentTarget)}
                          title={`Open ${file.name} fullscreen`}
                        />
                      </div>
                      <div className="user-message-file-footer">
                        <div className="user-message-file-name" title={file.name}>
                          {file.name}
                          {file.size ? (
                            <span className="user-message-file-size"> ({formatFileSize(file.size)})</span>
                          ) : null}
                        </div>
                        <a
                          href={downloadUrl}
                          download={file.name}
                          className="user-message-download-btn"
                          title={`Download ${file.name}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconDownload size={14} />
                          <span>Download</span>
                        </a>
                      </div>
                    </div>
                  );
                }

                if (isAudio(file.name, file.mimeType) && viewUrl) {
                  return (
                    <div key={fileKey} className="user-message-attachment user-message-media-container">
                      <audio controls src={viewUrl} className="user-message-audio-player" />
                      <div className="user-message-file-footer">
                        <div className="user-message-file-name" title={file.name}>
                          {file.name}
                          {file.size ? (
                            <span className="user-message-file-size"> ({formatFileSize(file.size)})</span>
                          ) : null}
                        </div>
                        <a
                          href={downloadUrl}
                          download={file.name}
                          className="user-message-download-btn"
                          title={`Download ${file.name}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconDownload size={14} />
                          <span>Download</span>
                        </a>
                      </div>
                    </div>
                  );
                }

                if (isVideo(file.name, file.mimeType) && viewUrl) {
                  return (
                    <div key={fileKey} className="user-message-attachment user-message-media-container">
                      <video controls src={viewUrl} className="user-message-video-player" />
                      <div className="user-message-file-footer">
                        <div className="user-message-file-name" title={file.name}>
                          {file.name}
                          {file.size ? (
                            <span className="user-message-file-size"> ({formatFileSize(file.size)})</span>
                          ) : null}
                        </div>
                        <a
                          href={downloadUrl}
                          download={file.name}
                          className="user-message-download-btn"
                          title={`Download ${file.name}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <IconDownload size={14} />
                          <span>Download</span>
                        </a>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={fileKey} className="user-message-attachment user-message-file-card">
                    <div className="user-message-file-info">
                      <span className="user-message-file-icon">
                        <IconPaperclip size={16} />
                      </span>
                      <div className="user-message-file-meta">
                        <span className="user-message-file-name" title={file.name}>
                          {file.name}
                        </span>
                        {file.size ? (
                          <span className="user-message-file-size">{formatFileSize(file.size)}</span>
                        ) : null}
                      </div>
                    </div>
                    {downloadUrl ? (
                      <a
                        href={downloadUrl}
                        download={file.name}
                        className="user-message-download-btn"
                        title={`Download ${file.name}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconDownload size={14} />
                        <span>Download</span>
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="exec-card-actions">
          <div className="task-menu-container" ref={menuRef}>
            <button
              className="task-menu-btn exec-card-menu-btn"
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              title="More actions"
            >
              <IconMoreVertical />
            </button>
            {menuOpen && (
              <div
                className={`task-menu-dropdown${opensUpward ? " task-menu-dropdown-upward" : ""}`}
                ref={dropdownRef}
                style={maxHeight ? { maxHeight } : undefined}
              >
                <button
                  className="task-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    navigator.clipboard.writeText(content);
                  }}
                >
                  <IconCopy />
                  <span>Copy</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {timestamp && <div className="exec-card-time">{timestamp}</div>}
      {imagePreview && (
        <div className="image-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Preview ${imagePreview.name}`} onClick={closeImagePreview}>
          <div className="image-preview-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="image-preview-header">
              <span className="image-preview-title" title={imagePreview.name}>{imagePreview.name}</span>
              <div className="image-preview-actions">
                <a href={imagePreview.downloadUrl} download={imagePreview.name} className="image-preview-download" title={`Download ${imagePreview.name}`}>
                  <IconDownload size={16} />
                  <span>Download</span>
                </a>
                <button type="button" className="image-preview-close" onClick={closeImagePreview} aria-label="Close image preview" title="Close">
                  <IconX />
                </button>
              </div>
            </div>
            <img src={imagePreview.viewUrl} alt={imagePreview.name} className="image-preview-fullscreen-image" />
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { IconX, IconCornerLeftUp, IconFolder, IconFile, IconCode, IconChevronDown } from "@/components/Icons";

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

export default function FileBrowserModal({ open, onClose, runnerId, initialPath = "/", initialFilePath }: Props) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [dirLoading, setDirLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  // Mobile: "list" or "file" view
  const [mobileView, setMobileView] = useState<View>("list");
  const [wordWrap, setWordWrap] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

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
  }, [open, runnerId, initialFilePath]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    loadDir(path);
  };

  const openFile = async (path: string) => {
    setSelectedFile(path);
    setFileContent(null);
    setHighlightedHtml(null);
    setFileError(null);
    setFileLoading(true);
    setMobileView("file");

    try {
      const r = await fetch(`/api/fs/file?runner=${encodeURIComponent(runnerId)}&path=${encodeURIComponent(path)}`);
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      const data = await r.json();
      const content: string = data.content;
      setFileContent(content);

      const hljs = (await import("highlight.js")).default;
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      const langMap: Record<string, string> = {
        ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
        py: "python", go: "go", rs: "rust", java: "java", rb: "ruby",
        sh: "bash", bash: "bash", zsh: "bash", fish: "bash",
        md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
        toml: "toml", css: "css", scss: "css", html: "xml", xml: "xml",
        sql: "sql", c: "c", cpp: "cpp", h: "cpp", hpp: "cpp",
        kt: "kotlin", swift: "swift", cs: "csharp", php: "php",
        dockerfile: "dockerfile", tf: "hcl",
      };
      const lang = langMap[ext];
      const result = lang && hljs.getLanguage(lang)
        ? hljs.highlight(content, { language: lang })
        : hljs.highlightAuto(content);
      setHighlightedHtml(result.value);
    } catch (err: any) {
      setFileError(err.message || "Failed to load file");
    } finally {
      setFileLoading(false);
    }
  };

  const handleClose = () => {
    setMobileView("list");
    setSelectedFile(null);
    setFileContent(null);
    setHighlightedHtml(null);
    setFileError(null);
    onClose();
  };

  if (!open) return null;

  const filePanel = (
    <div className="fb-file-panel">
      {!selectedFile ? (
        <div className="fb-file-empty">
          <IconCode />
          <span>Select a file to preview</span>
        </div>
      ) : fileLoading ? (
        <div className="fb-file-loading">Loading…</div>
      ) : fileError ? (
        <div className="fb-file-error">{fileError}</div>
      ) : (
        <pre className={`fb-code-pre${wordWrap ? " fb-wrap" : ""}`}>
          {highlightedHtml != null ? (
            <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
          ) : (
            <code>{fileContent}</code>
          )}
        </pre>
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
                {entry.isDir ? <IconFolder /> : <IconFile />}
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
            <button
              className={`fb-wrap-btn${wordWrap ? " active" : ""}`}
              onClick={() => setWordWrap((v) => !v)}
            >
              ↵ Wrap
            </button>
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

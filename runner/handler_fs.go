package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const maxFileReadSize = 512 * 1024 // 512KB

type fsReadRequest struct {
	Path string `json:"path"`
}

type fsReadResponse struct {
	OK      bool   `json:"ok"`
	Path    string `json:"path"`
	Content string `json:"content"`
	Size    int64  `json:"size"`
}

func (h *Handler) handleFsRead(msg *Message) {
	req, err := parsePayload[fsReadRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	absPath, err := filepath.Abs(req.Path)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid path: "+err.Error())
		return
	}

	info, err := os.Stat(absPath)
	if err != nil {
		h.sendError(msg.ID, "NOT_FOUND", "file not found: "+err.Error())
		return
	}
	if info.IsDir() {
		h.sendError(msg.ID, "BAD_REQUEST", "path is a directory")
		return
	}
	if info.Size() > maxFileReadSize {
		h.sendError(msg.ID, "TOO_LARGE", fmt.Sprintf("file too large: %d bytes (max %d)", info.Size(), maxFileReadSize))
		return
	}

	content, err := os.ReadFile(absPath)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "failed to read file: "+err.Error())
		return
	}

	h.sendResponse(msg.ID, fsReadResponse{
		OK:      true,
		Path:    absPath,
		Content: string(content),
		Size:    info.Size(),
	})
}

type fsListRequest struct {
	Path string `json:"path"`
}

type dirEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type fsEntry struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	IsDir bool   `json:"isDir"`
}

type fsListResponse struct {
	OK          bool       `json:"ok"`
	CurrentPath string     `json:"currentPath"`
	ParentPath  *string    `json:"parentPath"`
	Directories []dirEntry `json:"directories"`
	Entries     []fsEntry  `json:"entries"`
}

func (h *Handler) handleFsList(msg *Message) {
	req, err := parsePayload[fsListRequest](msg)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid payload: "+err.Error())
		return
	}

	requestedPath := req.Path
	if requestedPath == "" {
		requestedPath = "/"
	}
	currentPath, err := filepath.Abs(requestedPath)
	if err != nil {
		h.sendError(msg.ID, "INTERNAL", "invalid path: "+err.Error())
		return
	}

	entries, err := os.ReadDir(currentPath)
	if err != nil {
		h.sendError(msg.ID, "NOT_FOUND", "failed to read directory: "+err.Error())
		return
	}

	var dirs []dirEntry
	var entriesList []fsEntry
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		isDir := entry.IsDir()
		if !isDir {
			info, err := entry.Info()
			if err == nil {
				if info.Mode()&os.ModeSymlink != 0 {
					target, err := os.Stat(filepath.Join(currentPath, entry.Name()))
					if err == nil && target.IsDir() {
						isDir = true
					}
				}
			}
		}

		if isDir {
			dirs = append(dirs, dirEntry{
				Name: entry.Name(),
				Path: filepath.Join(currentPath, entry.Name()),
			})
		}
		entriesList = append(entriesList, fsEntry{
			Name:  entry.Name(),
			Path:  filepath.Join(currentPath, entry.Name()),
			IsDir: isDir,
		})
	}

	sort.Slice(dirs, func(i, j int) bool {
		return strings.ToLower(dirs[i].Name) < strings.ToLower(dirs[j].Name)
	})

	sort.Slice(entriesList, func(i, j int) bool {
		if entriesList[i].IsDir != entriesList[j].IsDir {
			return entriesList[i].IsDir
		}
		return strings.ToLower(entriesList[i].Name) < strings.ToLower(entriesList[j].Name)
	})

	resp := fsListResponse{
		OK:          true,
		CurrentPath: currentPath,
		Directories: dirs,
		Entries:     entriesList,
	}
	if currentPath != "/" {
		parent := filepath.Dir(currentPath)
		resp.ParentPath = &parent
	}

	h.sendResponse(msg.ID, resp)
}

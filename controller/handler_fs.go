package main

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type fsListRequest struct {
	Path string `json:"path"`
}

type dirEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type fsListResponse struct {
	OK          bool       `json:"ok"`
	CurrentPath string     `json:"currentPath"`
	ParentPath  *string    `json:"parentPath"`
	Directories []dirEntry `json:"directories"`
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
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		if !entry.IsDir() {
			info, err := entry.Info()
			if err != nil {
				continue
			}
			if info.Mode()&os.ModeSymlink != 0 {
				target, err := os.Stat(filepath.Join(currentPath, entry.Name()))
				if err != nil || !target.IsDir() {
					continue
				}
			} else {
				continue
			}
		}
		dirs = append(dirs, dirEntry{
			Name: entry.Name(),
			Path: filepath.Join(currentPath, entry.Name()),
		})
	}

	sort.Slice(dirs, func(i, j int) bool {
		return strings.ToLower(dirs[i].Name) < strings.ToLower(dirs[j].Name)
	})

	resp := fsListResponse{
		OK:          true,
		CurrentPath: currentPath,
		Directories: dirs,
	}
	if currentPath != "/" {
		parent := filepath.Dir(currentPath)
		resp.ParentPath = &parent
	}

	h.sendResponse(msg.ID, resp)
}

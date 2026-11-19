package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type runnerUpdate struct {
	Version     string `json:"version"`
	DownloadURL string `json:"downloadUrl"`
}

type preparedUpdate struct {
	version    string
	executable string
	path       string
}

type runnerUpdater struct {
	ctx         context.Context
	cancel      context.CancelFunc
	ready       chan *preparedUpdate
	mu          sync.Mutex
	wg          sync.WaitGroup
	active      bool
	lastVersion string
	lastAttempt time.Time
}

func newRunnerUpdater() *runnerUpdater {
	ctx, cancel := context.WithCancel(context.Background())
	return &runnerUpdater{ctx: ctx, cancel: cancel, ready: make(chan *preparedUpdate, 1)}
}

func (u *runnerUpdater) schedule(update runnerUpdate) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.ctx.Err() != nil || u.active || strings.TrimPrefix(update.Version, "v") == strings.TrimPrefix(Version, "v") {
		return
	}
	if u.lastVersion == update.Version && time.Since(u.lastAttempt) < time.Minute {
		return
	}
	u.active = true
	u.lastVersion, u.lastAttempt = update.Version, time.Now()
	u.wg.Add(1)
	go func() {
		defer u.wg.Done()
		executable, err := os.Executable()
		if err == nil {
			executable, err = filepath.EvalSymlinks(executable)
		}
		var prepared *preparedUpdate
		if err == nil {
			prepared, err = prepareRunnerUpdate(u.ctx, update, executable, os.Args, os.Environ())
		}
		if err != nil {
			log.Printf("[updater] update to %s failed; keeping current runner: %v", update.Version, err)
			u.finish()
			return
		}
		select {
		case u.ready <- prepared:
		case <-u.ctx.Done():
			prepared.cleanup()
			u.finish()
		}
	}()
}

func (u *runnerUpdater) finish() {
	u.mu.Lock()
	defer u.mu.Unlock()
	u.active = false
}

func (u *runnerUpdater) close() {
	u.mu.Lock()
	u.cancel()
	u.mu.Unlock()
	u.wg.Wait()
	select {
	case update := <-u.ready:
		update.cleanup()
	default:
	}
}

func prepareRunnerUpdate(ctx context.Context, update runnerUpdate, executable string, args, env []string) (_ *preparedUpdate, err error) {
	log.Printf("[updater] downloading runner %s from %s", update.Version, update.DownloadURL)
	file, err := os.CreateTemp(filepath.Dir(executable), ".arondo-runner-update-*")
	if err != nil {
		return nil, fmt.Errorf("create update file: %w", err)
	}
	defer file.Close()
	prepared := &preparedUpdate{version: update.Version, executable: executable, path: file.Name()}
	defer func() {
		if err != nil {
			prepared.cleanup()
		}
	}()
	mode, err := os.Stat(executable)
	if err != nil {
		return nil, err
	}
	if err = downloadRunner(ctx, update.DownloadURL, file); err != nil {
		return nil, err
	}
	if err = file.Chmod(mode.Mode().Perm()); err != nil {
		return nil, err
	}
	if err = file.Sync(); err != nil {
		return nil, err
	}
	if err = file.Close(); err != nil {
		return nil, err
	}

	versionCtx, cancelVersion := context.WithTimeout(ctx, 5*time.Second)
	defer cancelVersion()
	versionCmd := exec.CommandContext(versionCtx, prepared.path, "--version")
	versionCmd.WaitDelay = time.Second
	versionCmd.Env = env
	versionCmd.Stderr = os.Stderr
	output, err := versionCmd.Output()
	if err != nil {
		return nil, fmt.Errorf("check downloaded version: %w", err)
	}
	if strings.TrimSpace(string(output)) != strings.TrimPrefix(update.Version, "v") {
		return nil, fmt.Errorf("downloaded version %q does not match requested version %s", strings.TrimSpace(string(output)), update.Version)
	}

	checkCtx, cancelCheck := context.WithTimeout(ctx, 15*time.Second)
	defer cancelCheck()
	checkArgs := append(append([]string{}, args[1:]...), "--check-connection")
	check := exec.CommandContext(checkCtx, prepared.path, checkArgs...)
	check.Env = env
	check.Stdin, check.Stdout, check.Stderr = os.Stdin, os.Stdout, os.Stderr
	if err = check.Run(); err != nil {
		return nil, fmt.Errorf("new runner connection check failed: %w", err)
	}
	log.Printf("[updater] runner %s passed preflight; waiting for all tasks to finish", update.Version)
	return prepared, nil
}

func downloadRunner(ctx context.Context, downloadURL string, destination io.Writer) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return err
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed: HTTP %d", response.StatusCode)
	}
	written, err := io.Copy(destination, response.Body)
	if err != nil {
		return fmt.Errorf("download incomplete: %w", err)
	}
	if written == 0 {
		return fmt.Errorf("downloaded runner is empty")
	}
	return nil
}

func (p *preparedUpdate) cleanup() {
	_ = os.Remove(p.path)
}

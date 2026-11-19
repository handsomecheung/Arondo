package main

import (
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"syscall"
)

var errUpdateBusy = errors.New("another process is updating this runner binary")

func (p *preparedUpdate) apply(args, env []string, execProcess func(string, []string, []string) error) error {
	lock, err := os.OpenFile(p.executable+".update.lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer lock.Close()
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		if errors.Is(err, syscall.EWOULDBLOCK) {
			return errUpdateBusy
		}
		return err
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
	backup, err := os.CreateTemp(filepath.Dir(p.executable), ".arondo-runner-backup-*")
	if err != nil {
		return err
	}
	backupPath := backup.Name()
	if err := backup.Close(); err != nil {
		os.Remove(backupPath)
		return err
	}
	defer os.Remove(backupPath)
	if err := os.Remove(backupPath); err != nil {
		return err
	}
	if err := os.Link(p.executable, backupPath); err != nil {
		return fmt.Errorf("back up current runner: %w", err)
	}
	previous := p.executable + ".previous"
	if err := os.Rename(backupPath, previous); err != nil {
		return fmt.Errorf("save runner backup: %w", err)
	}
	if err := os.Rename(p.path, p.executable); err != nil {
		return fmt.Errorf("replace runner: %w", err)
	}
	log.Printf("[updater] switching to runner %s; backup saved at %s", p.version, previous)
	if err := execProcess(p.executable, args, env); err != nil {
		if restoreErr := os.Rename(previous, p.executable); restoreErr != nil {
			return fmt.Errorf("exec failed: %v; restoring old binary failed: %w (backup: %s)", err, restoreErr, previous)
		}
		return fmt.Errorf("exec failed; old binary restored: %w", err)
	}
	return nil
}

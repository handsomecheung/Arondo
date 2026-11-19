package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"
)

const testUpdateVersion = "9.8.7"

func updateFixture(check string) string {
	return "#!/usr/bin/env bash\nif [ \"$1\" = --version ]; then echo " + testUpdateVersion + "; exit 0; fi\n" + check
}

func TestPrepareRunnerUpdatePreservesArgumentsAndEnvironment(t *testing.T) {
	directory := t.TempDir()
	executable := filepath.Join(directory, "runner")
	if err := os.WriteFile(executable, []byte("old runner"), 0755); err != nil {
		t.Fatal(err)
	}
	argumentsFile := filepath.Join(directory, "arguments")
	fixture := updateFixture("test \"$UPDATE_TEST_VALUE\" = preserved || exit 1\nprintf '%s\\n' \"$@\" > \"$UPDATE_TEST_ARGS\"\n")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-runner-token") != "" {
			t.Error("runner token leaked to the download endpoint")
		}
		fmt.Fprint(w, fixture)
	}))
	defer server.Close()
	args := []string{executable, "--server", "ws://example/runner", "--token", "token with spaces"}
	env := append(os.Environ(), "UPDATE_TEST_VALUE=preserved", "UPDATE_TEST_ARGS="+argumentsFile)
	prepared, err := prepareRunnerUpdate(context.Background(), runnerUpdate{Version: testUpdateVersion, DownloadURL: server.URL}, executable, args, env)
	if err != nil {
		t.Fatal(err)
	}
	defer prepared.cleanup()
	got, err := os.ReadFile(argumentsFile)
	if err != nil {
		t.Fatal(err)
	}
	want := strings.Join(append(args[1:], "--check-connection"), "\n") + "\n"
	if string(got) != want {
		t.Fatalf("arguments = %q, want %q", got, want)
	}
	old, _ := os.ReadFile(executable)
	if string(old) != "old runner" {
		t.Fatal("preflight replaced the running executable")
	}
}

func TestPrepareRunnerUpdateFailuresLeaveOldBinaryAndNoTemporaryFiles(t *testing.T) {
	for _, name := range []string{"http-error", "truncated", "wrong-version", "invalid-binary", "failed-check", "cancelled-check"} {
		t.Run(name, func(t *testing.T) {
			directory := t.TempDir()
			executable := filepath.Join(directory, "runner")
			if err := os.WriteFile(executable, []byte("old runner"), 0755); err != nil {
				t.Fatal(err)
			}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch name {
				case "http-error":
					w.WriteHeader(http.StatusNotFound)
				case "truncated":
					w.Header().Set("Content-Length", "1000")
					fmt.Fprint(w, "short")
				case "wrong-version":
					fmt.Fprint(w, strings.ReplaceAll(updateFixture("exit 0\n"), testUpdateVersion, "1.0.0"))
				case "invalid-binary":
					fmt.Fprint(w, "this is not an executable")
				case "failed-check":
					fmt.Fprint(w, updateFixture("exit 1\n"))
				case "cancelled-check":
					fmt.Fprint(w, updateFixture("exec sleep 30\n"))
				}
			}))
			defer server.Close()
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			prepared, err := prepareRunnerUpdate(ctx, runnerUpdate{Version: testUpdateVersion, DownloadURL: server.URL}, executable, []string{executable}, os.Environ())
			if err == nil || prepared != nil {
				t.Fatalf("expected failed update, got %v, %v", prepared, err)
			}
			old, _ := os.ReadFile(executable)
			if string(old) != "old runner" {
				t.Fatal("failed preflight changed the executable")
			}
			files, _ := filepath.Glob(filepath.Join(directory, ".arondo-runner-*"))
			if len(files) != 0 {
				t.Fatalf("temporary files not cleaned up: %v", files)
			}
		})
	}
}

func TestApplyRunnerUpdateRestoresBinaryOnExecFailure(t *testing.T) {
	directory := t.TempDir()
	executable := filepath.Join(directory, "runner")
	newPath := filepath.Join(directory, "downloaded")
	for name, contents := range map[string]string{executable: "old runner", newPath: "new runner"} {
		if err := os.WriteFile(name, []byte(contents), 0755); err != nil {
			t.Fatal(err)
		}
	}
	prepared := &preparedUpdate{version: testUpdateVersion, executable: executable, path: newPath}
	args := []string{executable, "--token", "token with spaces"}
	env := []string{"CHECK=preserved"}
	execError := errors.New("exec failed")
	err := prepared.apply(args, env, func(gotPath string, gotArgs, gotEnv []string) error {
		if gotPath != executable || !reflect.DeepEqual(args, gotArgs) || !reflect.DeepEqual(env, gotEnv) {
			t.Fatal("exec did not preserve path, arguments, and environment")
		}
		current, _ := os.ReadFile(executable)
		backup, _ := os.ReadFile(executable + ".previous")
		if string(current) != "new runner" || string(backup) != "old runner" {
			t.Fatal("binary was not replaced with its old version backed up before exec")
		}
		return execError
	})
	if !errors.Is(err, execError) {
		t.Fatalf("expected exec error, got %v", err)
	}
	current, _ := os.ReadFile(executable)
	if string(current) != "old runner" {
		t.Fatal("old binary was not restored")
	}
}

func TestApplyRunnerUpdateSerializesSharedExecutable(t *testing.T) {
	directory := t.TempDir()
	executable := filepath.Join(directory, "runner")
	newPath := filepath.Join(directory, "downloaded")
	for name, contents := range map[string]string{executable: "old", newPath: "new"} {
		if err := os.WriteFile(name, []byte(contents), 0755); err != nil {
			t.Fatal(err)
		}
	}
	lock, err := os.OpenFile(executable+".update.lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil {
		t.Fatal(err)
	}
	prepared := &preparedUpdate{version: testUpdateVersion, executable: executable, path: newPath}
	executed := false
	execProcess := func(string, []string, []string) error { executed = true; return nil }
	if err := prepared.apply([]string{executable}, nil, execProcess); !errors.Is(err, errUpdateBusy) {
		t.Fatalf("expected busy update lock, got %v", err)
	}
	old, _ := os.ReadFile(executable)
	if executed || string(old) != "old" {
		t.Fatal("busy update modified or executed the binary")
	}
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_UN); err != nil {
		t.Fatal(err)
	}
	if err := prepared.apply([]string{executable}, nil, execProcess); err != nil {
		t.Fatal(err)
	}
	backup, _ := os.ReadFile(executable + ".previous")
	if !executed || string(backup) != "old" {
		t.Fatal("update did not proceed with a backup after releasing the lock")
	}
}

func waitForTaskActivity(t *testing.T, activity *taskActivity) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		activity.mu.Lock()
		active := activity.active
		activity.mu.Unlock()
		if active == 0 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("task activity did not finish")
}

func TestUpdateGateWaitsForExitCallbackAndRejectsAllLaunchPaths(t *testing.T) {
	for _, piped := range []bool{false, true} {
		t.Run(fmt.Sprintf("piped=%v", piped), func(t *testing.T) {
			tm := NewTaskManager()
			callback := make(chan struct{})
			release := make(chan struct{})
			onExit := func(int) { close(callback); <-release }
			var err error
			if piped {
				_, err = tm.SpawnPiped(SpawnPipedOptions{TaskID: "task", Command: "bash", Args: []string{"-c", "exit 0"}, OnExit: onExit})
			} else {
				_, err = tm.Spawn(SpawnOptions{TaskID: "task", Command: "bash", Args: []string{"-c", "exit 0"}, OnExit: onExit})
			}
			if err != nil {
				t.Fatal(err)
			}
			<-callback
			if tm.activity.tryBeginUpdate() {
				t.Fatal("update began before the exit callback finished")
			}
			close(release)
			waitForTaskActivity(t, &tm.activity)
			if !tm.activity.tryBeginUpdate() {
				t.Fatal("update did not begin after task completion")
			}
			if _, err := tm.Spawn(SpawnOptions{TaskID: "new"}); err == nil {
				t.Fatal("PTY spawn was accepted during update")
			}
			if _, err := tm.SpawnPiped(SpawnPipedOptions{TaskID: "new"}); err == nil {
				t.Fatal("piped spawn was accepted during update")
			}
			if _, err := tm.Restart("task", "echo restarted", "", 80, 24); err == nil {
				t.Fatal("restart was accepted during update")
			}
			tm.activity.finishUpdate()
			if _, err := tm.Spawn(SpawnOptions{TaskID: "after", Command: "bash", Args: []string{"-c", "exit 0"}}); err != nil {
				t.Fatal(err)
			}
			waitForTaskActivity(t, &tm.activity)
		})
	}
}

func TestUpdateGateWaitsThroughRestartGap(t *testing.T) {
	tm := NewTaskManager()
	gap := make(chan struct{})
	release := make(chan struct{})
	_, err := tm.Spawn(SpawnOptions{
		TaskID: "restart", Command: "bash", Args: []string{"-c", "exit 0"},
		OnData: func(data []byte) {
			if strings.Contains(string(data), "restarting") {
				close(gap)
				<-release
			}
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	waitForTaskActivity(t, &tm.activity)
	restarted := make(chan error, 1)
	go func() { _, err := tm.Restart("restart", "read line", "", 80, 24); restarted <- err }()
	<-gap
	if tm.activity.tryBeginUpdate() {
		t.Fatal("update began in the gap between restarted processes")
	}
	close(release)
	if err := <-restarted; err != nil {
		t.Fatal(err)
	}
	if tm.activity.tryBeginUpdate() {
		t.Fatal("update began while restarted script was running")
	}
	if err := tm.Kill("restart", syscall.SIGKILL); err != nil {
		t.Fatal(err)
	}
	waitForTaskActivity(t, &tm.activity)
}

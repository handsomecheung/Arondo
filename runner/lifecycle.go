package main

import (
	"errors"
	"log"
	"os"
	"syscall"
	"time"
)

func runRunner(client *Client, sigCh <-chan os.Signal) {
	updater := client.handler.updater
	defer updater.close()
	var pending *preparedUpdate
	defer func() {
		if pending != nil {
			pending.cleanup()
		}
	}()
	runDone := make(chan struct{})
	go func() {
		client.Run()
		close(runDone)
	}()
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case sig := <-sigCh:
			log.Printf("received signal %v, shutting down", sig)
			client.Stop()
			return
		case <-runDone:
			log.Println("runner stopped")
			return
		case pending = <-updater.ready:
		case <-ticker.C:
			if pending == nil || updater.ctx.Err() != nil || !client.handler.taskManager.activity.tryBeginUpdate() {
				continue
			}
			// Keep the current connection alive if exec fails. Go sockets close on exec.
			err := pending.apply(os.Args, os.Environ(), syscall.Exec)
			client.handler.taskManager.activity.finishUpdate()
			if errors.Is(err, errUpdateBusy) {
				continue
			}
			pending.cleanup()
			pending = nil
			updater.finish()
			if err != nil {
				log.Printf("[updater] could not apply update; current runner continues: %v", err)
			}
		}
	}
}

package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	serverURL := flag.String("server", "ws://localhost:3251/runner", "Server WebSocket URL")
	token := flag.String("token", "", "Runner access token (optional, can also set ARONDO_RUNNER_TOKEN)")
	flag.Parse()

	runnerToken := *token
	if runnerToken == "" {
		runnerToken = os.Getenv("ARONDO_RUNNER_TOKEN")
	}

	log.SetFlags(log.Ltime | log.Lmsgprefix)
	log.SetPrefix("[runner] ")

	log.Printf("starting runner, connecting to %s", *serverURL)

	client := NewClient(*serverURL, runnerToken)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go client.Run()

	sig := <-sigCh
	log.Printf("received signal %v, shutting down", sig)
	client.Stop()
}

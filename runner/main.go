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
	name := flag.String("name", "", "Runner name (defaults to hostname)")
	token := flag.String("token", "", "Runner access token (optional, can also set ARONDO_RUNNER_TOKEN)")
	flag.Parse()

	if *name == "" {
		hostname, err := os.Hostname()
		if err != nil {
			hostname = "unknown"
		}
		*name = hostname
	}

	runnerToken := *token
	if runnerToken == "" {
		runnerToken = os.Getenv("ARONDO_RUNNER_TOKEN")
	}

	log.SetFlags(log.Ltime | log.Lmsgprefix)
	log.SetPrefix("[runner] ")

	log.Printf("starting runner %q, connecting to %s", *name, *serverURL)

	client := NewClient(*serverURL, *name, runnerToken)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go client.Run()

	sig := <-sigCh
	log.Printf("received signal %v, shutting down", sig)
	client.Stop()
}

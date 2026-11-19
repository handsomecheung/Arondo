package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	serverURL := flag.String("server", "ws://localhost:3251/runner", "Server WebSocket URL")
	token := flag.String("token", "", "Runner access token (optional, can also set ARONDO_RUNNER_TOKEN)")
	check := flag.Bool("check-connection", false, "Check server authentication and WebSocket Ping/Pong without registering, then exit")
	version := flag.Bool("version", false, "Print the runner version and exit")
	autoUpdate := flag.Bool("auto-update", false, "Automatically download and apply runner updates (default: log update notices only)")
	flag.Parse()
	if *version {
		fmt.Println(Version)
		return
	}

	runnerToken := *token
	if runnerToken == "" {
		runnerToken = os.Getenv("ARONDO_RUNNER_TOKEN")
	}

	log.SetFlags(log.Ltime | log.Lmsgprefix)
	log.SetPrefix("[runner] ")

	if *check {
		log.Printf("checking connection to %s", *serverURL)
		if err := checkConnection(context.Background(), *serverURL, runnerToken); err != nil {
			log.Printf("connection check failed: %v", err)
			os.Exit(1)
		}
		log.Println("connection check succeeded")
		return
	}

	log.Printf("starting runner, connecting to %s", *serverURL)

	client := NewClient(*serverURL, runnerToken)
	client.handler.autoUpdate = *autoUpdate

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	defer signal.Stop(sigCh)
	runRunner(client, sigCh)
}

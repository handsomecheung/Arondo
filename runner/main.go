package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	serverURL := flag.String("server", "ws://localhost:3251/runner", "Server WebSocket URL")
	token := flag.String("token", "", "Runner access token (optional, can also set ARONDO_RUNNER_TOKEN)")
	check := flag.Bool("check-connection", false, "Check server authentication and WebSocket Ping/Pong without registering, then exit")
	flag.Parse()

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

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	runDone := make(chan struct{})
	go func() {
		client.Run()
		close(runDone)
	}()

	select {
	case sig := <-sigCh:
		log.Printf("received signal %v, shutting down", sig)
		client.Stop()
	case <-runDone:
		log.Println("runner stopped")
	}
}

package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	serverURL := flag.String("server", "ws://localhost:3251/controller", "Server WebSocket URL")
	name := flag.String("name", "", "Controller name (defaults to hostname)")
	flag.Parse()

	if *name == "" {
		hostname, err := os.Hostname()
		if err != nil {
			hostname = "unknown"
		}
		*name = hostname
	}

	log.SetFlags(log.Ltime | log.Lmsgprefix)
	log.SetPrefix("[controller] ")

	log.Printf("starting controller %q, connecting to %s", *name, *serverURL)

	client := NewClient(*serverURL, *name)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go client.Run()

	sig := <-sigCh
	log.Printf("received signal %v, shutting down", sig)
	client.Stop()
}

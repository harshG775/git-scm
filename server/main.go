package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/git-csm/server/internal/api"
	"github.com/git-csm/server/internal/config"
	"github.com/git-csm/server/internal/guard"
	"github.com/git-csm/server/internal/ui"
	"github.com/git-csm/server/internal/watch"
)

const installURL = "https://raw.githubusercontent.com/harshG775/git-scm/main/install.sh"

// update re-runs the install script, which replaces this binary with the latest release.
func update() {
	cmd := exec.Command("sh", "-c", "curl -fsSL "+installURL+" | sh")
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		log.Fatalf("update failed: %v", err)
	}
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "update" {
		update()
		return
	}
	addr := flag.String("addr", "127.0.0.1:8080", "listen address")
	cert := flag.String("cert", "", "TLS certificate file (enables HTTPS)")
	key := flag.String("key", "", "TLS key file")
	allowHosts := flag.String("allow-hosts", "", "extra host names to accept, comma-separated (e.g. phone.local); localhost and IP addresses are always accepted")
	flag.Parse()

	dir, err := config.DefaultDir()
	if err != nil {
		log.Fatal(err)
	}
	store, err := config.Open(dir)
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	hub := watch.New(2 * time.Second)
	api.Register(mux, store, hub)
	mux.Handle("/", ui.Handler())

	srv := &http.Server{
		Addr:              *addr,
		Handler:           guard.Wrap(mux, strings.Split(*allowHosts, ",")),
		ReadHeaderTimeout: 10 * time.Second,
	}
	// Open event streams would otherwise hold shutdown until the timeout.
	srv.RegisterOnShutdown(hub.Close)

	go func() {
		var err error
		if *cert != "" && *key != "" {
			log.Printf("https://%s (config: %s)", *addr, dir)
			err = srv.ListenAndServeTLS(*cert, *key)
		} else {
			log.Printf("http://%s (config: %s)", *addr, dir)
			err = srv.ListenAndServe()
		}
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

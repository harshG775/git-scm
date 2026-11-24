package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/git-csm/server/internal/ui"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "listen address")
	root := flag.String("root", ".", "directory to serve (workspace root)")
	cert := flag.String("cert", "", "TLS certificate file (enables HTTPS)")
	key := flag.String("key", "", "TLS key file")
	flag.Parse()

	absRoot, err := filepath.Abs(*root)
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "root": absRoot})
	})
	mux.Handle("/api/", http.NotFoundHandler())
	mux.Handle("/", ui.Handler())

	srv := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		var err error
		if *cert != "" && *key != "" {
			log.Printf("https://%s (root: %s)", *addr, absRoot)
			err = srv.ListenAndServeTLS(*cert, *key)
		} else {
			log.Printf("http://%s (root: %s)", *addr, absRoot)
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

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

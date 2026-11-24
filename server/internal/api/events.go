package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/git-csm/server/internal/pathguard"
)

const (
	maxClientID    = 64
	maxWatchPaths  = 500
	heartbeatEvery = 15 * time.Second
)

// events streams "ready", "git", "file {path}" and "dir {path}" as server-sent events.
// The client picks its own id and passes it to /watch to say what it wants to hear about.
func (a *API) events(w http.ResponseWriter, r *http.Request) {
	proj, ok := a.store.Get(r.PathValue("id"))
	if !ok {
		fail(w, http.StatusNotFound, "unknown project")
		return
	}
	clientID := r.URL.Query().Get("client")
	if clientID == "" || len(clientID) > maxClientID {
		fail(w, http.StatusBadRequest, "client id required (max 64 chars)")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		fail(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	c, unsubscribe := a.hub.Subscribe(proj.ID, proj.Path, clientID)
	defer unsubscribe()

	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	write := func(name string, data any) error {
		b, _ := json.Marshal(data)
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, b); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}
	if write("ready", struct{}{}) != nil {
		return
	}

	beat := time.NewTicker(heartbeatEvery)
	defer beat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-c.Done():
			return
		case ev := <-c.Events():
			if write(ev.Name, ev.Data) != nil {
				return
			}
		case <-beat.C:
			// Comment line: keeps proxies and the phone's radio from closing an idle stream.
			if _, err := io.WriteString(w, ": ping\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

// setWatch replaces the set of directories and files a client wants change events for.
func (a *API) setWatch(w http.ResponseWriter, r *http.Request) {
	proj, ok := a.store.Get(r.PathValue("id"))
	if !ok {
		fail(w, http.StatusNotFound, "unknown project")
		return
	}
	var body struct {
		Dirs  []string `json:"dirs"`
		Files []string `json:"files"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		fail(w, http.StatusBadRequest, "body must be {\"dirs\": [...], \"files\": [...]}")
		return
	}
	if len(body.Dirs) > maxWatchPaths || len(body.Files) > maxWatchPaths {
		fail(w, http.StatusRequestEntityTooLarge, "too many paths")
		return
	}

	clean := func(paths []string) ([]string, error) {
		out := make([]string, 0, len(paths))
		for _, p := range paths {
			abs, err := pathguard.Resolve(proj.Path, p)
			if err != nil {
				return nil, err
			}
			out = append(out, pathguard.Rel(proj.Path, abs))
		}
		return out, nil
	}
	dirs, err1 := clean(body.Dirs)
	files, err2 := clean(body.Files)
	if err := errors.Join(err1, err2); err != nil {
		if errors.Is(err, pathguard.ErrOutside) {
			fail(w, http.StatusForbidden, pathguard.ErrOutside.Error())
		} else {
			failFS(w, err)
		}
		return
	}

	if !a.hub.SetWatch(proj.ID, r.URL.Query().Get("client"), dirs, files) {
		fail(w, http.StatusNotFound, "no event stream for this client; connect to /events first")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

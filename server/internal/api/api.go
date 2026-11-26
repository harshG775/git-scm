// Package api implements the REST endpoints described in the root PLAN.md.
package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/git-csm/server/internal/config"
	"github.com/git-csm/server/internal/pathguard"
	"github.com/git-csm/server/internal/watch"
)

const maxFileSize = 5 << 20 // 5 MiB

type API struct {
	store    *config.Store
	hub      *watch.Hub
	gitLocks gitLocks
	wmu      sync.Mutex // serializes file saves so check-and-replace is atomic between requests
}

// Register mounts all /api routes on mux.
func Register(mux *http.ServeMux, store *config.Store, hub *watch.Hub) {
	a := &API{store: store, hub: hub}
	mux.HandleFunc("GET /api/health", a.health)
	mux.HandleFunc("GET /api/projects", a.listProjects)
	mux.HandleFunc("POST /api/projects", a.openProject)
	mux.HandleFunc("GET /api/directories", a.browseDirectories)
	mux.HandleFunc("DELETE /api/projects/{id}", a.removeProject)
	mux.HandleFunc("GET /api/p/{id}/tree", a.tree)
	mux.HandleFunc("GET /api/p/{id}/file", a.readFile)
	mux.HandleFunc("PUT /api/p/{id}/file", a.writeFile)
	a.registerGit(mux)
	mux.HandleFunc("PUT /api/p/{id}/watch", a.setWatch)
	mux.HandleFunc("GET /api/p/{id}/events", a.events)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, _ *http.Request) {
		fail(w, http.StatusNotFound, "not found")
	})
}

func (a *API) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *API) listProjects(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, a.store.Projects())
}

type browseDirectory struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type directoryListing struct {
	Path        string            `json:"path"`
	Parent      string            `json:"parent,omitempty"`
	Directories []browseDirectory `json:"directories"`
}

type browseRoot struct {
	name string
	path string
	real string
}

func (a *API) browseDirectories(w http.ResponseWriter, r *http.Request) {
	roots, err := browseRoots()
	if err != nil {
		fail(w, http.StatusInternalServerError, err.Error())
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		dirs := make([]browseDirectory, 0, len(roots))
		for _, root := range roots {
			dirs = append(dirs, browseDirectory{Name: root.name, Path: root.path})
		}
		writeJSON(w, http.StatusOK, directoryListing{Directories: dirs})
		return
	}

	abs, err := filepath.Abs(expandHome(path))
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		failFS(w, err)
		return
	}
	info, err := os.Stat(real)
	if err != nil {
		failFS(w, err)
		return
	}
	if !info.IsDir() {
		fail(w, http.StatusBadRequest, "path is not a directory")
		return
	}
	root, ok := containingBrowseRoot(real, roots)
	if !ok {
		fail(w, http.StatusForbidden, "directory is outside the browse roots")
		return
	}

	des, err := os.ReadDir(abs)
	if err != nil {
		failFS(w, err)
		return
	}
	dirs := make([]browseDirectory, 0, len(des))
	for _, de := range des {
		if de.Name() == ".git" {
			continue
		}
		child := filepath.Join(abs, de.Name())
		childReal, err := filepath.EvalSymlinks(child)
		if err != nil {
			continue
		}
		info, err := os.Stat(childReal)
		if err != nil || !info.IsDir() {
			continue
		}
		if _, ok := containingBrowseRoot(childReal, roots); !ok {
			continue
		}
		dirs = append(dirs, browseDirectory{Name: de.Name(), Path: child})
	}
	sort.Slice(dirs, func(i, j int) bool {
		return strings.ToLower(dirs[i].Name) < strings.ToLower(dirs[j].Name)
	})

	parent := ""
	if real != root.real {
		candidate := filepath.Dir(abs)
		if parentReal, err := filepath.EvalSymlinks(candidate); err == nil {
			if _, ok := containingBrowseRoot(parentReal, roots); ok {
				parent = candidate
			}
		}
	}
	writeJSON(w, http.StatusOK, directoryListing{Path: abs, Parent: parent, Directories: dirs})
}

func browseRoots() ([]browseRoot, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	home, err = filepath.Abs(home)
	if err != nil {
		return nil, err
	}
	homeReal, err := filepath.EvalSymlinks(home)
	if err != nil {
		return nil, err
	}
	roots := []browseRoot{{name: "Home", path: home, real: homeReal}}

	shared := filepath.Join(home, "storage", "shared")
	if info, err := os.Stat(shared); err == nil && info.IsDir() {
		if sharedReal, err := filepath.EvalSymlinks(shared); err == nil && sharedReal != homeReal {
			roots = append(roots, browseRoot{name: "Shared storage", path: shared, real: sharedReal})
		}
	}
	return roots, nil
}

func containingBrowseRoot(path string, roots []browseRoot) (browseRoot, bool) {
	var match browseRoot
	for _, root := range roots {
		rel, err := filepath.Rel(root.real, path)
		if err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) &&
			len(root.real) > len(match.real) {
			match = root
		}
	}
	return match, match.real != ""
}

func (a *API) openProject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body); err != nil || body.Path == "" {
		fail(w, http.StatusBadRequest, "body must be {\"path\": \"...\"}")
		return
	}
	path := expandHome(body.Path)
	p, err := a.store.Add(path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		fail(w, http.StatusNotFound, "directory does not exist")
	case err != nil:
		fail(w, http.StatusBadRequest, err.Error())
	default:
		writeJSON(w, http.StatusOK, p)
	}
}

func (a *API) removeProject(w http.ResponseWriter, r *http.Request) {
	ok, err := a.store.Remove(r.PathValue("id"))
	switch {
	case err != nil:
		fail(w, http.StatusInternalServerError, err.Error())
	case !ok:
		fail(w, http.StatusNotFound, "unknown project")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

type entry struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Type string `json:"type"` // "dir" | "file"
	Size int64  `json:"size"`
}

func (a *API) tree(w http.ResponseWriter, r *http.Request) {
	proj, abs, ok := a.target(w, r)
	if !ok {
		return
	}
	des, err := os.ReadDir(abs)
	if err != nil {
		failFS(w, err)
		return
	}

	entries := make([]entry, 0, len(des))
	for _, de := range des {
		if de.Name() == ".git" {
			continue
		}
		child := filepath.Join(abs, de.Name())
		fi, err := os.Stat(child) // follows symlinks; broken links are listed as files
		e := entry{Name: de.Name(), Path: pathguard.Rel(proj.Path, child), Type: "file"}
		if err == nil {
			e.Size = fi.Size()
			if fi.IsDir() {
				e.Type = "dir"
			}
		}
		entries = append(entries, e)
	}
	sort.Slice(entries, func(i, j int) bool {
		if (entries[i].Type == "dir") != (entries[j].Type == "dir") {
			return entries[i].Type == "dir"
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	writeJSON(w, http.StatusOK, map[string]any{"path": pathguard.Rel(proj.Path, abs), "entries": entries})
}

func (a *API) readFile(w http.ResponseWriter, r *http.Request) {
	_, abs, ok := a.target(w, r)
	if !ok {
		return
	}
	fi, err := os.Stat(abs)
	if err != nil {
		failFS(w, err)
		return
	}
	if fi.IsDir() {
		fail(w, http.StatusBadRequest, "path is a directory")
		return
	}
	if fi.Size() > maxFileSize {
		fail(w, http.StatusRequestEntityTooLarge, "file too large")
		return
	}
	b, err := os.ReadFile(abs)
	if err != nil {
		failFS(w, err)
		return
	}
	if bytes.IndexByte(b[:min(len(b), 8000)], 0) >= 0 {
		fail(w, http.StatusUnsupportedMediaType, "binary file")
		return
	}
	w.Header().Set("ETag", etag(b))
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(b)
}

func (a *API) writeFile(w http.ResponseWriter, r *http.Request) {
	_, abs, ok := a.target(w, r)
	if !ok {
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxFileSize))
	if err != nil {
		fail(w, http.StatusRequestEntityTooLarge, "file too large")
		return
	}

	a.wmu.Lock()
	defer a.wmu.Unlock()

	tag, mode, err := snapshot(abs)
	exists := err == nil
	switch {
	case exists:
		want := r.Header.Get("If-Match")
		if want == "" {
			fail(w, http.StatusPreconditionRequired, "If-Match header required")
			return
		}
		if want != tag {
			w.Header().Set("ETag", tag)
			fail(w, http.StatusPreconditionFailed, "file changed on disk")
			return
		}
	case errors.Is(err, os.ErrNotExist):
		mode = 0o644
	case errors.Is(err, errIsDir):
		fail(w, http.StatusBadRequest, "path is a directory")
		return
	case errors.Is(err, errTooLarge):
		fail(w, http.StatusRequestEntityTooLarge, "file too large")
		return
	default:
		failFS(w, err)
		return
	}

	// Write to a temp file and rename so readers never see a partial file.
	tmp, err := os.CreateTemp(filepath.Dir(abs), ".git-csm-*")
	if err != nil {
		failFS(w, err)
		return
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(body); err != nil {
		tmp.Close()
		failFS(w, err)
		return
	}
	if err := tmp.Close(); err != nil {
		failFS(w, err)
		return
	}
	if err := os.Chmod(tmp.Name(), mode); err != nil {
		failFS(w, err)
		return
	}

	// Re-check right before replacing, so an external edit made while we were writing the
	// temp file is still caught. Only a change in the microseconds before rename can slip by.
	if exists {
		if cur, _, err := snapshot(abs); err != nil || cur != tag {
			w.Header().Set("ETag", cur)
			fail(w, http.StatusPreconditionFailed, "file changed on disk")
			return
		}
	} else if _, err := os.Lstat(abs); err == nil {
		fail(w, http.StatusPreconditionFailed, "file was created on disk")
		return
	}
	if err := os.Rename(tmp.Name(), abs); err != nil {
		failFS(w, err)
		return
	}
	w.Header().Set("ETag", etag(body))
	w.WriteHeader(http.StatusNoContent)
}

var (
	errIsDir    = errors.New("is a directory")
	errTooLarge = errors.New("file too large")
)

// snapshot returns the ETag and permissions of the file at abs.
func snapshot(abs string) (string, os.FileMode, error) {
	fi, err := os.Stat(abs)
	if err != nil {
		return "", 0, err
	}
	if fi.IsDir() {
		return "", 0, errIsDir
	}
	if fi.Size() > maxFileSize {
		return "", 0, errTooLarge
	}
	b, err := os.ReadFile(abs)
	if err != nil {
		return "", 0, err
	}
	return etag(b), fi.Mode().Perm(), nil
}

// target looks up the project and resolves ?path= inside it, writing the error response itself.
func (a *API) target(w http.ResponseWriter, r *http.Request) (config.Project, string, bool) {
	proj, ok := a.store.Get(r.PathValue("id"))
	if !ok {
		fail(w, http.StatusNotFound, "unknown project")
		return proj, "", false
	}
	abs, err := pathguard.Resolve(proj.Path, r.URL.Query().Get("path"))
	switch {
	case errors.Is(err, pathguard.ErrOutside):
		fail(w, http.StatusForbidden, err.Error())
	case err != nil:
		failFS(w, err)
	default:
		return proj, abs, true
	}
	return proj, "", false
}

// etag is a hash of the content, so it changes on any edit regardless of timestamp resolution.
func etag(b []byte) string {
	sum := sha256.Sum256(b)
	return `"` + hex.EncodeToString(sum[:12]) + `"`
}

func expandHome(p string) string {
	if p == "~" || strings.HasPrefix(p, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, p[1:])
		}
	}
	return p
}

func failFS(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, os.ErrNotExist):
		fail(w, http.StatusNotFound, "not found")
	case errors.Is(err, os.ErrPermission):
		fail(w, http.StatusForbidden, "permission denied")
	default:
		fail(w, http.StatusInternalServerError, err.Error())
	}
}

func fail(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

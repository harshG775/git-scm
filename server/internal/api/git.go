package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/git-csm/server/internal/config"
	"github.com/git-csm/server/internal/git"
	"github.com/git-csm/server/internal/pathguard"
)

const (
	maxGitPaths   = 2000
	gitTimeout    = 30 * time.Second
	gitNetTimeout = 2 * time.Minute
)

func (a *API) registerGit(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/p/{id}/git/status", a.gitStatus)
	mux.HandleFunc("GET /api/p/{id}/git/diff", a.gitDiff)
	mux.HandleFunc("POST /api/p/{id}/git/stage", a.gitPaths((git.Repo).Stage))
	mux.HandleFunc("POST /api/p/{id}/git/unstage", a.gitPaths((git.Repo).Unstage))
	mux.HandleFunc("POST /api/p/{id}/git/discard", a.gitPaths((git.Repo).Discard))
	mux.HandleFunc("GET /api/p/{id}/git/branches", a.gitBranches)
	mux.HandleFunc("POST /api/p/{id}/git/branches", a.gitNamed((git.Repo).CreateBranch))
	mux.HandleFunc("POST /api/p/{id}/git/checkout", a.gitNamed((git.Repo).SwitchBranch))
	mux.HandleFunc("POST /api/p/{id}/git/commit", a.gitCommit)
	mux.HandleFunc("POST /api/p/{id}/git/pull", a.gitNet((git.Repo).Pull))
	mux.HandleFunc("POST /api/p/{id}/git/push", a.gitNet((git.Repo).Push))
}

// lock serializes mutating git commands per project, so two quick taps cannot collide on
// git's index.lock. Reads (status, diff) do not take it.
func (a *API) lock(projectID string) func() {
	m, _ := a.gitLocks.LoadOrStore(projectID, &sync.Mutex{})
	mu := m.(*sync.Mutex)
	mu.Lock()
	return mu.Unlock
}

type gitLocks = sync.Map

func (a *API) repo(w http.ResponseWriter, r *http.Request) (config.Project, git.Repo, bool) {
	proj, ok := a.store.Get(r.PathValue("id"))
	if !ok {
		fail(w, http.StatusNotFound, "unknown project")
		return proj, git.Repo{}, false
	}
	return proj, git.Repo{Root: proj.Path}, true
}

func (a *API) gitStatus(w http.ResponseWriter, r *http.Request) {
	_, repo, ok := a.repo(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), gitTimeout)
	defer cancel()
	st, err := repo.Status(ctx)
	if err != nil {
		failGit(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, st)
}

func (a *API) gitDiff(w http.ResponseWriter, r *http.Request) {
	proj, repo, ok := a.repo(w, r)
	if !ok {
		return
	}
	abs, err := pathguard.Resolve(proj.Path, r.URL.Query().Get("path"))
	if err != nil {
		failPath(w, err)
		return
	}
	rel := pathguard.Rel(proj.Path, abs)
	if rel == "" {
		fail(w, http.StatusBadRequest, "path required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), gitTimeout)
	defer cancel()
	diff, truncated, err := repo.Diff(ctx, rel, r.URL.Query().Get("staged") == "1")
	if err != nil {
		failGit(w, err)
		return
	}
	if truncated {
		diff += "\n… diff truncated at 1 MiB\n"
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	io.WriteString(w, diff)
}

func (a *API) gitBranches(w http.ResponseWriter, r *http.Request) {
	_, repo, ok := a.repo(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), gitTimeout)
	defer cancel()
	list, err := repo.Branches(ctx)
	if err != nil {
		failGit(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, list)
}

// gitNamed builds a handler for operations that take one branch name.
func (a *API) gitNamed(op func(git.Repo, context.Context, string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		proj, repo, ok := a.repo(w, r)
		if !ok {
			return
		}
		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
			fail(w, http.StatusBadRequest, "body must be {\"name\": \"...\"}")
			return
		}
		defer a.lock(proj.ID)()
		ctx, cancel := context.WithTimeout(r.Context(), gitTimeout)
		defer cancel()
		if err := op(repo, ctx, strings.TrimSpace(body.Name)); err != nil {
			failGit(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

// gitPaths builds a handler for operations on a list of project-relative paths.
func (a *API) gitPaths(op func(git.Repo, context.Context, []string) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		proj, repo, ok := a.repo(w, r)
		if !ok {
			return
		}
		var body struct {
			Paths []string `json:"paths"`
		}
		if err := json.NewDecoder(io.LimitReader(r.Body, 4<<20)).Decode(&body); err != nil || len(body.Paths) == 0 {
			fail(w, http.StatusBadRequest, "body must be {\"paths\": [...]} with at least one path")
			return
		}
		if len(body.Paths) > maxGitPaths {
			fail(w, http.StatusRequestEntityTooLarge, "too many paths")
			return
		}
		rels := make([]string, len(body.Paths))
		for i, p := range body.Paths {
			abs, err := pathguard.Resolve(proj.Path, p)
			if err != nil {
				failPath(w, err)
				return
			}
			if rels[i] = pathguard.Rel(proj.Path, abs); rels[i] == "" {
				rels[i] = "."
			}
		}

		defer a.lock(proj.ID)()
		ctx, cancel := context.WithTimeout(r.Context(), gitTimeout)
		defer cancel()
		if err := op(repo, ctx, rels); err != nil {
			failGit(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func (a *API) gitCommit(w http.ResponseWriter, r *http.Request) {
	proj, repo, ok := a.repo(w, r)
	if !ok {
		return
	}
	var body struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil || strings.TrimSpace(body.Message) == "" {
		fail(w, http.StatusBadRequest, "commit message required")
		return
	}
	defer a.lock(proj.ID)()
	ctx, cancel := context.WithTimeout(r.Context(), gitTimeout)
	defer cancel()
	oid, err := repo.Commit(ctx, body.Message)
	if err != nil {
		failGit(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"oid": oid})
}

// gitNet builds a handler for pull/push, which can take a while and report progress text.
func (a *API) gitNet(op func(git.Repo, context.Context) (string, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		proj, repo, ok := a.repo(w, r)
		if !ok {
			return
		}
		defer a.lock(proj.ID)()
		ctx, cancel := context.WithTimeout(r.Context(), gitNetTimeout)
		defer cancel()
		out, err := op(repo, ctx)
		if err != nil {
			failGit(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"output": out})
	}
}

func failPath(w http.ResponseWriter, err error) {
	if errors.Is(err, pathguard.ErrOutside) {
		fail(w, http.StatusForbidden, err.Error())
		return
	}
	failFS(w, err)
}

// failGit reports git's own message: it is what the user needs ("nothing to commit", "Not
// possible to fast-forward", authentication errors, ...). 422 marks "git said no".
func failGit(w http.ResponseWriter, err error) {
	var ge *git.Error
	if errors.As(err, &ge) {
		fail(w, http.StatusUnprocessableEntity, ge.Msg)
		return
	}
	fail(w, http.StatusInternalServerError, err.Error())
}

package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"

	"github.com/harshG775/git-scm/server/internal/git"
)

func (a *API) registerConfig(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/git/config", a.globalConfig)
	mux.HandleFunc("PUT /api/git/config", a.setGlobalConfig)
	mux.HandleFunc("GET /api/p/{id}/git/config", a.repoConfig)
	mux.HandleFunc("PUT /api/p/{id}/git/config", a.setRepoConfig)
}

// globalConfig returns the allowed keys that are set in the user's global git config.
func (a *API) globalConfig(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), gitTimeout)
	defer cancel()
	values, err := git.GlobalRepo().Config(ctx, git.ConfigGlobal)
	if err != nil {
		failGit(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"path": git.GlobalConfigPath(), "values": values})
}

// setGlobalConfig sets one allowed key in the global config; an empty value removes it.
func (a *API) setGlobalConfig(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body); err != nil || body.Key == "" {
		fail(w, http.StatusBadRequest, "body must be {\"key\": \"user.name\", \"value\": \"...\"}")
		return
	}
	// one writer at a time: git takes a lock file next to the config and a second write would fail on it
	defer a.lock("config:global")()
	ctx, cancel := context.WithTimeout(r.Context(), gitTimeout)
	defer cancel()
	if err := git.GlobalRepo().SetConfig(ctx, git.ConfigGlobal, body.Key, body.Value); err != nil {
		failGit(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// repoConfig returns the allowed keys set for this repository, i.e. what overrides the global config.
func (a *API) repoConfig(w http.ResponseWriter, r *http.Request) {
	_, repo, ok := a.repo(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), gitTimeout)
	defer cancel()
	values, err := repo.Config(ctx, git.ConfigLocal)
	if err != nil {
		failGit(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{"path": repo.LocalConfigPath(ctx), "values": values})
}

// setRepoConfig sets one allowed key in this repository's config; an empty value removes it, so the
// global value applies again.
func (a *API) setRepoConfig(w http.ResponseWriter, r *http.Request) {
	proj, repo, ok := a.repo(w, r)
	if !ok {
		return
	}
	var body struct {
		Key   string `json:"key"`
		Value string `json:"value"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<16)).Decode(&body); err != nil || body.Key == "" {
		fail(w, http.StatusBadRequest, "body must be {\"key\": \"user.name\", \"value\": \"...\"}")
		return
	}
	defer a.lock(proj.ID)()
	ctx, cancel := context.WithTimeout(r.Context(), gitTimeout)
	defer cancel()
	if err := repo.SetConfig(ctx, git.ConfigLocal, body.Key, body.Value); err != nil {
		failGit(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

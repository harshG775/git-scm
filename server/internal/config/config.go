// Package config persists user settings and recent projects under ~/.git-scm.
package config

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

type Project struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Path       string    `json:"path"`
	LastOpened time.Time `json:"lastOpened"`
}

type file struct {
	Projects []Project `json:"projects"`
}

type Store struct {
	mu   sync.Mutex
	path string
	data file
}

// DefaultDir returns $GIT_SCM_HOME, or ~/.git-scm. It also honors the former environment
// variable and migrates the former default directory when the new one does not exist.
func DefaultDir() (string, error) {
	if d := os.Getenv("GIT_SCM_HOME"); d != "" {
		return d, nil
	}
	if d := os.Getenv("GIT_CSM_HOME"); d != "" {
		return d, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".git-scm")
	if _, err := os.Stat(dir); err == nil {
		return dir, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	legacyDir := filepath.Join(home, ".git-csm")
	if _, err := os.Stat(legacyDir); err == nil {
		if err := os.Rename(legacyDir, dir); err != nil {
			return "", fmt.Errorf("migrate config directory %s: %w", legacyDir, err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	return dir, nil
}

// Open loads dir/config.json, creating dir (and an empty config) on first run.
func Open(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	s := &Store{path: filepath.Join(dir, "config.json")}
	b, err := os.ReadFile(s.path)
	switch {
	case errors.Is(err, os.ErrNotExist):
		return s, s.save()
	case err != nil:
		return nil, err
	}
	if err := json.Unmarshal(b, &s.data); err != nil {
		return nil, fmt.Errorf("parse %s: %w", s.path, err)
	}
	return s, nil
}

// Projects returns recent projects, most recently opened first.
func (s *Store) Projects() []Project {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := append([]Project{}, s.data.Projects...)
	sort.Slice(out, func(i, j int) bool { return out[i].LastOpened.After(out[j].LastOpened) })
	return out
}

func (s *Store) Get(id string) (Project, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.data.Projects {
		if p.ID == id {
			return p, true
		}
	}
	return Project{}, false
}

// Add registers (or re-opens) the directory at path and bumps it to the top of the recents.
func (s *Store) Add(path string) (Project, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return Project{}, err
	}
	fi, err := os.Stat(abs)
	if err != nil {
		return Project{}, err
	}
	if !fi.IsDir() {
		return Project{}, fmt.Errorf("%s is not a directory", abs)
	}

	sum := sha1.Sum([]byte(abs))
	p := Project{
		ID:         hex.EncodeToString(sum[:])[:8],
		Name:       filepath.Base(abs),
		Path:       abs,
		LastOpened: time.Now().UTC(),
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	replaced := false
	for i := range s.data.Projects {
		if s.data.Projects[i].ID == p.ID {
			s.data.Projects[i] = p
			replaced = true
		}
	}
	if !replaced {
		s.data.Projects = append(s.data.Projects, p)
	}
	return p, s.save()
}

// Remove forgets a project (the directory itself is untouched). It reports whether it existed.
func (s *Store) Remove(id string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, p := range s.data.Projects {
		if p.ID == id {
			s.data.Projects = append(s.data.Projects[:i], s.data.Projects[i+1:]...)
			return true, s.save()
		}
	}
	return false, nil
}

// save writes atomically; callers hold mu (or are still constructing).
func (s *Store) save() error {
	b, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

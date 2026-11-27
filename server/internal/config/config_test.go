package config

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestPersistAndOrder(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "home") // does not exist yet: Open must create it
	a, b := t.TempDir(), t.TempDir()

	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	pa, _ := s.Add(a)
	pb, _ := s.Add(b)
	s.Add(a) // re-opening bumps a to the top and must not duplicate it

	s2, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	got := s2.Projects()
	if len(got) != 2 || got[0].ID != pa.ID || got[1].ID != pb.ID {
		t.Fatalf("projects = %+v", got)
	}
	if _, ok := s2.Get(pb.ID); !ok {
		t.Error("Get failed after reload")
	}
}

func TestDefaultDirMigratesLegacyDirectory(t *testing.T) {
	home := t.TempDir()
	legacyDir := filepath.Join(home, ".git-csm")
	if err := os.MkdirAll(legacyDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(legacyDir, "config.json"), []byte(`{"projects":[]}`), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)
	t.Setenv("GIT_SCM_HOME", "")
	t.Setenv("GIT_CSM_HOME", "")

	dir, err := DefaultDir()
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(home, ".git-scm"); dir != want {
		t.Fatalf("DefaultDir() = %q, want %q", dir, want)
	}
	if _, err := os.Stat(filepath.Join(dir, "config.json")); err != nil {
		t.Fatalf("migrated config missing: %v", err)
	}
	if _, err := os.Stat(legacyDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("legacy directory still exists: %v", err)
	}
}

func TestAddRejectsFile(t *testing.T) {
	s, _ := Open(t.TempDir())
	f := filepath.Join(t.TempDir(), "f")
	os.WriteFile(f, nil, 0o644)
	if _, err := s.Add(f); err == nil {
		t.Error("expected error for a file")
	}
}

func TestRemove(t *testing.T) {
	dir := t.TempDir()
	s, _ := Open(dir)
	p, _ := s.Add(t.TempDir())
	if ok, err := s.Remove(p.ID); !ok || err != nil {
		t.Fatalf("Remove = %v, %v", ok, err)
	}
	if ok, _ := s.Remove(p.ID); ok {
		t.Error("second Remove should report false")
	}
	s2, _ := Open(dir)
	if len(s2.Projects()) != 0 {
		t.Error("removal not persisted")
	}
}

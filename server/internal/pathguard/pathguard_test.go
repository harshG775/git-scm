package pathguard

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func setup(t *testing.T) (root, outside string) {
	t.Helper()
	base := t.TempDir()
	root = filepath.Join(base, "proj")
	outside = filepath.Join(base, "secret")
	for _, d := range []string{filepath.Join(root, "src"), outside} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	os.WriteFile(filepath.Join(root, "src", "a.txt"), []byte("a"), 0o644)
	os.WriteFile(filepath.Join(outside, "pw.txt"), []byte("x"), 0o644)
	os.Symlink(outside, filepath.Join(root, "escape"))
	os.Symlink(filepath.Join(root, "src"), filepath.Join(root, "inside"))
	os.Symlink(filepath.Join(outside, "pw.txt"), filepath.Join(root, "dangling-out"))
	return
}

func TestResolve(t *testing.T) {
	root, _ := setup(t)
	ok := []string{"", ".", "src", "src/a.txt", "inside/a.txt", "src/new.txt", "src/deep/new/file.txt", "src/../src/a.txt"}
	for _, rel := range ok {
		if _, err := Resolve(root, rel); err != nil {
			t.Errorf("Resolve(%q) unexpected error: %v", rel, err)
		}
	}

	bad := []string{"..", "../secret", "src/../../secret", "/etc/passwd", "escape", "escape/pw.txt", "escape/new.txt", "dangling-out"}
	for _, rel := range bad {
		if _, err := Resolve(root, rel); !errors.Is(err, ErrOutside) {
			t.Errorf("Resolve(%q) = %v, want ErrOutside", rel, err)
		}
	}
}

func TestRel(t *testing.T) {
	root, _ := setup(t)
	abs, _ := Resolve(root, "src/a.txt")
	if got := Rel(root, abs); got != "src/a.txt" {
		t.Errorf("Rel = %q", got)
	}
	if got := Rel(root, mustResolve(t, root, "")); got != "" {
		t.Errorf("Rel(root) = %q", got)
	}
}

func mustResolve(t *testing.T, root, rel string) string {
	t.Helper()
	p, err := Resolve(root, rel)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

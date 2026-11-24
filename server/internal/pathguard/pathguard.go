// Package pathguard resolves client-supplied paths and keeps them inside a project root.
package pathguard

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

var ErrOutside = errors.New("path is outside the project")

// Resolve joins rel onto root and returns the absolute path. It rejects absolute paths, ".."
// escapes, and symlinks that lead outside root. The target may not exist yet (for writes):
// the deepest existing ancestor is resolved and the remainder appended.
func Resolve(root, rel string) (string, error) {
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", err
	}
	if filepath.IsAbs(rel) || strings.HasPrefix(rel, "/") || strings.ContainsRune(rel, 0) {
		return "", ErrOutside
	}
	joined := filepath.Join(realRoot, filepath.FromSlash(rel))
	if !within(realRoot, joined) {
		return "", ErrOutside
	}

	p := joined
	var rest []string
	for {
		real, err := filepath.EvalSymlinks(p)
		if err == nil {
			p = real
			break
		}
		if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
		parent := filepath.Dir(p)
		if parent == p {
			return "", err
		}
		rest = append([]string{filepath.Base(p)}, rest...)
		p = parent
	}
	full := filepath.Join(append([]string{p}, rest...)...)
	if !within(realRoot, full) {
		return "", ErrOutside
	}
	return full, nil
}

// Rel returns the slash-separated path of abs relative to root ("" for root itself).
func Rel(root, abs string) string {
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		realRoot = root
	}
	r, err := filepath.Rel(realRoot, abs)
	if err != nil || r == "." {
		return ""
	}
	return filepath.ToSlash(r)
}

func within(root, p string) bool {
	return p == root || strings.HasPrefix(p, root+string(filepath.Separator))
}

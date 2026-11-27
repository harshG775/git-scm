// Package execpath finds executables on PATH without os/exec.LookPath.
//
// LookPath checks execute permission with faccessat2, which Android's seccomp filter does not
// allow: the kernel kills the process with SIGSYS instead of returning ENOSYS, so Go's fallback
// never runs. Termux hits this. Stat-ing the file avoids the syscall; passing the resulting
// absolute path to exec.Command skips LookPath entirely.
package execpath

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Look returns the path of the named executable. Names containing a slash are returned as is.
func Look(name string) (string, error) {
	if strings.Contains(name, "/") {
		return name, nil
	}
	for _, dir := range filepath.SplitList(os.Getenv("PATH")) {
		if dir == "" {
			dir = "."
		}
		p := filepath.Join(dir, name)
		if fi, err := os.Stat(p); err == nil && fi.Mode().IsRegular() && fi.Mode()&0o111 != 0 {
			return p, nil
		}
	}
	return "", fmt.Errorf("%s: %w", name, exec.ErrNotFound)
}

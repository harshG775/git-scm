package git

import (
	"context"
	"strconv"
	"strings"
)

// Lines is how many lines a file gained and lost.
type Lines struct {
	Added   int `json:"added"`
	Removed int `json:"removed"`
}

// Numstat holds line counts per project-relative path, for the staged and unstaged halves of the
// status list. Untracked and binary files have no entry.
type Numstat struct {
	Staged  map[string]Lines `json:"staged"`
	Changes map[string]Lines `json:"changes"`
}

// Numstat counts changed lines: HEAD vs index for Staged, index vs working tree for Changes.
func (r Repo) Numstat(ctx context.Context) (Numstat, error) {
	out := Numstat{Staged: map[string]Lines{}, Changes: map[string]Lines{}}
	for _, half := range []struct {
		args []string
		into map[string]Lines
	}{
		{[]string{"diff", "--cached"}, out.Staged},
		{[]string{"diff"}, out.Changes},
	} {
		// --relative keeps paths relative to the project when it is a subdirectory of the repo;
		// --no-renames reports a rename as a delete plus an add, so every path has its own counts.
		args := append([]string{"--no-optional-locks"}, half.args...)
		args = append(args, "--numstat", "-z", "--no-renames", "--no-ext-diff", "--relative")
		res, err := r.run(ctx, opts{}, args...)
		if err != nil {
			// no HEAD yet (before the first commit): nothing is staged against it
			if len(half.args) == 2 {
				continue
			}
			return out, err
		}
		parseNumstat(res.out, half.into)
	}
	return out, nil
}

// parseNumstat reads `added<TAB>removed<TAB>path<NUL>` records; binary files report "-".
func parseNumstat(b []byte, into map[string]Lines) {
	for _, rec := range strings.Split(string(b), "\x00") {
		f := strings.SplitN(rec, "\t", 3)
		if len(f) != 3 {
			continue
		}
		added, err1 := strconv.Atoi(f[0])
		removed, err2 := strconv.Atoi(f[1])
		if err1 != nil || err2 != nil {
			continue
		}
		into[f[2]] = Lines{Added: added, Removed: removed}
	}
}

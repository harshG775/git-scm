package git

import (
	"context"
	"errors"
	"sort"
	"strconv"
	"strings"
)

// Status letters shown next to files, as in VS Code.
const (
	StatusModified   = "M"
	StatusAdded      = "A"
	StatusDeleted    = "D"
	StatusRenamed    = "R"
	StatusCopied     = "C"
	StatusTypeChange = "T"
	StatusUntracked  = "U"
	StatusConflict   = "!"
)

type Change struct {
	// Path is relative to the project root. OrigPath is set for renames and copies.
	Path     string `json:"path"`
	OrigPath string `json:"origPath,omitempty"`
	Status   string `json:"status"`
}

type Status struct {
	IsRepo   bool   `json:"isRepo"`
	Branch   string `json:"branch"`
	Detached bool   `json:"detached"`
	Oid      string `json:"oid"`
	Upstream string `json:"upstream"`
	Ahead    int    `json:"ahead"`
	Behind   int    `json:"behind"`
	// Conflicts are unmerged paths; Staged is HEAD vs index; Changes is index vs working tree
	// plus untracked files. A file edited after staging appears in both Staged and Changes.
	Conflicts []Change `json:"conflicts"`
	Staged    []Change `json:"staged"`
	Changes   []Change `json:"changes"`
}

func (r Repo) Status(ctx context.Context) (Status, error) {
	prefix, err := r.git(ctx, "rev-parse", "--show-prefix")
	if err != nil {
		var ge *Error
		if errors.As(err, &ge) && strings.Contains(ge.Msg, "not a git repository") {
			return Status{IsRepo: false, Conflicts: []Change{}, Staged: []Change{}, Changes: []Change{}}, nil
		}
		return Status{}, err
	}
	// --no-optional-locks: never take index.lock, so polling cannot block the user's own git commands.
	res, err := r.run(ctx, opts{}, "--no-optional-locks", "status", "--porcelain=v2", "-z", "--branch", "--untracked-files=all")
	if err != nil {
		return Status{}, err
	}
	return ParseStatus(res.out, prefix), nil
}

// ParseStatus parses `git status --porcelain=v2 -z --branch`. Git reports paths relative to the
// repository root; prefix is the project directory's position inside it ("" or "sub/"), so
// paths are made project-relative and anything outside the project is dropped.
func ParseStatus(out []byte, prefix string) Status {
	st := Status{IsRepo: true, Conflicts: []Change{}, Staged: []Change{}, Changes: []Change{}}
	rel := func(p string) (string, bool) {
		if !strings.HasPrefix(p, prefix) {
			return "", false
		}
		return strings.TrimPrefix(p, prefix), true
	}

	recs := strings.Split(string(out), "\x00")
	for i := 0; i < len(recs); i++ {
		rec := recs[i]
		switch {
		case strings.HasPrefix(rec, "# branch.oid "):
			st.Oid = strings.TrimPrefix(rec, "# branch.oid ")
		case strings.HasPrefix(rec, "# branch.head "):
			st.Branch = strings.TrimPrefix(rec, "# branch.head ")
			if st.Branch == "(detached)" {
				st.Detached = true
			}
		case strings.HasPrefix(rec, "# branch.upstream "):
			st.Upstream = strings.TrimPrefix(rec, "# branch.upstream ")
		case strings.HasPrefix(rec, "# branch.ab "):
			f := strings.Fields(strings.TrimPrefix(rec, "# branch.ab "))
			if len(f) == 2 {
				st.Ahead, _ = strconv.Atoi(strings.TrimPrefix(f[0], "+"))
				st.Behind, _ = strconv.Atoi(strings.TrimPrefix(f[1], "-"))
			}
		case strings.HasPrefix(rec, "1 "): // 1 XY sub mH mI mW hH hI path
			f := strings.SplitN(rec, " ", 9)
			if len(f) == 9 {
				st.add(f[1], f[8], "", rel)
			}
		case strings.HasPrefix(rec, "2 "): // 2 XY sub mH mI mW hH hI Xscore path \0 origPath
			f := strings.SplitN(rec, " ", 10)
			orig := ""
			if i+1 < len(recs) {
				i++
				orig = recs[i]
			}
			if len(f) == 10 {
				st.add(f[1], f[9], orig, rel)
			}
		case strings.HasPrefix(rec, "u "): // u XY sub m1 m2 m3 mW h1 h2 h3 path
			f := strings.SplitN(rec, " ", 11)
			if len(f) == 11 {
				if p, ok := rel(f[10]); ok {
					st.Conflicts = append(st.Conflicts, Change{Path: p, Status: StatusConflict})
				}
			}
		case strings.HasPrefix(rec, "? "):
			if p, ok := rel(strings.TrimPrefix(rec, "? ")); ok {
				st.Changes = append(st.Changes, Change{Path: p, Status: StatusUntracked})
			}
		}
	}

	for _, list := range [][]Change{st.Conflicts, st.Staged, st.Changes} {
		sort.Slice(list, func(a, b int) bool { return list[a].Path < list[b].Path })
	}
	return st
}

// add records one tracked entry: X is the index column (staged), Y the working-tree column.
func (st *Status) add(xy, path, orig string, rel func(string) (string, bool)) {
	p, ok := rel(path)
	if !ok || len(xy) != 2 {
		return
	}
	if orig != "" {
		if o, ok := rel(orig); ok {
			orig = o
		}
	}
	if xy[0] != '.' {
		st.Staged = append(st.Staged, Change{Path: p, OrigPath: orig, Status: string(xy[0])})
	}
	if xy[1] != '.' {
		st.Changes = append(st.Changes, Change{Path: p, Status: string(xy[1])})
	}
}

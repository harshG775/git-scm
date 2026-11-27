package git

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

type Branch struct {
	Name     string `json:"name"`
	Current  bool   `json:"current"`
	Upstream string `json:"upstream"`
	Oid      string `json:"oid"`
	Subject  string `json:"subject"`
	// Ahead and Behind count commits against the upstream (both 0 without one).
	Ahead  int `json:"ahead"`
	Behind int `json:"behind"`
	// Merged reports that the branch tip is already part of the checked-out branch, so deleting
	// it loses nothing. The current branch is never "merged" into itself.
	Merged bool `json:"merged"`
}

type BranchList struct {
	IsRepo bool `json:"isRepo"`
	// Head is the checked-out branch ("" when detached). It is set even before the first commit,
	// when the branch exists in HEAD but not yet in Branches.
	Head     string   `json:"head"`
	Detached bool     `json:"detached"`
	Branches []Branch `json:"branches"`
}

// Branches lists local branches: the current one first, then by most recent commit.
func (r Repo) Branches(ctx context.Context) (BranchList, error) {
	list := BranchList{Branches: []Branch{}}

	head, err := r.git(ctx, "symbolic-ref", "--short", "-q", "HEAD")
	if err != nil {
		var ge *Error
		switch {
		case !errors.As(err, &ge):
			return list, err
		case strings.Contains(ge.Msg, "not a git repository"):
			return list, nil
		case ge.Code == 1: // quiet "not a symbolic ref": HEAD is detached
			list.Detached = true
		default:
			return list, err
		}
	}
	list.IsRepo, list.Head = true, head

	const sep = "%00" // NUL: cannot appear in a ref name or a subject
	format := strings.Join([]string{"%(HEAD)", "%(refname:lstrip=2)", "%(upstream:short)", "%(objectname:short)", "%(contents:subject)", "%(upstream:track,nobracket)"}, sep)
	res, err := r.run(ctx, opts{}, "for-each-ref", "--sort=-committerdate", "--format="+format, "refs/heads")
	if err != nil {
		return list, err
	}
	merged := map[string]bool{}
	if mres, err := r.run(ctx, opts{}, "for-each-ref", "--merged", "HEAD", "--format=%(refname:lstrip=2)", "refs/heads"); err == nil {
		for _, n := range strings.Split(string(mres.out), "\n") {
			merged[strings.TrimSpace(n)] = true
		}
	} // unborn HEAD: nothing is merged yet
	for _, line := range strings.Split(string(res.out), "\n") {
		f := strings.Split(strings.TrimRight(line, "\r"), "\x00")
		if len(f) != 6 {
			continue
		}
		b := Branch{Current: f[0] == "*", Name: f[1], Upstream: f[2], Oid: f[3], Subject: f[4]}
		b.Ahead, b.Behind = parseTrack(f[5])
		b.Merged = !b.Current && merged[b.Name]
		if b.Current {
			list.Branches = append([]Branch{b}, list.Branches...)
		} else {
			list.Branches = append(list.Branches, b)
		}
	}
	return list, nil
}

// parseTrack reads `%(upstream:track,nobracket)`: "ahead 1", "behind 2", "ahead 1, behind 2",
// "gone" or "".
func parseTrack(s string) (ahead, behind int) {
	for _, part := range strings.Split(s, ",") {
		var n int
		switch fields := strings.Fields(part); {
		case len(fields) == 2 && fields[0] == "ahead":
			fmt.Sscan(fields[1], &n)
			ahead = n
		case len(fields) == 2 && fields[0] == "behind":
			fmt.Sscan(fields[1], &n)
			behind = n
		}
	}
	return ahead, behind
}

func checkName(name string) error {
	if name == "" || strings.HasPrefix(name, "-") || strings.Contains(name, "@{") {
		return &Error{Msg: fmt.Sprintf("%q is not a valid branch name", name)}
	}
	return nil
}

// CreateBranch creates a branch at HEAD and switches to it, as VS Code's "Create Branch" does.
func (r Repo) CreateBranch(ctx context.Context, name string) error {
	return r.CreateBranchFrom(ctx, name, "")
}

// CreateBranchFrom is CreateBranch starting at another branch, remote branch, tag or commit.
// An empty from means HEAD.
func (r Repo) CreateBranchFrom(ctx context.Context, name, from string) error {
	if err := checkName(name); err != nil {
		return err
	}
	if _, err := r.git(ctx, "check-ref-format", "--branch", name); err != nil {
		return &Error{Msg: fmt.Sprintf("%q is not a valid branch name", name)}
	}
	if from == "" {
		_, err := r.git(ctx, "switch", "-c", name)
		return err
	}
	if err := checkName(from); err != nil {
		return err
	}
	if _, err := r.git(ctx, "rev-parse", "--verify", "--quiet", from+"^{commit}"); err != nil {
		return &Error{Msg: fmt.Sprintf("there is nothing named %q to start from", from)}
	}
	_, err := r.git(ctx, "switch", "-c", name, "--no-track", from)
	return err
}

// SwitchBranch checks out an existing local branch. Git refuses when uncommitted changes would
// be overwritten and says which files, so its message is passed on unchanged.
func (r Repo) SwitchBranch(ctx context.Context, name string) error {
	if err := checkName(name); err != nil {
		return err
	}
	if _, err := r.git(ctx, "rev-parse", "--verify", "--quiet", "refs/heads/"+name); err != nil {
		return &Error{Msg: fmt.Sprintf("there is no local branch named %q", name)}
	}
	_, err := r.git(ctx, "switch", "--no-guess", name)
	return err
}

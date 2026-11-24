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
	format := strings.Join([]string{"%(HEAD)", "%(refname:lstrip=2)", "%(upstream:short)", "%(objectname:short)", "%(contents:subject)"}, sep)
	res, err := r.run(ctx, opts{}, "for-each-ref", "--sort=-committerdate", "--format="+format, "refs/heads")
	if err != nil {
		return list, err
	}
	for _, line := range strings.Split(string(res.out), "\n") {
		f := strings.Split(strings.TrimRight(line, "\r"), "\x00")
		if len(f) != 5 {
			continue
		}
		b := Branch{Current: f[0] == "*", Name: f[1], Upstream: f[2], Oid: f[3], Subject: f[4]}
		if b.Current {
			list.Branches = append([]Branch{b}, list.Branches...)
		} else {
			list.Branches = append(list.Branches, b)
		}
	}
	return list, nil
}

func checkName(name string) error {
	if name == "" || strings.HasPrefix(name, "-") || strings.Contains(name, "@{") {
		return &Error{Msg: fmt.Sprintf("%q is not a valid branch name", name)}
	}
	return nil
}

// CreateBranch creates a branch at HEAD and switches to it, as VS Code's "Create Branch" does.
func (r Repo) CreateBranch(ctx context.Context, name string) error {
	if err := checkName(name); err != nil {
		return err
	}
	if _, err := r.git(ctx, "check-ref-format", "--branch", name); err != nil {
		return &Error{Msg: fmt.Sprintf("%q is not a valid branch name", name)}
	}
	_, err := r.git(ctx, "switch", "-c", name)
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

package git

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

type RemoteBranch struct {
	Ref     string `json:"ref"`    // origin/feature/x
	Remote  string `json:"remote"` // origin
	Name    string `json:"name"`   // feature/x
	Oid     string `json:"oid"`
	Subject string `json:"subject"`
	// HasLocal reports a local branch with the same name already exists: checking out then just
	// switches to it, instead of creating a tracking branch.
	HasLocal bool `json:"hasLocal"`
}

type RemoteList struct {
	IsRepo   bool           `json:"isRepo"`
	Remotes  []string       `json:"remotes"`
	Branches []RemoteBranch `json:"branches"`
}

// Remotes lists remote-tracking branches (as last fetched), most recently committed first.
func (r Repo) Remotes(ctx context.Context) (RemoteList, error) {
	list := RemoteList{Remotes: []string{}, Branches: []RemoteBranch{}}

	out, err := r.git(ctx, "remote")
	if err != nil {
		var ge *Error
		if errors.As(err, &ge) && strings.Contains(ge.Msg, "not a git repository") {
			return list, nil
		}
		return list, err
	}
	list.IsRepo = true
	for _, n := range strings.Split(out, "\n") {
		if n = strings.TrimSpace(n); n != "" {
			list.Remotes = append(list.Remotes, n)
		}
	}

	locals := map[string]bool{}
	res, err := r.run(ctx, opts{}, "for-each-ref", "--format=%(refname:lstrip=2)", "refs/heads")
	if err != nil {
		return list, err
	}
	for _, n := range strings.Split(string(res.out), "\n") {
		locals[strings.TrimSpace(n)] = true
	}

	format := "%(refname:lstrip=2)%00%(objectname:short)%00%(contents:subject)"
	res, err = r.run(ctx, opts{}, "for-each-ref", "--sort=-committerdate", "--format="+format, "refs/remotes")
	if err != nil {
		return list, err
	}
	for _, line := range strings.Split(string(res.out), "\n") {
		f := strings.Split(strings.TrimRight(line, "\r"), "\x00")
		if len(f) != 3 || strings.HasSuffix(f[0], "/HEAD") || f[0] == "" {
			continue
		}
		remote, name := splitRemote(f[0], list.Remotes)
		list.Branches = append(list.Branches, RemoteBranch{Ref: f[0], Remote: remote, Name: name, Oid: f[1], Subject: f[2], HasLocal: locals[name]})
	}
	return list, nil
}

// splitRemote splits "origin/feature/x" using the known remote names (the longest match wins,
// since remote names may themselves contain slashes).
func splitRemote(ref string, remotes []string) (remote, name string) {
	for _, r := range remotes {
		if strings.HasPrefix(ref, r+"/") && len(r) > len(remote) {
			remote, name = r, strings.TrimPrefix(ref, r+"/")
		}
	}
	if remote == "" {
		remote, name, _ = strings.Cut(ref, "/")
	}
	return remote, name
}

// Fetch downloads from every remote and forgets branches deleted there.
func (r Repo) Fetch(ctx context.Context) (string, error) {
	res, err := r.run(ctx, opts{combined: true}, "fetch", "--all", "--prune")
	return strings.TrimSpace(string(res.out)), err
}

// SwitchRemote creates a local branch tracking a remote one ("origin/feature") and switches to it.
// If a local branch of that name already exists, git refuses and says so.
func (r Repo) SwitchRemote(ctx context.Context, ref string) error {
	if err := checkName(ref); err != nil {
		return err
	}
	if strings.HasSuffix(ref, "/HEAD") {
		return &Error{Msg: fmt.Sprintf("%q is not a branch", ref)}
	}
	if _, err := r.git(ctx, "rev-parse", "--verify", "--quiet", "refs/remotes/"+ref); err != nil {
		return &Error{Msg: fmt.Sprintf("there is no remote branch named %q (fetch first?)", ref)}
	}
	_, err := r.git(ctx, "switch", "--track", ref)
	return err
}

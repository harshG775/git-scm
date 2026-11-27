package git

import (
	"context"
	"fmt"
	"strings"
)

// RenameBranch renames a local branch, including the checked-out one.
func (r Repo) RenameBranch(ctx context.Context, old, name string) error {
	if err := checkName(old); err != nil {
		return err
	}
	if err := checkName(name); err != nil {
		return err
	}
	if _, err := r.git(ctx, "check-ref-format", "--branch", name); err != nil {
		return &Error{Msg: fmt.Sprintf("%q is not a valid branch name", name)}
	}
	_, err := r.git(ctx, "branch", "-m", old, name)
	return err
}

// DeleteBranch deletes a local branch. Without force git refuses a branch that is not merged,
// and refuses the checked-out branch either way; its message is passed on.
func (r Repo) DeleteBranch(ctx context.Context, name string, force bool) error {
	if err := checkName(name); err != nil {
		return err
	}
	flag := "-d"
	if force {
		flag = "-D"
	}
	_, err := r.git(ctx, "branch", flag, "--", name)
	return err
}

// DeleteRemoteBranch removes a branch from its remote ("origin/feature/x" deletes feature/x on origin).
func (r Repo) DeleteRemoteBranch(ctx context.Context, ref string) (string, error) {
	if err := checkName(ref); err != nil {
		return "", err
	}
	remotes, err := r.Remotes(ctx)
	if err != nil {
		return "", err
	}
	remote, name := splitRemote(ref, remotes.Remotes)
	if remote == "" || name == "" || name == "HEAD" {
		return "", &Error{Msg: fmt.Sprintf("%q is not a remote branch", ref)}
	}
	res, err := r.run(ctx, opts{combined: true}, "push", remote, "--delete", name)
	return strings.TrimSpace(string(res.out)), err
}

// DeleteTag deletes a local tag.
func (r Repo) DeleteTag(ctx context.Context, name string) error {
	if err := checkName(name); err != nil {
		return err
	}
	_, err := r.git(ctx, "tag", "-d", name)
	return err
}

// PushTag publishes one tag to the upstream's remote, or origin.
func (r Repo) PushTag(ctx context.Context, name string) (string, error) {
	if err := checkName(name); err != nil {
		return "", err
	}
	remote := "origin"
	if up, err := r.git(ctx, "rev-parse", "--abbrev-ref", "@{upstream}"); err == nil {
		if remotes, err := r.Remotes(ctx); err == nil {
			if rem, _ := splitRemote(up, remotes.Remotes); rem != "" {
				remote = rem
			}
		}
	}
	res, err := r.run(ctx, opts{combined: true}, "push", remote, "refs/tags/"+name)
	return strings.TrimSpace(string(res.out)), err
}

// Merge merges a branch, remote branch or tag into the checked-out branch. A phone has no
// editor for conflicts, so a merge that conflicts is aborted and the tree is left as it was; the
// error lists the conflicting files.
func (r Repo) Merge(ctx context.Context, ref string) (string, error) {
	if err := checkName(ref); err != nil {
		return "", err
	}
	if _, err := r.git(ctx, "rev-parse", "--verify", "--quiet", ref+"^{commit}"); err != nil {
		return "", &Error{Msg: fmt.Sprintf("there is nothing named %q to merge", ref)}
	}
	res, err := r.run(ctx, opts{combined: true}, "merge", "--no-edit", ref)
	out := strings.TrimSpace(string(res.out))
	if err == nil {
		return out, nil
	}
	if _, headErr := r.git(ctx, "rev-parse", "--verify", "--quiet", "MERGE_HEAD"); headErr == nil {
		_, _ = r.git(ctx, "merge", "--abort")
		var conflicts []string
		for _, line := range strings.Split(out, "\n") {
			if strings.HasPrefix(line, "CONFLICT") {
				conflicts = append(conflicts, line)
			}
		}
		return "", &Error{Msg: "Merge stopped by conflicts and was undone. Nothing changed.\n" + strings.Join(conflicts, "\n")}
	}
	return "", err
}

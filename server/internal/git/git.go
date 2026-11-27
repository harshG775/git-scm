// Package git wraps the git binary for the Source Control view. Everything shells out to `git`,
// so behaviour matches the git the user already has (config, hooks, credential helpers).
package git

import (
	"bytes"
	"context"
	"errors"
	"github.com/harshG775/git-scm/server/internal/execpath"
	"os"
	"os/exec"
	"strings"
	"syscall"
)

// Error is a failed git command; Msg is git's own message, fit to show the user.
type Error struct {
	Msg  string
	Code int
}

func (e *Error) Error() string { return e.Msg }

type Repo struct {
	// Root is the project directory. It may be a subdirectory of the repository.
	Root string
}

type opts struct {
	stdin    string
	max      int  // stop reading after this many bytes (0 = 64 MiB); the command is killed
	combined bool // merge stderr into the result (git prints progress and hints there)
	// magic lets git use pathspec magic (":/" and friends) internally. Literal pathspecs would
	// break commands that do, such as `stash --include-untracked`, which cleans with ":/". Only
	// use it when no user-supplied path is passed.
	magic bool
}

type result struct {
	out       []byte
	truncated bool
}

// run executes git in the project root. Paths are literal (no globbing), prompts are disabled,
// and the process is detached from the controlling terminal so ssh/git can never block waiting
// for a password on the terminal the server was started from.
func (r Repo) run(ctx context.Context, o opts, args ...string) (result, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	bin, err := execpath.Look("git")
	if err != nil {
		return result{}, err
	}
	cmd := exec.CommandContext(ctx, bin, append([]string{"-C", r.Root}, args...)...)
	cmd.Env = append(os.Environ(), "GIT_TERMINAL_PROMPT=0", "LC_ALL=C")
	if !o.magic {
		cmd.Env = append(cmd.Env, "GIT_LITERAL_PATHSPECS=1")
	}
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if o.stdin != "" {
		cmd.Stdin = strings.NewReader(o.stdin)
	}

	max := o.max
	if max == 0 {
		max = 64 << 20
	}
	out := &limitWriter{max: max, cancel: cancel}
	errb := &bytes.Buffer{}
	cmd.Stdout = out
	if o.combined {
		cmd.Stderr = out
	} else {
		cmd.Stderr = errb
	}

	err = cmd.Run()
	res := result{out: out.buf.Bytes(), truncated: out.truncated}
	if err == nil || out.truncated {
		return res, nil
	}

	msg := strings.TrimSpace(errb.String())
	if msg == "" {
		msg = strings.TrimSpace(string(res.out))
	}
	if msg == "" {
		msg = err.Error()
	}
	e := &Error{Msg: msg, Code: -1}
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		e.Code = ee.ExitCode()
	}
	if ctx.Err() != nil && errors.Is(ctx.Err(), context.DeadlineExceeded) {
		e.Msg = "git timed out"
	}
	return res, e
}

// limitWriter keeps the first max bytes, then cancels the command so a huge diff cannot fill memory.
type limitWriter struct {
	buf       bytes.Buffer
	max       int
	cancel    context.CancelFunc
	truncated bool
}

func (w *limitWriter) Write(p []byte) (int, error) {
	if w.truncated {
		return len(p), nil
	}
	if room := w.max - w.buf.Len(); len(p) > room {
		w.buf.Write(p[:room])
		w.truncated = true
		w.cancel()
		return len(p), nil
	}
	return w.buf.Write(p)
}

func (r Repo) git(ctx context.Context, args ...string) (string, error) {
	res, err := r.run(ctx, opts{}, args...)
	return strings.TrimSpace(string(res.out)), err
}

// Stage adds paths (including deletions) to the index.
func (r Repo) Stage(ctx context.Context, paths []string) error {
	_, err := r.git(ctx, append([]string{"add", "--"}, paths...)...)
	return err
}

// Unstage removes paths from the index, keeping working-tree changes. It also works before
// the first commit, when there is no HEAD to reset to.
func (r Repo) Unstage(ctx context.Context, paths []string) error {
	if _, err := r.git(ctx, "rev-parse", "--verify", "-q", "HEAD"); err != nil {
		_, err = r.git(ctx, append([]string{"rm", "--cached", "-r", "-q", "--"}, paths...)...)
		return err
	}
	_, err := r.git(ctx, append([]string{"reset", "-q", "--"}, paths...)...)
	return err
}

// Discard throws away working-tree changes: tracked files are restored from the index and
// untracked files are deleted. This cannot be undone.
func (r Repo) Discard(ctx context.Context, paths []string) error {
	st, err := r.Status(ctx)
	if err != nil {
		return err
	}
	untracked := map[string]bool{}
	for _, c := range st.Changes {
		if c.Status == StatusUntracked {
			untracked[c.Path] = true
		}
	}
	var tracked, gone []string
	for _, p := range paths {
		if untracked[p] {
			gone = append(gone, p)
		} else {
			tracked = append(tracked, p)
		}
	}
	if len(tracked) > 0 {
		if _, err := r.git(ctx, append([]string{"checkout", "-q", "--"}, tracked...)...); err != nil {
			return err
		}
	}
	if len(gone) > 0 {
		if _, err := r.git(ctx, append([]string{"clean", "-f", "-q", "--"}, gone...)...); err != nil {
			return err
		}
	}
	return nil
}

// Commit records the staged changes. The message goes over stdin so it is never parsed as a flag.
// With amend the last commit is rewritten instead; an empty message then keeps the old one.
func (r Repo) Commit(ctx context.Context, message string, amend bool) (string, error) {
	args := []string{"commit", "-q"}
	o := opts{}
	switch {
	case amend && strings.TrimSpace(message) == "":
		args = append(args, "--amend", "--no-edit")
	case amend:
		args = append(args, "--amend", "-F", "-")
		o.stdin = message
	default:
		args = append(args, "-F", "-")
		o.stdin = message
	}
	if _, err := r.run(ctx, o, args...); err != nil {
		return "", err
	}
	return r.git(ctx, "rev-parse", "--short", "HEAD")
}

// UndoCommit takes the last commit back: the branch moves to its parent and the commit's changes
// stay staged. It returns the commit's message so the caller can put it back in the message box.
// Commits that are merges, have no parent or are already on the upstream are refused, since
// rewriting those would need a force push or a revert instead.
func (r Repo) UndoCommit(ctx context.Context) (string, error) {
	if _, err := r.git(ctx, "rev-parse", "--verify", "-q", "HEAD~1"); err != nil {
		return "", &Error{Msg: "there is no earlier commit to go back to"}
	}
	parents, err := r.git(ctx, "rev-list", "--parents", "-n", "1", "HEAD")
	if err != nil {
		return "", err
	}
	if len(strings.Fields(parents)) > 2 {
		return "", &Error{Msg: "the last commit is a merge; it cannot be undone here"}
	}
	if _, err := r.git(ctx, "rev-parse", "--verify", "-q", "@{upstream}"); err == nil {
		if _, err := r.git(ctx, "merge-base", "--is-ancestor", "HEAD", "@{upstream}"); err == nil {
			return "", &Error{Msg: "the last commit is already on the remote; revert it instead"}
		}
	}
	message, err := r.git(ctx, "log", "-1", "--format=%B")
	if err != nil {
		return "", err
	}
	if _, err := r.git(ctx, "reset", "--soft", "HEAD~1"); err != nil {
		return "", err
	}
	return message, nil
}

const maxDiff = 1 << 20

// Diff returns a unified diff for one path. Untracked files are diffed against /dev/null, so
// they show as fully added. truncated reports that output was cut at 1 MiB.
func (r Repo) Diff(ctx context.Context, path string, staged bool) (diff string, truncated bool, err error) {
	args := []string{"diff", "--no-color", "--no-ext-diff"}
	if staged {
		args = append(args, "--cached")
	}
	res, err := r.run(ctx, opts{max: maxDiff}, append(args, "--", path)...)
	if err != nil {
		return "", false, err
	}
	if len(res.out) == 0 && !staged {
		if other, _ := r.git(ctx, "ls-files", "--others", "--exclude-standard", "--", path); other != "" {
			// --no-index exits 1 when the files differ, which is the expected result here.
			res, err = r.run(ctx, opts{max: maxDiff}, "diff", "--no-color", "--no-ext-diff", "--no-index", "--", os.DevNull, path)
			var ge *Error
			if err != nil && !(errors.As(err, &ge) && ge.Code == 1) {
				return "", false, err
			}
		}
	}
	return string(res.out), res.truncated, nil
}

// Pull fast-forwards only: on a phone there is no editor for merge commits, so diverged
// branches fail with git's message instead of starting a merge.
func (r Repo) Pull(ctx context.Context) (string, error) {
	res, err := r.run(ctx, opts{combined: true}, "pull", "--ff-only")
	return strings.TrimSpace(string(res.out)), err
}

// Push publishes the current branch, setting origin as upstream the first time.
func (r Repo) Push(ctx context.Context) (string, error) {
	args := []string{"push"}
	if st, err := r.Status(ctx); err == nil && st.IsRepo && st.Upstream == "" && !st.Detached {
		if remotes, _ := r.git(ctx, "remote"); containsLine(remotes, "origin") {
			args = []string{"push", "-u", "origin", "HEAD"}
		}
	}
	res, err := r.run(ctx, opts{combined: true}, args...)
	return strings.TrimSpace(string(res.out)), err
}

func containsLine(s, line string) bool {
	for _, l := range strings.Split(s, "\n") {
		if strings.TrimSpace(l) == line {
			return true
		}
	}
	return false
}

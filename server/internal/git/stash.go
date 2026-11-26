package git

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

type Stash struct {
	// Index is the position in the stash list (stash@{Index}); it shifts as stashes come and go,
	// so every action also sends Oid, which identifies the stash for good.
	Index int    `json:"index"`
	Oid   string `json:"oid"`
	// Branch is where the stash was made. Title is the message you typed, or for an automatic
	// stash ("WIP on main: 1a2b3c4 fix login") the summary of the commit it was made on.
	Branch string `json:"branch"`
	Title  string `json:"title"`
	// Auto is true when no message was given.
	Auto bool `json:"auto"`
	// Base is the commit the stash was made on (HEAD at that moment); the graph hangs it there.
	Base string `json:"base"`
	// Time is when it was stashed, in Unix seconds.
	Time int64 `json:"time"`
}

type StashList struct {
	IsRepo  bool    `json:"isRepo"`
	Stashes []Stash `json:"stashes"`
}

var (
	stashAuto   = regexp.MustCompile(`^WIP on ([^:]*): [0-9a-f]{7,40} ?(.*)$`)
	stashCustom = regexp.MustCompile(`^On ([^:]*): ?(.*)$`)
)
var stashRef = regexp.MustCompile(`^stash@\{(\d+)\}$`)

func (r Repo) Stashes(ctx context.Context) (StashList, error) {
	list := StashList{Stashes: []Stash{}}
	res, err := r.run(ctx, opts{}, "stash", "list", "--format=%gd%x00%H%x00%ct%x00%gs%x00%P")
	if err != nil {
		var ge *Error
		if errors.As(err, &ge) && strings.Contains(ge.Msg, "not a git repository") {
			return list, nil
		}
		return list, err
	}
	list.IsRepo = true
	for _, line := range strings.Split(string(res.out), "\n") {
		f := strings.Split(strings.TrimRight(line, "\r"), "\x00")
		if len(f) != 5 {
			continue
		}
		m := stashRef.FindStringSubmatch(f[0])
		if m == nil {
			continue
		}
		idx, _ := strconv.Atoi(m[1])
		t, _ := strconv.ParseInt(f[2], 10, 64)
		s := Stash{Index: idx, Oid: f[1], Time: t, Title: f[3]}
		s.Base, _, _ = strings.Cut(f[4], " ") // parents: the base commit, then the index commit
		if sm := stashAuto.FindStringSubmatch(f[3]); sm != nil {
			s.Branch, s.Title, s.Auto = sm[1], sm[2], true
		} else if sm := stashCustom.FindStringSubmatch(f[3]); sm != nil {
			s.Branch, s.Title = sm[1], sm[2]
		}
		list.Stashes = append(list.Stashes, s)
	}
	return list, nil
}

// StashPush saves uncommitted changes and restores a clean tree. Untracked files are only
// included when asked for, as in git itself.
func (r Repo) StashPush(ctx context.Context, message string, includeUntracked bool) error {
	args := []string{"stash", "push"}
	if includeUntracked {
		args = append(args, "--include-untracked")
	}
	if message = strings.TrimSpace(message); message != "" {
		args = append(args, "-m", message)
	}
	res, err := r.run(ctx, opts{magic: true}, args...)
	if err != nil {
		return err
	}
	out := strings.TrimSpace(string(res.out))
	// git exits 0 but saves nothing in this case.
	if strings.Contains(out, "No local changes to save") {
		return &Error{Msg: "No local changes to stash."}
	}
	return nil
}

// resolve turns (index, oid) into a stash ref, refusing when the list has changed under the caller.
func (r Repo) resolve(ctx context.Context, index int, oid string) (string, error) {
	ref := fmt.Sprintf("stash@{%d}", index)
	got, err := r.git(ctx, "rev-parse", "--verify", "--quiet", ref)
	if err != nil || oid == "" || got != oid {
		return "", &Error{Msg: "The stash list changed. Refresh and try again."}
	}
	return ref, nil
}

// StashApply re-applies a stash and keeps it. On conflicts git says so and the stash stays.
func (r Repo) StashApply(ctx context.Context, index int, oid string) error {
	return r.stashOp(ctx, "apply", index, oid)
}

// StashPop applies a stash and removes it, unless the apply conflicts (then it stays).
func (r Repo) StashPop(ctx context.Context, index int, oid string) error {
	return r.stashOp(ctx, "pop", index, oid)
}

// StashDrop deletes a stash. The commit stays recoverable with `git fsck` for a while.
func (r Repo) StashDrop(ctx context.Context, index int, oid string) error {
	return r.stashOp(ctx, "drop", index, oid)
}

func (r Repo) stashOp(ctx context.Context, op string, index int, oid string) error {
	ref, err := r.resolve(ctx, index, oid)
	if err != nil {
		return err
	}
	// combined: conflict details are printed on stdout, and they are the useful part of the error.
	_, err = r.run(ctx, opts{combined: true}, "stash", op, ref)
	return err
}

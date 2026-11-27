package git

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func nul(parts ...string) []byte { return []byte(strings.Join(parts, "\x00") + "\x00") }

func TestParseStatus(t *testing.T) {
	out := nul(
		"# branch.oid 1234abcd",
		"# branch.head main",
		"# branch.upstream origin/main",
		"# branch.ab +2 -1",
		"1 .M N... 100644 100644 100644 aaa bbb worktree-only.go",
		"1 M. N... 100644 100644 100644 aaa bbb staged-only.go",
		"1 MM N... 100644 100644 100644 aaa bbb both.go",
		"1 A. N... 000000 100644 100644 000 bbb new file with spaces.txt",
		"1 .D N... 100644 100644 000000 aaa bbb deleted.go",
		"2 R. N... 100644 100644 100644 aaa bbb R100 renamed-to.go", "renamed-from.go",
		"u UU N... 100644 100644 100644 100644 a b c conflict.go",
		"? untracked.txt",
		"? dir/nested/untracked.txt",
	)
	st := ParseStatus(out, "")

	if st.Branch != "main" || st.Oid != "1234abcd" || st.Upstream != "origin/main" || st.Ahead != 2 || st.Behind != 1 || st.Detached {
		t.Errorf("branch info = %+v", st)
	}
	if got := paths(st.Staged); got != "both.go:M new file with spaces.txt:A renamed-to.go:R staged-only.go:M" {
		t.Errorf("staged = %s", got)
	}
	if st.Staged[2].OrigPath != "renamed-from.go" {
		t.Errorf("rename origPath = %q", st.Staged[2].OrigPath)
	}
	if got := paths(st.Changes); got != "both.go:M deleted.go:D dir/nested/untracked.txt:U untracked.txt:U worktree-only.go:M" {
		t.Errorf("changes = %s", got)
	}
	if got := paths(st.Conflicts); got != "conflict.go:!" {
		t.Errorf("conflicts = %s", got)
	}
}

func TestParseStatusDetachedAndUnborn(t *testing.T) {
	st := ParseStatus(nul("# branch.oid (initial)", "# branch.head main"), "")
	if st.Oid != "(initial)" || st.Branch != "main" || st.Upstream != "" {
		t.Errorf("unborn = %+v", st)
	}
	st = ParseStatus(nul("# branch.oid abc", "# branch.head (detached)"), "")
	if !st.Detached {
		t.Error("detached not set")
	}
}

func TestParseStatusSubdirectoryProject(t *testing.T) {
	// The project is <repo>/app/: paths are made relative to it and outside paths are dropped.
	out := nul(
		"1 .M N... 100644 100644 100644 a b app/src/x.go",
		"1 .M N... 100644 100644 100644 a b other/y.go",
		"2 R. N... 100644 100644 100644 a b R100 app/new.go", "app/old.go",
		"? app/u.txt",
		"? elsewhere/u.txt",
	)
	st := ParseStatus(out, "app/")
	if got := paths(st.Changes); got != "src/x.go:M u.txt:U" {
		t.Errorf("changes = %s", got)
	}
	if got := paths(st.Staged); got != "new.go:R" || st.Staged[0].OrigPath != "old.go" {
		t.Errorf("staged = %s %+v", got, st.Staged)
	}
}

func paths(cs []Change) string {
	var s []string
	for _, c := range cs {
		s = append(s, c.Path+":"+c.Status)
	}
	return strings.Join(s, " ")
}

// ---- integration tests against real git ----

// isolate keeps the developer's own git config (signing, hooks, aliases) out of the tests.
func isolate(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	t.Setenv("HOME", t.TempDir())
	t.Setenv("GIT_CONFIG_GLOBAL", os.DevNull)
	t.Setenv("GIT_CONFIG_SYSTEM", os.DevNull)
	t.Setenv("GIT_AUTHOR_NAME", "Test")
	t.Setenv("GIT_AUTHOR_EMAIL", "test@example.com")
	t.Setenv("GIT_COMMITTER_NAME", "Test")
	t.Setenv("GIT_COMMITTER_EMAIL", "test@example.com")
}

func sh(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func write(t *testing.T, dir, name, content string) {
	t.Helper()
	p := filepath.Join(dir, name)
	os.MkdirAll(filepath.Dir(p), 0o755)
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func newRepo(t *testing.T) (Repo, string) {
	t.Helper()
	isolate(t)
	dir := t.TempDir()
	sh(t, dir, "init", "-q")
	sh(t, dir, "symbolic-ref", "HEAD", "refs/heads/main")
	return Repo{Root: dir}, dir
}

func commitAll(t *testing.T, dir, msg string) {
	sh(t, dir, "add", "-A")
	sh(t, dir, "commit", "-qm", msg)
}

var ctx = context.Background()

func TestNotARepo(t *testing.T) {
	isolate(t)
	st, err := Repo{Root: t.TempDir()}.Status(ctx)
	if err != nil || st.IsRepo {
		t.Fatalf("status = %+v, err = %v", st, err)
	}
}

func TestStageUnstageFlow(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "one\n")
	commitAll(t, dir, "init")

	write(t, dir, "a.txt", "two\n")
	write(t, dir, "new.txt", "hello\n")
	st, _ := r.Status(ctx)
	if paths(st.Changes) != "a.txt:M new.txt:U" || len(st.Staged) != 0 {
		t.Fatalf("before = changes %s staged %s", paths(st.Changes), paths(st.Staged))
	}

	if err := r.Stage(ctx, []string{"a.txt", "new.txt"}); err != nil {
		t.Fatal(err)
	}
	st, _ = r.Status(ctx)
	if paths(st.Staged) != "a.txt:M new.txt:A" || len(st.Changes) != 0 {
		t.Fatalf("after stage = staged %s changes %s", paths(st.Staged), paths(st.Changes))
	}

	if err := r.Unstage(ctx, []string{"a.txt", "new.txt"}); err != nil {
		t.Fatal(err)
	}
	st, _ = r.Status(ctx)
	if len(st.Staged) != 0 || paths(st.Changes) != "a.txt:M new.txt:U" {
		t.Fatalf("after unstage = staged %s changes %s", paths(st.Staged), paths(st.Changes))
	}
}

func TestStageDeletion(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "gone.txt", "x")
	commitAll(t, dir, "init")
	os.Remove(filepath.Join(dir, "gone.txt"))
	if err := r.Stage(ctx, []string{"gone.txt"}); err != nil {
		t.Fatal(err)
	}
	if st, _ := r.Status(ctx); paths(st.Staged) != "gone.txt:D" {
		t.Errorf("staged = %s", paths(st.Staged))
	}
}

func TestUnstageBeforeFirstCommit(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "x")
	if err := r.Stage(ctx, []string{"a.txt"}); err != nil {
		t.Fatal(err)
	}
	if err := r.Unstage(ctx, []string{"a.txt"}); err != nil {
		t.Fatalf("unstage on unborn branch: %v", err)
	}
	if st, _ := r.Status(ctx); len(st.Staged) != 0 || paths(st.Changes) != "a.txt:U" {
		t.Errorf("status = %+v", st)
	}
}

func TestDiscard(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "keep.txt", "original\n")
	write(t, dir, "del.txt", "original\n")
	commitAll(t, dir, "init")

	write(t, dir, "keep.txt", "edited\n")
	os.Remove(filepath.Join(dir, "del.txt"))
	write(t, dir, "scratch.txt", "untracked\n")

	if err := r.Discard(ctx, []string{"keep.txt", "del.txt", "scratch.txt"}); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "keep.txt")); string(b) != "original\n" {
		t.Errorf("keep.txt = %q", b)
	}
	if _, err := os.Stat(filepath.Join(dir, "del.txt")); err != nil {
		t.Error("deleted file was not restored")
	}
	if _, err := os.Stat(filepath.Join(dir, "scratch.txt")); err == nil {
		t.Error("untracked file was not removed")
	}
	if st, _ := r.Status(ctx); len(st.Changes)+len(st.Staged) != 0 {
		t.Errorf("not clean: %+v", st)
	}
}

func TestDiscardKeepsStagedPart(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "v1\n")
	commitAll(t, dir, "init")
	write(t, dir, "a.txt", "v2\n")
	sh(t, dir, "add", "a.txt")
	write(t, dir, "a.txt", "v3\n") // MM: staged v2, working v3

	if err := r.Discard(ctx, []string{"a.txt"}); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "a.txt")); string(b) != "v2\n" {
		t.Errorf("working copy = %q, want the staged v2", b)
	}
}

func TestPathsAreLiteral(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "a")
	write(t, dir, "b.txt", "b")
	commitAll(t, dir, "init")
	write(t, dir, "a.txt", "A")
	write(t, dir, "b.txt", "B")
	if err := r.Stage(ctx, []string{"*.txt"}); err == nil {
		t.Error("a glob must not match files")
	}
	if st, _ := r.Status(ctx); len(st.Staged) != 0 {
		t.Errorf("glob staged files: %s", paths(st.Staged))
	}
}

func TestCommit(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "x")
	sh(t, dir, "add", "a.txt")
	oid, err := r.Commit(ctx, "-m looks like a flag\n\nbody line", false)
	if err != nil || oid == "" {
		t.Fatalf("commit = %q, %v", oid, err)
	}
	if got := sh(t, dir, "log", "-1", "--format=%B"); !strings.HasPrefix(got, "-m looks like a flag") {
		t.Errorf("message = %q", got)
	}
	if _, err := r.Commit(ctx, "again", false); err == nil {
		t.Error("committing with nothing staged should fail")
	} else if !strings.Contains(err.Error(), "nothing") {
		t.Errorf("error should be git's own message, got %q", err)
	}
}

func TestDiff(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "one\ntwo\n")
	commitAll(t, dir, "init")
	write(t, dir, "a.txt", "one\nTWO\n")
	write(t, dir, "new.txt", "brand new\n")

	d, _, err := r.Diff(ctx, "a.txt", false)
	if err != nil || !strings.Contains(d, "-two") || !strings.Contains(d, "+TWO") {
		t.Errorf("worktree diff = %q, %v", d, err)
	}
	if d, _, _ := r.Diff(ctx, "a.txt", true); d != "" {
		t.Errorf("staged diff should be empty before staging, got %q", d)
	}
	sh(t, dir, "add", "a.txt")
	if d, _, _ := r.Diff(ctx, "a.txt", true); !strings.Contains(d, "+TWO") {
		t.Errorf("staged diff = %q", d)
	}
	if d, _, _ := r.Diff(ctx, "a.txt", false); d != "" {
		t.Errorf("worktree diff should be empty after staging, got %q", d)
	}

	d, _, err = r.Diff(ctx, "new.txt", false) // untracked: shown as all-added
	if err != nil || !strings.Contains(d, "+brand new") || !strings.Contains(d, "new file mode") {
		t.Errorf("untracked diff = %q, %v", d, err)
	}
}

func TestDiffTruncates(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "big.txt", "x\n")
	commitAll(t, dir, "init")
	write(t, dir, "big.txt", strings.Repeat("a line of text that is long enough\n", 80_000)) // ~2.8 MB
	d, truncated, err := r.Diff(ctx, "big.txt", false)
	if err != nil || !truncated || len(d) != maxDiff {
		t.Errorf("len=%d truncated=%v err=%v", len(d), truncated, err)
	}
}

func TestSubdirectoryProject(t *testing.T) {
	_, dir := newRepo(t)
	write(t, dir, "app/a.txt", "1")
	write(t, dir, "other/b.txt", "1")
	commitAll(t, dir, "init")
	write(t, dir, "app/a.txt", "2")
	write(t, dir, "other/b.txt", "2")

	sub := Repo{Root: filepath.Join(dir, "app")}
	st, err := sub.Status(ctx)
	if err != nil || paths(st.Changes) != "a.txt:M" {
		t.Fatalf("status = %s, %v", paths(st.Changes), err)
	}
	if err := sub.Stage(ctx, []string{"a.txt"}); err != nil {
		t.Fatal(err)
	}
	if st, _ := sub.Status(ctx); paths(st.Staged) != "a.txt:M" {
		t.Errorf("staged = %s", paths(st.Staged))
	}
}

func TestPullAndPush(t *testing.T) {
	r, dir := newRepo(t)
	remote := filepath.Join(t.TempDir(), "remote.git")
	sh(t, t.TempDir(), "init", "-q", "--bare", remote)
	sh(t, remote, "symbolic-ref", "HEAD", "refs/heads/main") // clones must check out main
	sh(t, dir, "remote", "add", "origin", remote)
	write(t, dir, "a.txt", "1\n")
	commitAll(t, dir, "first")

	// First push has no upstream: it must set origin as upstream.
	if _, err := r.Push(ctx); err != nil {
		t.Fatalf("first push: %v", err)
	}
	st, _ := r.Status(ctx)
	if st.Upstream != "origin/main" || st.Ahead != 0 || st.Behind != 0 {
		t.Fatalf("after push = %+v", st)
	}

	// A second clone pushes a commit; we are now behind and can fast-forward.
	other := filepath.Join(t.TempDir(), "other")
	sh(t, t.TempDir(), "clone", "-q", remote, other)
	write(t, other, "b.txt", "from other\n")
	sh(t, other, "add", "-A")
	sh(t, other, "commit", "-qm", "second")
	sh(t, other, "push", "-q")

	sh(t, dir, "fetch", "-q")
	if st, _ := r.Status(ctx); st.Behind != 1 {
		t.Fatalf("behind = %d, want 1", st.Behind)
	}
	if _, err := r.Pull(ctx); err != nil {
		t.Fatalf("pull: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "b.txt")); err != nil {
		t.Error("pull did not bring b.txt")
	}

	// Diverge: pull --ff-only must refuse instead of creating a merge commit.
	write(t, dir, "c.txt", "local\n")
	commitAll(t, dir, "local")
	write(t, other, "d.txt", "remote\n")
	sh(t, other, "add", "-A")
	sh(t, other, "commit", "-qm", "remote")
	sh(t, other, "push", "-q")
	if _, err := r.Pull(ctx); err == nil {
		t.Error("diverged pull should fail")
	}
}

func TestOperationsTimeOut(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "x")
	commitAll(t, dir, "init")
	c, cancel := context.WithTimeout(ctx, time.Nanosecond)
	defer cancel()
	time.Sleep(time.Millisecond)
	if _, err := r.Status(c); err == nil {
		t.Error("expected an error from an expired context")
	}
}

func TestCommitAmend(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "1")
	commitAll(t, dir, "first")
	write(t, dir, "b.txt", "2")
	sh(t, dir, "add", "b.txt")

	// an empty message keeps the old one and folds the staged file in
	if _, err := r.Commit(ctx, "", true); err != nil {
		t.Fatal(err)
	}
	if got := sh(t, dir, "log", "-1", "--format=%s"); got != "first" {
		t.Errorf("subject = %q, want it kept", got)
	}
	if got := sh(t, dir, "show", "--name-only", "--format=", "HEAD"); !strings.Contains(got, "b.txt") {
		t.Errorf("amend should include b.txt, got %q", got)
	}

	if _, err := r.Commit(ctx, "renamed", true); err != nil {
		t.Fatal(err)
	}
	if got := sh(t, dir, "log", "-1", "--format=%s"); got != "renamed" {
		t.Errorf("subject = %q", got)
	}
	if got := sh(t, dir, "rev-list", "--count", "HEAD"); got != "1" {
		t.Errorf("amend must not add a commit, count = %s", got)
	}
}

func TestUndoCommit(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "1")
	commitAll(t, dir, "first")
	if _, err := r.UndoCommit(ctx); err == nil {
		t.Error("the first commit has no parent to go back to")
	}

	write(t, dir, "a.txt", "2")
	commitAll(t, dir, "second\n\nwith a body")
	msg, err := r.UndoCommit(ctx)
	if err != nil || !strings.HasPrefix(msg, "second") || !strings.Contains(msg, "with a body") {
		t.Fatalf("undo = %q, %v", msg, err)
	}
	if got := sh(t, dir, "log", "-1", "--format=%s"); got != "first" {
		t.Errorf("HEAD subject = %q", got)
	}
	if st, _ := r.Status(ctx); len(st.Staged) != 1 || st.Staged[0].Path != "a.txt" {
		t.Errorf("the undone changes should stay staged: %+v", st.Staged)
	}
}

func TestUndoCommitRefusesPushedAndMerge(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "1")
	commitAll(t, dir, "first")
	write(t, dir, "a.txt", "2")
	commitAll(t, dir, "second")

	remote := t.TempDir()
	sh(t, remote, "init", "-q", "--bare")
	sh(t, dir, "remote", "add", "origin", remote)
	sh(t, dir, "push", "-q", "-u", "origin", "main")
	if _, err := r.UndoCommit(ctx); err == nil || !strings.Contains(err.Error(), "remote") {
		t.Errorf("a pushed commit must be refused, got %v", err)
	}

	sh(t, dir, "switch", "-qc", "side")
	write(t, dir, "b.txt", "b")
	commitAll(t, dir, "side work")
	sh(t, dir, "switch", "-q", "main")
	write(t, dir, "c.txt", "c")
	commitAll(t, dir, "main work")
	sh(t, dir, "merge", "-q", "--no-ff", "-m", "merge side", "side")
	if _, err := r.UndoCommit(ctx); err == nil || !strings.Contains(err.Error(), "merge") {
		t.Errorf("a merge commit must be refused, got %v", err)
	}
}

func TestNumstat(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "one\ntwo\nthree\n")
	write(t, dir, "b.txt", "x\n")
	commitAll(t, dir, "init")

	write(t, dir, "a.txt", "one\nTWO\nthree\nfour\n") // +2 -1
	sh(t, dir, "add", "a.txt")
	write(t, dir, "b.txt", "x\ny\n") // +1
	write(t, dir, "new.txt", "untracked\n")

	n, err := r.Numstat(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := n.Staged["a.txt"]; got != (Lines{Added: 2, Removed: 1}) {
		t.Errorf("staged a.txt = %+v", got)
	}
	if got := n.Changes["b.txt"]; got != (Lines{Added: 1}) {
		t.Errorf("changes b.txt = %+v", got)
	}
	if _, ok := n.Changes["new.txt"]; ok {
		t.Error("untracked files have no line counts")
	}
}

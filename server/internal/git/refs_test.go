package git

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// repoPushed makes a repo with one commit on main, pushed to a bare "origin".
func repoPushed(t *testing.T) (Repo, string, string) {
	t.Helper()
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "1\n")
	commitAll(t, dir, "first")
	remote := filepath.Join(t.TempDir(), "origin.git")
	if err := os.MkdirAll(remote, 0o755); err != nil {
		t.Fatal(err)
	}
	sh(t, remote, "init", "-q", "--bare")
	sh(t, dir, "remote", "add", "origin", remote)
	sh(t, dir, "push", "-q", "-u", "origin", "main")
	return r, dir, remote
}

func TestBranchesAheadBehindMerged(t *testing.T) {
	r, dir, _ := repoPushed(t)
	write(t, dir, "a.txt", "2\n")
	commitAll(t, dir, "local only") // ahead 1
	sh(t, dir, "branch", "done")    // same tip as main: merged
	sh(t, dir, "switch", "-qc", "side")
	write(t, dir, "b.txt", "b\n")
	commitAll(t, dir, "side work") // not merged into main
	sh(t, dir, "switch", "-q", "main")

	bl, err := r.Branches(ctx)
	if err != nil {
		t.Fatal(err)
	}
	by := map[string]Branch{}
	for _, b := range bl.Branches {
		by[b.Name] = b
	}
	if b := by["main"]; b.Ahead != 1 || b.Behind != 0 || b.Merged {
		t.Errorf("main = %+v, want ahead 1 and not 'merged' into itself", b)
	}
	if !by["done"].Merged {
		t.Errorf("done should be merged: %+v", by["done"])
	}
	if by["side"].Merged {
		t.Errorf("side has its own commit, it is not merged: %+v", by["side"])
	}
}

func TestParseTrack(t *testing.T) {
	for in, want := range map[string][2]int{
		"":                  {0, 0},
		"ahead 3":           {3, 0},
		"behind 2":          {0, 2},
		"ahead 1, behind 4": {1, 4},
		"gone":              {0, 0},
	} {
		if a, b := parseTrack(in); [2]int{a, b} != want {
			t.Errorf("parseTrack(%q) = %d, %d, want %v", in, a, b, want)
		}
	}
}

func TestCreateBranchFrom(t *testing.T) {
	r, dir, _ := repoPushed(t)
	sh(t, dir, "tag", "v1")
	write(t, dir, "a.txt", "2\n")
	commitAll(t, dir, "second")

	if err := r.CreateBranchFrom(ctx, "from-tag", "v1"); err != nil {
		t.Fatal(err)
	}
	if got := sh(t, dir, "log", "-1", "--format=%s"); got != "first" {
		t.Errorf("branch should start at the tag, HEAD subject = %q", got)
	}
	if bl, _ := r.Branches(ctx); bl.Head != "from-tag" || bl.Branches[0].Upstream != "" {
		t.Errorf("should switch to the new, untracked branch: %+v", bl)
	}
	if err := r.CreateBranchFrom(ctx, "x", "no-such-ref"); err == nil || !strings.Contains(err.Error(), "nothing named") {
		t.Errorf("unknown start = %v", err)
	}
	if err := r.CreateBranchFrom(ctx, "y", "--output=/tmp/x"); err == nil {
		t.Error("a start point that looks like a flag must be refused")
	}
}

func TestRenameAndDeleteBranch(t *testing.T) {
	r, dir, _ := repoPushed(t)
	sh(t, dir, "branch", "old")

	if err := r.RenameBranch(ctx, "old", "new/name"); err != nil {
		t.Fatal(err)
	}
	if bl, _ := r.Branches(ctx); !strings.Contains(names(bl.Branches), "new/name") || strings.Contains(names(bl.Branches), "old") {
		t.Errorf("after rename: %s", names(bl.Branches))
	}
	if err := r.RenameBranch(ctx, "new/name", "main"); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Errorf("rename onto an existing branch = %v", err)
	}
	if err := r.RenameBranch(ctx, "new/name", "bad name"); err == nil || !strings.Contains(err.Error(), "not a valid branch name") {
		t.Errorf("rename to an invalid name = %v", err)
	}

	if err := r.DeleteBranch(ctx, "main", false); err == nil {
		t.Error("the checked-out branch cannot be deleted")
	}
	if err := r.DeleteBranch(ctx, "new/name", false); err != nil {
		t.Errorf("deleting a merged branch: %v", err)
	}

	sh(t, dir, "switch", "-qc", "wip")
	write(t, dir, "w.txt", "w\n")
	commitAll(t, dir, "unmerged work")
	sh(t, dir, "switch", "-q", "main")
	if err := r.DeleteBranch(ctx, "wip", false); err == nil || !strings.Contains(err.Error(), "not fully merged") {
		t.Errorf("an unmerged branch needs force: %v", err)
	}
	if err := r.DeleteBranch(ctx, "wip", true); err != nil {
		t.Errorf("forced delete: %v", err)
	}
}

func TestMerge(t *testing.T) {
	r, dir, _ := repoPushed(t)
	sh(t, dir, "switch", "-qc", "feature")
	write(t, dir, "f.txt", "f\n")
	commitAll(t, dir, "feature work")
	sh(t, dir, "switch", "-q", "main")

	if _, err := r.Merge(ctx, "feature"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "f.txt")); err != nil {
		t.Errorf("merged file missing: %v", err)
	}
	if _, err := r.Merge(ctx, "nope"); err == nil || !strings.Contains(err.Error(), "nothing named") {
		t.Errorf("unknown ref = %v", err)
	}
}

func TestMergeConflictIsAborted(t *testing.T) {
	r, dir, _ := repoPushed(t)
	sh(t, dir, "switch", "-qc", "other")
	write(t, dir, "a.txt", "from other\n")
	commitAll(t, dir, "other edit")
	sh(t, dir, "switch", "-q", "main")
	write(t, dir, "a.txt", "from main\n")
	commitAll(t, dir, "main edit")

	_, err := r.Merge(ctx, "other")
	if err == nil || !strings.Contains(err.Error(), "a.txt") || !strings.Contains(err.Error(), "undone") {
		t.Fatalf("conflict error = %v", err)
	}
	if st, _ := r.Status(ctx); len(st.Conflicts) != 0 || len(st.Staged) != 0 || len(st.Changes) != 0 {
		t.Errorf("an aborted merge must leave a clean tree: %+v", st)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "a.txt")); string(b) != "from main\n" {
		t.Errorf("a.txt = %q", b)
	}
}

func TestTagsAndRemoteBranchDelete(t *testing.T) {
	r, dir, remote := repoPushed(t)
	sh(t, dir, "tag", "-a", "v1", "-m", "Release 1")

	if _, err := r.PushTag(ctx, "v1"); err != nil {
		t.Fatal(err)
	}
	if got := sh(t, remote, "tag", "-l"); got != "v1" {
		t.Errorf("remote tags = %q", got)
	}
	if err := r.DeleteTag(ctx, "v1"); err != nil {
		t.Fatal(err)
	}
	if got := sh(t, dir, "tag", "-l"); got != "" {
		t.Errorf("local tags = %q", got)
	}

	sh(t, dir, "push", "-q", "origin", "main:old-feature")
	sh(t, dir, "fetch", "-q", "origin")
	if _, err := r.DeleteRemoteBranch(ctx, "origin/old-feature"); err != nil {
		t.Fatal(err)
	}
	if got := sh(t, remote, "branch", "--list", "old-feature"); got != "" {
		t.Errorf("remote still has the branch: %q", got)
	}
	if _, err := r.DeleteRemoteBranch(ctx, "origin/HEAD"); err == nil {
		t.Error("origin/HEAD is not a branch")
	}
}

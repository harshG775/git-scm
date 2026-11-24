package git

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// repoWithRemote returns a repo with one commit on main, pushed to a bare "origin", plus a
// second clone that can publish more branches there.
func repoWithRemote(t *testing.T) (r Repo, dir, other string) {
	t.Helper()
	r, dir = newRepo(t)
	remote := filepath.Join(t.TempDir(), "origin.git")
	sh(t, t.TempDir(), "init", "-q", "--bare", remote)
	sh(t, remote, "symbolic-ref", "HEAD", "refs/heads/main")
	sh(t, dir, "remote", "add", "origin", remote)
	write(t, dir, "a.txt", "1\n")
	commitAll(t, dir, "first")
	sh(t, dir, "push", "-qu", "origin", "main")

	other = filepath.Join(t.TempDir(), "other")
	sh(t, t.TempDir(), "clone", "-q", remote, other)
	return
}

func publish(t *testing.T, other, branch, file string) {
	t.Helper()
	sh(t, other, "switch", "-qc", branch)
	write(t, other, file, "from "+branch+"\n")
	sh(t, other, "add", "-A")
	sh(t, other, "commit", "-qm", "commit on "+branch)
	sh(t, other, "push", "-qu", "origin", branch)
	sh(t, other, "switch", "-q", "main")
}

func TestRemotesListAndFetch(t *testing.T) {
	r, dir, other := repoWithRemote(t)

	rl, err := r.Remotes(ctx)
	if err != nil || !rl.IsRepo || strings.Join(rl.Remotes, ",") != "origin" {
		t.Fatalf("remotes = %+v, %v", rl, err)
	}
	if len(rl.Branches) != 1 || rl.Branches[0].Ref != "origin/main" || !rl.Branches[0].HasLocal || rl.Branches[0].Name != "main" {
		t.Fatalf("branches = %+v (origin/HEAD must not be listed)", rl.Branches)
	}

	publish(t, other, "feature/new-ui", "ui.txt")
	if rl, _ := r.Remotes(ctx); len(rl.Branches) != 1 {
		t.Fatalf("before fetch the new branch must not be visible: %+v", rl.Branches)
	}
	if _, err := r.Fetch(ctx); err != nil {
		t.Fatal(err)
	}
	rl, _ = r.Remotes(ctx)
	var found *RemoteBranch
	for i := range rl.Branches {
		if rl.Branches[i].Name == "feature/new-ui" {
			found = &rl.Branches[i]
		}
	}
	if found == nil || found.Remote != "origin" || found.Ref != "origin/feature/new-ui" || found.HasLocal || found.Subject != "commit on feature/new-ui" {
		t.Fatalf("after fetch = %+v", rl.Branches)
	}

	// A branch deleted on the remote disappears after the next fetch (--prune).
	sh(t, other, "push", "-q", "origin", "--delete", "feature/new-ui")
	r.Fetch(ctx)
	if rl, _ := r.Remotes(ctx); len(rl.Branches) != 1 {
		t.Errorf("pruned branch still listed: %+v", rl.Branches)
	}
	_ = dir
}

func TestSwitchRemoteCreatesTrackingBranch(t *testing.T) {
	r, dir, other := repoWithRemote(t)
	publish(t, other, "feature/new-ui", "ui.txt")
	r.Fetch(ctx)

	if err := r.SwitchRemote(ctx, "origin/feature/new-ui"); err != nil {
		t.Fatal(err)
	}
	bl, _ := r.Branches(ctx)
	if bl.Head != "feature/new-ui" {
		t.Fatalf("head = %q", bl.Head)
	}
	if up := sh(t, dir, "rev-parse", "--abbrev-ref", "feature/new-ui@{upstream}"); up != "origin/feature/new-ui" {
		t.Errorf("upstream = %q", up)
	}
	if _, err := os.Stat(filepath.Join(dir, "ui.txt")); err != nil {
		t.Error("the branch's file was not checked out")
	}
	if rl, _ := r.Remotes(ctx); !hasLocal(rl, "feature/new-ui") {
		t.Error("HasLocal should now be true")
	}

	// A local branch of that name exists now: git refuses instead of clobbering it.
	sh(t, dir, "switch", "-q", "main")
	if err := r.SwitchRemote(ctx, "origin/feature/new-ui"); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Errorf("second checkout = %v, want git's 'already exists'", err)
	}
}

func hasLocal(rl RemoteList, name string) bool {
	for _, b := range rl.Branches {
		if b.Name == name {
			return b.HasLocal
		}
	}
	return false
}

func TestSwitchRemoteRejects(t *testing.T) {
	r, _, _ := repoWithRemote(t)
	for _, ref := range []string{"", "-x", "--detach", "origin/HEAD", "origin/ghost", "main", "ghost", "@{-1}"} {
		if err := r.SwitchRemote(ctx, ref); err == nil {
			t.Errorf("SwitchRemote(%q) succeeded", ref)
		}
	}
}

func TestRemotesNotARepoAndNoRemote(t *testing.T) {
	isolate(t)
	if rl, err := (Repo{Root: t.TempDir()}).Remotes(ctx); err != nil || rl.IsRepo {
		t.Errorf("not a repo = %+v, %v", rl, err)
	}
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "1")
	commitAll(t, dir, "init")
	if rl, err := r.Remotes(ctx); err != nil || !rl.IsRepo || len(rl.Remotes) != 0 || len(rl.Branches) != 0 {
		t.Errorf("no remote = %+v, %v", rl, err)
	}
}

func TestSplitRemoteLongestMatch(t *testing.T) {
	remotes := []string{"fork", "fork/team"}
	if r, n := splitRemote("fork/team/x/y", remotes); r != "fork/team" || n != "x/y" {
		t.Errorf("got %q %q", r, n)
	}
	if r, n := splitRemote("fork/x", remotes); r != "fork" || n != "x" {
		t.Errorf("got %q %q", r, n)
	}
}

// ---- stash ----

func stashRepo(t *testing.T) (Repo, string) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "base\n")
	commitAll(t, dir, "base")
	return r, dir
}

func TestStashPushListApplyPopDrop(t *testing.T) {
	r, dir := stashRepo(t)

	if err := r.StashPush(ctx, "", false); err == nil || !strings.Contains(err.Error(), "No local changes") {
		t.Fatalf("empty stash = %v, want an error (git exits 0 here, we must not)", err)
	}

	write(t, dir, "a.txt", "first edit\n")
	if err := r.StashPush(ctx, "my first stash", false); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "a.txt")); string(b) != "base\n" {
		t.Errorf("stash must restore a clean tree, a.txt = %q", b)
	}
	write(t, dir, "a.txt", "second edit\n")
	if err := r.StashPush(ctx, "", false); err != nil {
		t.Fatal(err)
	}

	sl, err := r.Stashes(ctx)
	if err != nil || !sl.IsRepo || len(sl.Stashes) != 2 {
		t.Fatalf("list = %+v, %v", sl, err)
	}
	newest, older := sl.Stashes[0], sl.Stashes[1]
	if newest.Index != 0 || older.Index != 1 || newest.Branch != "main" || older.Branch != "main" {
		t.Errorf("indexes/branches = %+v", sl.Stashes)
	}
	if older.Title != "my first stash" || older.Auto {
		t.Errorf("custom stash = %+v", older)
	}
	if newest.Title != "base" || !newest.Auto || newest.Time == 0 || len(newest.Oid) != 40 {
		t.Errorf("auto stash = %+v (title must be the base commit's summary, without the hash)", newest)
	}

	// apply keeps the stash
	if err := r.StashApply(ctx, older.Index, older.Oid); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "a.txt")); string(b) != "first edit\n" {
		t.Errorf("after apply a.txt = %q", b)
	}
	if sl, _ := r.Stashes(ctx); len(sl.Stashes) != 2 {
		t.Errorf("apply must keep the stash, have %d", len(sl.Stashes))
	}
	sh(t, dir, "checkout", "-q", "--", "a.txt")

	// pop removes it; drop removes the other
	if err := r.StashPop(ctx, older.Index, older.Oid); err != nil {
		t.Fatal(err)
	}
	if sl, _ := r.Stashes(ctx); len(sl.Stashes) != 1 || sl.Stashes[0].Oid != newest.Oid {
		t.Errorf("after pop = %+v", sl.Stashes)
	}
	sh(t, dir, "checkout", "-q", "--", "a.txt")
	if err := r.StashDrop(ctx, 0, newest.Oid); err != nil {
		t.Fatal(err)
	}
	if sl, _ := r.Stashes(ctx); len(sl.Stashes) != 0 {
		t.Errorf("after drop = %+v", sl.Stashes)
	}
}

// The core safety property: a stale list must never act on the wrong stash.
func TestStashActionsRefuseStaleIndex(t *testing.T) {
	r, dir := stashRepo(t)
	write(t, dir, "a.txt", "one\n")
	r.StashPush(ctx, "one", false)
	write(t, dir, "a.txt", "two\n")
	r.StashPush(ctx, "two", false)

	sl, _ := r.Stashes(ctx)
	viewedTwo := sl.Stashes[0] // the user sees "two" at index 0 ...

	write(t, dir, "a.txt", "three\n") // ... then another stash is made elsewhere, shifting every index
	r.StashPush(ctx, "three", false)

	for name, op := range map[string]func() error{
		"drop":  func() error { return r.StashDrop(ctx, viewedTwo.Index, viewedTwo.Oid) },
		"pop":   func() error { return r.StashPop(ctx, viewedTwo.Index, viewedTwo.Oid) },
		"apply": func() error { return r.StashApply(ctx, viewedTwo.Index, viewedTwo.Oid) },
	} {
		if err := op(); err == nil || !strings.Contains(err.Error(), "list changed") {
			t.Errorf("%s on a stale index = %v, want a refusal", name, err)
		}
	}
	if sl, _ := r.Stashes(ctx); len(sl.Stashes) != 3 {
		t.Errorf("a refused action must change nothing, have %d stashes", len(sl.Stashes))
	}
	// Out of range and empty ids are refused too.
	if err := r.StashDrop(ctx, 9, viewedTwo.Oid); err == nil {
		t.Error("out-of-range index accepted")
	}
	if err := r.StashDrop(ctx, 0, ""); err == nil {
		t.Error("empty oid accepted")
	}
}

func TestStashConflictKeepsTheStash(t *testing.T) {
	r, dir := stashRepo(t)
	write(t, dir, "a.txt", "stashed change\n")
	r.StashPush(ctx, "", false)
	write(t, dir, "a.txt", "conflicting change\n")
	commitAll(t, dir, "diverge")

	sl, _ := r.Stashes(ctx)
	err := r.StashPop(ctx, 0, sl.Stashes[0].Oid)
	if err == nil || !strings.Contains(strings.ToUpper(err.Error()), "CONFLICT") {
		t.Fatalf("pop = %v, want git's conflict message", err)
	}
	if sl, _ := r.Stashes(ctx); len(sl.Stashes) != 1 {
		t.Errorf("a conflicted pop must keep the stash, have %d", len(sl.Stashes))
	}
}

func TestStashIncludeUntracked(t *testing.T) {
	r, dir := stashRepo(t)
	write(t, dir, "new.txt", "untracked\n")

	if err := r.StashPush(ctx, "", false); err == nil {
		t.Error("untracked-only changes are not stashed by default (git reports nothing to save)")
	}
	if err := r.StashPush(ctx, "with new file", true); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "new.txt")); err == nil {
		t.Error("the untracked file should have been stashed away")
	}
	sl, _ := r.Stashes(ctx)
	if err := r.StashPop(ctx, 0, sl.Stashes[0].Oid); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "new.txt")); string(b) != "untracked\n" {
		t.Errorf("restored new.txt = %q", b)
	}
}

func TestStashMessageIsNeverAFlag(t *testing.T) {
	r, dir := stashRepo(t)
	write(t, dir, "a.txt", "x\n")
	if err := r.StashPush(ctx, "--include-untracked -p", false); err != nil {
		t.Fatalf("a message that looks like flags must be taken literally: %v", err)
	}
	if sl, _ := r.Stashes(ctx); len(sl.Stashes) != 1 || sl.Stashes[0].Title != "--include-untracked -p" {
		t.Errorf("stashes = %+v", sl.Stashes)
	}
}

func TestStashesNotARepo(t *testing.T) {
	isolate(t)
	if sl, err := (Repo{Root: t.TempDir()}).Stashes(ctx); err != nil || sl.IsRepo || len(sl.Stashes) != 0 {
		t.Errorf("= %+v, %v", sl, err)
	}
}

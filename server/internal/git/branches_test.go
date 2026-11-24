package git

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func names(bs []Branch) string {
	var s []string
	for _, b := range bs {
		n := b.Name
		if b.Current {
			n += "*"
		}
		s = append(s, n)
	}
	return strings.Join(s, " ")
}

func TestBranchesListAndOrder(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "1")
	commitAll(t, dir, "first commit")
	sh(t, dir, "branch", "old")
	time.Sleep(1100 * time.Millisecond) // commit dates have one-second resolution
	sh(t, dir, "switch", "-qc", "feature/x")
	write(t, dir, "a.txt", "2")
	commitAll(t, dir, "work on x")
	sh(t, dir, "switch", "-q", "main")

	bl, err := r.Branches(ctx)
	if err != nil || !bl.IsRepo || bl.Head != "main" || bl.Detached {
		t.Fatalf("list = %+v, %v", bl, err)
	}
	// Current first, then most recently committed (feature/x) before the older one.
	if got := names(bl.Branches); got != "main* feature/x old" {
		t.Errorf("order = %s", got)
	}
	if b := bl.Branches[1]; b.Subject != "work on x" || b.Oid == "" {
		t.Errorf("feature/x = %+v", b)
	}
}

func TestBranchesEdgeStates(t *testing.T) {
	isolate(t)
	if bl, err := (Repo{Root: t.TempDir()}).Branches(ctx); err != nil || bl.IsRepo {
		t.Errorf("not a repo = %+v, %v", bl, err)
	}

	r, dir := newRepo(t) // no commits yet: HEAD names a branch that has no ref
	bl, err := r.Branches(ctx)
	if err != nil || !bl.IsRepo || bl.Head != "main" || len(bl.Branches) != 0 {
		t.Errorf("unborn = %+v, %v", bl, err)
	}

	write(t, dir, "a.txt", "1")
	commitAll(t, dir, "init")
	sh(t, dir, "checkout", "-q", "--detach")
	bl, _ = r.Branches(ctx)
	if !bl.Detached || bl.Head != "" || names(bl.Branches) != "main" {
		t.Errorf("detached = %+v", bl)
	}
}

func TestCreateBranch(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "1")
	commitAll(t, dir, "init")

	if err := r.CreateBranch(ctx, "feature/login"); err != nil {
		t.Fatal(err)
	}
	if bl, _ := r.Branches(ctx); bl.Head != "feature/login" || names(bl.Branches) != "feature/login* main" {
		t.Errorf("after create = %+v", bl)
	}

	if err := r.CreateBranch(ctx, "main"); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Errorf("duplicate = %v, want git's 'already exists'", err)
	}
	for _, bad := range []string{"", "-x", "--detach", "has space", "a..b", "a~1", "x.lock", "@{-1}", "/lead", "trail/", "a b"} {
		if err := r.CreateBranch(ctx, bad); err == nil || !strings.Contains(err.Error(), "not a valid branch name") {
			t.Errorf("CreateBranch(%q) = %v, want invalid-name error", bad, err)
		}
	}
	if bl, _ := r.Branches(ctx); len(bl.Branches) != 2 {
		t.Errorf("a rejected name must not create anything: %s", names(bl.Branches))
	}
}

func TestCreateBranchBeforeFirstCommit(t *testing.T) {
	r, _ := newRepo(t)
	if err := r.CreateBranch(ctx, "develop"); err != nil {
		t.Fatalf("on an unborn branch: %v", err)
	}
	if bl, _ := r.Branches(ctx); bl.Head != "develop" {
		t.Errorf("head = %q", bl.Head)
	}
}

func TestSwitchBranch(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "main version\n")
	commitAll(t, dir, "init")
	sh(t, dir, "switch", "-qc", "other")
	write(t, dir, "a.txt", "other version\n")
	commitAll(t, dir, "other change")
	sh(t, dir, "switch", "-q", "main")

	if err := r.SwitchBranch(ctx, "other"); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "a.txt")); string(b) != "other version\n" {
		t.Errorf("working tree = %q", b)
	}
	if err := r.SwitchBranch(ctx, "other"); err != nil {
		t.Errorf("switching to the current branch should be a no-op: %v", err)
	}

	// Uncommitted edit that the target branch would overwrite: git refuses and says so.
	write(t, dir, "a.txt", "my unsaved work\n")
	err := r.SwitchBranch(ctx, "main")
	if err == nil || !strings.Contains(err.Error(), "would be overwritten") {
		t.Errorf("dirty switch = %v, want git's own refusal", err)
	}
	if b, _ := os.ReadFile(filepath.Join(dir, "a.txt")); string(b) != "my unsaved work\n" {
		t.Errorf("a refused switch must not touch the file: %q", b)
	}
	if bl, _ := r.Branches(ctx); bl.Head != "other" {
		t.Errorf("head = %q after refused switch", bl.Head)
	}
}

func TestSwitchBranchRejectsNonBranches(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "1")
	commitAll(t, dir, "init")
	sh(t, dir, "tag", "v1")
	write(t, dir, "main", "a file that shares the branch's name\n")

	for _, name := range []string{"nope", "v1" /* a tag, not a branch */, "-", "--detach", "", "HEAD", "origin/main"} {
		if err := r.SwitchBranch(ctx, name); err == nil {
			t.Errorf("SwitchBranch(%q) succeeded, want an error", name)
		}
	}
	// A file named like the branch must not confuse switching to the branch.
	if err := r.SwitchBranch(ctx, "main"); err != nil {
		t.Errorf("switch main with a same-named file: %v", err)
	}
}

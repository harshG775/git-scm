package git

import (
	"strings"
	"testing"
	"time"
)

func oids(cs []Commit) []string {
	var s []string
	for _, c := range cs {
		s = append(s, c.Subject)
	}
	return s
}

func refNames(c Commit) string {
	var s []string
	for _, r := range c.Refs {
		n := r.Kind[:1] + ":" + r.Name
		if r.Current {
			n += "*"
		}
		s = append(s, n)
	}
	return strings.Join(s, " ")
}

func commit(t *testing.T, dir, file, msg string) {
	t.Helper()
	write(t, dir, file, msg+"\n")
	commitAll(t, dir, msg)
}

func TestLogLinearHistory(t *testing.T) {
	r, dir := newRepo(t)
	commit(t, dir, "a.txt", "first")
	commit(t, dir, "b.txt", "second")
	commit(t, dir, "c.txt", "third")
	sh(t, dir, "tag", "v1")

	l, err := r.Log(ctx, ScopeLocal, 100)
	if err != nil || !l.IsRepo || l.HasMore {
		t.Fatalf("log = %+v, %v", l, err)
	}
	if got := strings.Join(oids(l.Commits), ","); got != "third,second,first" {
		t.Errorf("order = %s", got)
	}
	head := l.Commits[0]
	if l.Head != head.Oid || l.HeadBranch != "main" || l.Detached {
		t.Errorf("head = %q branch %q", l.Head, l.HeadBranch)
	}
	if len(l.Commits[2].Parents) != 0 || len(head.Parents) != 1 || head.Parents[0] != l.Commits[1].Oid {
		t.Errorf("parents wrong: root %v head %v", l.Commits[2].Parents, head.Parents)
	}
	if head.Author != "Test" || head.Email != "test@example.com" || head.Time == 0 || len(head.Oid) != 40 {
		t.Errorf("fields = %+v", head)
	}
	// Tags are decorations in the "all" scope only... but a tag on a commit that is shown still decorates it only when asked for.
	l, _ = r.Log(ctx, ScopeAll, 100)
	if got := refNames(l.Commits[0]); got != "b:main* t:v1" {
		t.Errorf("refs = %q", got)
	}
}

func TestLogMergeHasTwoParents(t *testing.T) {
	r, dir := newRepo(t)
	commit(t, dir, "a.txt", "base")
	sh(t, dir, "switch", "-qc", "feature")
	commit(t, dir, "f.txt", "feature work")
	sh(t, dir, "switch", "-q", "main")
	commit(t, dir, "m.txt", "main work")
	sh(t, dir, "merge", "-q", "--no-ff", "-m", "merge feature", "feature")

	l, _ := r.Log(ctx, ScopeLocal, 100)
	if len(l.Commits) != 4 {
		t.Fatalf("commits = %v", oids(l.Commits))
	}
	m := l.Commits[0]
	if m.Subject != "merge feature" || len(m.Parents) != 2 {
		t.Fatalf("merge = %+v", m)
	}
	// parent order matters: first parent is the branch merged INTO
	if first := commitBySubject(l, "main work"); m.Parents[0] != first.Oid {
		t.Errorf("first parent should be 'main work'")
	}
	if second := commitBySubject(l, "feature work"); m.Parents[1] != second.Oid {
		t.Errorf("second parent should be 'feature work'")
	}
	// Topological guarantee the graph layout relies on: a commit never appears before its children.
	pos := map[string]int{}
	for i, c := range l.Commits {
		pos[c.Oid] = i
	}
	for i, c := range l.Commits {
		for _, p := range c.Parents {
			if pp, ok := pos[p]; ok && pp < i {
				t.Errorf("parent %s is listed before its child %s", p[:7], c.Subject)
			}
		}
	}
}

func commitBySubject(l Log, subject string) Commit {
	for _, c := range l.Commits {
		if c.Subject == subject {
			return c
		}
	}
	return Commit{}
}

func TestLogScopeAndDecorations(t *testing.T) {
	r, dir, other := repoWithRemote(t)
	publish(t, other, "feature/remote-only", "r.txt")
	r.Fetch(ctx)
	sh(t, dir, "tag", "-a", "v2", "-m", "annotated")

	local, _ := r.Log(ctx, ScopeLocal, 100)
	if len(local.Commits) != 1 {
		t.Errorf("local scope shows only local branches' history: %v", oids(local.Commits))
	}
	// A remote ref on a shown commit still decorates it.
	if got := refNames(local.Commits[0]); got != "b:main* r:origin/main t:v2" {
		t.Errorf("local-scope decorations = %q (annotated tag must resolve to its commit)", got)
	}

	all, _ := r.Log(ctx, ScopeAll, 100)
	if got := strings.Join(oids(all.Commits), ","); got != "commit on feature/remote-only,first" {
		t.Errorf("all scope = %s", got)
	}
	if got := refNames(all.Commits[0]); got != "r:origin/feature/remote-only" {
		t.Errorf("remote-only tip = %q", got)
	}
	for _, c := range all.Commits {
		for _, ref := range c.Refs {
			if strings.HasSuffix(ref.Name, "/HEAD") {
				t.Errorf("origin/HEAD must not be a decoration: %+v", ref)
			}
		}
	}
}

func TestLogCurrentBranchScope(t *testing.T) {
	r, dir := newRepo(t)
	commit(t, dir, "base.txt", "base")
	sh(t, dir, "switch", "-qc", "feature")
	commit(t, dir, "feature.txt", "feature only")
	sh(t, dir, "switch", "-q", "main")
	commit(t, dir, "main.txt", "main only")

	current, err := r.Log(ctx, ScopeCurrent, 100)
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(oids(current.Commits), ","); got != "main only,base" {
		t.Errorf("current branch scope = %s", got)
	}
	local, err := r.Log(ctx, ScopeLocal, 100)
	if err != nil {
		t.Fatal(err)
	}
	subjects := map[string]bool{}
	for _, subject := range oids(local.Commits) {
		subjects[subject] = true
	}
	if len(subjects) != 3 || !subjects["main only"] || !subjects["feature only"] || !subjects["base"] {
		t.Errorf("local scope = %v", oids(local.Commits))
	}
}

func TestLogLimitAndHasMore(t *testing.T) {
	r, dir := newRepo(t)
	for _, m := range []string{"c1", "c2", "c3", "c4", "c5"} {
		commit(t, dir, "f.txt", m)
		time.Sleep(10 * time.Millisecond)
	}
	l, _ := r.Log(ctx, ScopeLocal, 3)
	if len(l.Commits) != 3 || !l.HasMore || l.Commits[0].Subject != "c5" {
		t.Errorf("limit 3 = %v more=%v", oids(l.Commits), l.HasMore)
	}
	l, _ = r.Log(ctx, ScopeLocal, 5)
	if len(l.Commits) != 5 || l.HasMore {
		t.Errorf("limit 5 = %d more=%v (exactly fits: nothing more)", len(l.Commits), l.HasMore)
	}
	l, _ = r.Log(ctx, ScopeLocal, 0) // defaults
	if len(l.Commits) != 5 {
		t.Errorf("default limit = %d", len(l.Commits))
	}
}

func TestLogBodyAndMultilineMessage(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "x")
	sh(t, dir, "add", "-A")
	sh(t, dir, "commit", "-q", "-m", "subject line", "-m", "first paragraph\nstill first\n\nsecond paragraph")
	commit(t, dir, "b.txt", "next")
	l, _ := r.Log(ctx, ScopeLocal, 10)
	c := commitBySubject(l, "subject line")
	if c.Body != "first paragraph\nstill first\n\nsecond paragraph" {
		t.Errorf("body = %q", c.Body)
	}
	if len(l.Commits) != 2 {
		t.Errorf("a multi-line message must not split the record: %v", oids(l.Commits))
	}
}

func TestLogUncommittedStashesAndEdgeStates(t *testing.T) {
	isolate(t)
	if l, err := (Repo{Root: t.TempDir()}).Log(ctx, ScopeLocal, 10); err != nil || l.IsRepo {
		t.Errorf("not a repo = %+v, %v", l, err)
	}

	r, dir := newRepo(t) // no commits yet
	write(t, dir, "new.txt", "u")
	l, err := r.Log(ctx, ScopeLocal, 10)
	if err != nil || !l.IsRepo || len(l.Commits) != 0 || l.Head != "" || l.Uncommitted != 1 {
		t.Errorf("unborn = %+v, %v", l, err)
	}

	commit(t, dir, "a.txt", "base")
	write(t, dir, "a.txt", "edit")
	sh(t, dir, "stash", "push", "-q", "-m", "wip")
	write(t, dir, "a.txt", "again")
	sh(t, dir, "add", "a.txt")
	write(t, dir, "a.txt", "and more") // staged + unstaged on the same file counts once
	write(t, dir, "z.txt", "untracked")
	l, _ = r.Log(ctx, ScopeLocal, 10)
	if l.Uncommitted != 2 {
		t.Errorf("uncommitted = %d, want 2 (a.txt once, z.txt)", l.Uncommitted)
	}
	if len(l.Stashes) != 1 || l.Stashes[0].Base != l.Head {
		t.Errorf("stash base = %+v, want HEAD %s", l.Stashes, l.Head)
	}

	sh(t, dir, "reset", "-q", "--hard")
	sh(t, dir, "clean", "-fdq")
	sh(t, dir, "checkout", "-q", "--detach")
	if l, _ = r.Log(ctx, ScopeLocal, 10); !l.Detached || l.HeadBranch != "(detached)" || len(l.Commits) == 0 {
		t.Errorf("detached = %+v", l)
	}
}

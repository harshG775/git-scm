package api

import (
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/git-csm/server/internal/git"
)

func gitEnv(t *testing.T) *env {
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

	e := newEnv(t)
	os.RemoveAll(filepath.Join(e.root, ".git")) // newEnv leaves an empty .git directory
	g := func(args ...string) {
		if out, err := exec.Command("git", append([]string{"-C", e.root}, args...)...).CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	g("init", "-q")
	g("symbolic-ref", "HEAD", "refs/heads/main")
	g("add", "-A")
	g("commit", "-qm", "init")
	return e
}

func (e *env) status() git.Status {
	e.t.Helper()
	var st git.Status
	res := e.do("GET", e.p("/git/status"), "", nil)
	if res.StatusCode != 200 {
		e.t.Fatalf("status = %d", res.StatusCode)
	}
	json.NewDecoder(res.Body).Decode(&st)
	return st
}

func (e *env) post(path, body string) (int, string) {
	e.t.Helper()
	res := e.do("POST", e.p(path), body, nil)
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, string(b)
}

func names(cs []git.Change) string {
	var s []string
	for _, c := range cs {
		s = append(s, c.Status+" "+c.Path)
	}
	return strings.Join(s, ",")
}

func TestGitWorkflowOverHTTP(t *testing.T) {
	e := gitEnv(t)
	if st := e.status(); !st.IsRepo || st.Branch != "main" || len(st.Changes) != 0 {
		t.Fatalf("clean status = %+v", st)
	}

	os.WriteFile(filepath.Join(e.root, "src", "a.txt"), []byte("hello world"), 0o644)
	os.WriteFile(filepath.Join(e.root, "fresh.txt"), []byte("new"), 0o644)
	if got := names(e.status().Changes); got != "U fresh.txt,M src/a.txt" {
		t.Fatalf("changes = %s", got)
	}

	if c, body := e.post("/git/stage", `{"paths":["src/a.txt","fresh.txt"]}`); c != 204 {
		t.Fatalf("stage = %d %s", c, body)
	}
	st := e.status()
	if names(st.Staged) != "A fresh.txt,M src/a.txt" || len(st.Changes) != 0 {
		t.Fatalf("after stage = %+v", st)
	}

	// Diff of a staged file, then of a clean one (empty).
	res := e.do("GET", e.p("/git/diff?path=src/a.txt&staged=1"), "", nil)
	if b, _ := io.ReadAll(res.Body); !strings.Contains(string(b), "+hello world") || !strings.HasPrefix(res.Header.Get("Content-Type"), "text/plain") {
		t.Errorf("staged diff = %q (%s)", b, res.Header.Get("Content-Type"))
	}

	if c, _ := e.post("/git/unstage", `{"paths":["fresh.txt"]}`); c != 204 {
		t.Fatalf("unstage = %d", c)
	}
	if c, _ := e.post("/git/discard", `{"paths":["fresh.txt"]}`); c != 204 {
		t.Fatalf("discard = %d", c)
	}
	if _, err := os.Stat(filepath.Join(e.root, "fresh.txt")); err == nil {
		t.Error("discarding an untracked file should delete it")
	}

	c, body := e.post("/git/commit", `{"message":"update a"}`)
	if c != 200 || !strings.Contains(body, `"oid"`) {
		t.Fatalf("commit = %d %s", c, body)
	}
	if st := e.status(); len(st.Staged)+len(st.Changes) != 0 {
		t.Errorf("not clean after commit: %+v", st)
	}

	// Nothing left to commit: git's own message comes back as a 422.
	c, body = e.post("/git/commit", `{"message":"again"}`)
	if c != 422 || !strings.Contains(body, "nothing") {
		t.Errorf("empty commit = %d %s", c, body)
	}
}

func TestGitValidation(t *testing.T) {
	e := gitEnv(t)
	for path, body := range map[string]string{
		"/git/stage":   `{"paths":["../outside.txt"]}`,
		"/git/discard": `{"paths":["/etc/passwd"]}`,
		"/git/unstage": `{"paths":["escape/../../x"]}`,
	} {
		if c, _ := e.post(path, body); c != 403 {
			t.Errorf("%s with %s = %d, want 403", path, body, c)
		}
	}
	if c, _ := e.post("/git/stage", `{"paths":[]}`); c != 400 {
		t.Errorf("empty paths = %d", c)
	}
	if c, _ := e.post("/git/stage", `nope`); c != 400 {
		t.Errorf("bad json = %d", c)
	}
	if c, _ := e.post("/git/commit", `{"message":"   "}`); c != 400 {
		t.Errorf("blank message = %d", c)
	}
	if c := e.do("GET", e.p("/git/diff?path=../x"), "", nil).StatusCode; c != 403 {
		t.Errorf("diff escape = %d", c)
	}
	if c := e.do("GET", e.p("/git/diff"), "", nil).StatusCode; c != 400 {
		t.Errorf("diff without path = %d", c)
	}
	if c := e.do("GET", "/api/p/nope/git/status", "", nil).StatusCode; c != 404 {
		t.Errorf("unknown project = %d", c)
	}
}

func TestGitStatusOutsideRepo(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	t.Setenv("GIT_CEILING_DIRECTORIES", filepath.Dir(os.TempDir())) // never find a repo above /tmp
	e := newEnv(t)
	os.RemoveAll(filepath.Join(e.root, ".git"))
	if st := e.status(); st.IsRepo {
		t.Errorf("status = %+v, want isRepo false", st)
	}
}

// Rapid parallel stage requests must all succeed: the per-project lock keeps git's index.lock free.
func TestGitMutationsAreSerialized(t *testing.T) {
	e := gitEnv(t)
	for i := range 10 {
		os.WriteFile(filepath.Join(e.root, "f"+string(rune('a'+i))+".txt"), []byte("x"), 0o644)
	}
	var wg sync.WaitGroup
	codes := make([]int, 10)
	for i := range codes {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes[i], _ = e.post("/git/stage", `{"paths":["f`+string(rune('a'+i))+`.txt"]}`)
		}()
	}
	wg.Wait()
	for i, c := range codes {
		if c != 204 {
			t.Errorf("request %d = %d", i, c)
		}
	}
	if n := len(e.status().Staged); n != 10 {
		t.Errorf("staged %d files, want 10", n)
	}
}

type branchList struct {
	IsRepo   bool   `json:"isRepo"`
	Head     string `json:"head"`
	Detached bool   `json:"detached"`
	Branches []struct {
		Name    string `json:"name"`
		Current bool   `json:"current"`
	} `json:"branches"`
}

func (e *env) branches() branchList {
	e.t.Helper()
	var bl branchList
	res := e.do("GET", e.p("/git/branches"), "", nil)
	if res.StatusCode != 200 {
		e.t.Fatalf("branches = %d", res.StatusCode)
	}
	json.NewDecoder(res.Body).Decode(&bl)
	return bl
}

func TestBranchesOverHTTP(t *testing.T) {
	e := gitEnv(t)
	if bl := e.branches(); !bl.IsRepo || bl.Head != "main" || len(bl.Branches) != 1 || !bl.Branches[0].Current {
		t.Fatalf("initial = %+v", bl)
	}

	if c, body := e.post("/git/branches", `{"name":"feature/ui"}`); c != 204 {
		t.Fatalf("create = %d %s", c, body)
	}
	if bl := e.branches(); bl.Head != "feature/ui" || len(bl.Branches) != 2 {
		t.Fatalf("after create = %+v", bl)
	}
	if st := e.status(); st.Branch != "feature/ui" {
		t.Errorf("status branch = %q", st.Branch)
	}

	if c, body := e.post("/git/checkout", `{"name":"main"}`); c != 204 {
		t.Fatalf("checkout = %d %s", c, body)
	}
	if bl := e.branches(); bl.Head != "main" {
		t.Errorf("after checkout head = %q", bl.Head)
	}

	// git's own messages come back as 422, and a refused request changes nothing.
	if c, body := e.post("/git/branches", `{"name":"main"}`); c != 422 || !strings.Contains(body, "already exists") {
		t.Errorf("duplicate = %d %s", c, body)
	}
	if c, body := e.post("/git/branches", `{"name":"bad name"}`); c != 422 || !strings.Contains(body, "not a valid branch name") {
		t.Errorf("invalid = %d %s", c, body)
	}
	if c, body := e.post("/git/checkout", `{"name":"ghost"}`); c != 422 || !strings.Contains(body, "no local branch") {
		t.Errorf("unknown = %d %s", c, body)
	}
	if c, _ := e.post("/git/checkout", `{"name":"   "}`); c != 400 {
		t.Errorf("blank = %d", c)
	}
	if c, _ := e.post("/git/branches", `nope`); c != 400 {
		t.Errorf("bad json = %d", c)
	}
	if bl := e.branches(); bl.Head != "main" || len(bl.Branches) != 2 {
		t.Errorf("rejected requests changed state: %+v", bl)
	}
}

func TestTagsOverHTTP(t *testing.T) {
	e := gitEnv(t)
	e.sh("tag", "v1.0.0")

	status, body := e.get("/git/tags")
	var tags git.TagList
	if status != 200 {
		t.Fatalf("tags = %d %s", status, body)
	}
	if err := json.Unmarshal([]byte(body), &tags); err != nil {
		t.Fatal(err)
	}
	if !tags.IsRepo || len(tags.Tags) != 1 || tags.Tags[0].Name != "v1.0.0" {
		t.Fatalf("tags = %+v", tags)
	}
}

func TestBranchesOutsideRepo(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	t.Setenv("GIT_CEILING_DIRECTORIES", filepath.Dir(os.TempDir()))
	e := newEnv(t)
	os.RemoveAll(filepath.Join(e.root, ".git"))
	if bl := e.branches(); bl.IsRepo || len(bl.Branches) != 0 {
		t.Errorf("not a repo = %+v", bl)
	}
}

// Branch switches and the git poller must agree: switching must show up as a "git" event.
func TestBranchSwitchEmitsGitEvent(t *testing.T) {
	e := gitEnv(t)
	s := e.subscribe("c1")
	s.expectQuiet(150 * time.Millisecond)
	e.post("/git/branches", `{"name":"topic"}`)
	if ev := s.next(2 * time.Second); ev[0] != "git" {
		t.Errorf("event = %v, want git", ev)
	}
}

func (e *env) sh(args ...string) string {
	e.t.Helper()
	out, err := exec.Command("git", append([]string{"-C", e.root}, args...)...).CombinedOutput()
	if err != nil {
		e.t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func (e *env) get(path string) (int, string) {
	e.t.Helper()
	res := e.do("GET", e.p(path), "", nil)
	b, _ := io.ReadAll(res.Body)
	return res.StatusCode, string(b)
}

type stashList struct {
	IsRepo  bool `json:"isRepo"`
	Stashes []struct {
		Index int    `json:"index"`
		Oid   string `json:"oid"`
		Title string `json:"title"`
		Auto  bool   `json:"auto"`
	} `json:"stashes"`
}

func (e *env) stashes() stashList {
	e.t.Helper()
	var sl stashList
	_, body := e.get("/git/stashes")
	json.Unmarshal([]byte(body), &sl)
	return sl
}

func TestStashOverHTTP(t *testing.T) {
	e := gitEnv(t)
	if sl := e.stashes(); !sl.IsRepo || len(sl.Stashes) != 0 {
		t.Fatalf("initial = %+v", sl)
	}
	if c, body := e.post("/git/stash", `{"message":"x"}`); c != 422 || !strings.Contains(body, "No local changes") {
		t.Errorf("nothing to stash = %d %s", c, body)
	}

	path := filepath.Join(e.root, "src", "a.txt")
	os.WriteFile(path, []byte("work in progress"), 0o644)
	if c, body := e.post("/git/stash", `{"message":"half done"}`); c != 204 {
		t.Fatalf("stash = %d %s", c, body)
	}
	if b, _ := os.ReadFile(path); string(b) != "hello" {
		t.Errorf("tree should be clean again, a.txt = %q", b)
	}
	sl := e.stashes()
	if len(sl.Stashes) != 1 || sl.Stashes[0].Title != "half done" || sl.Stashes[0].Auto {
		t.Fatalf("list = %+v", sl)
	}
	s := sl.Stashes[0]
	body := func(index int, oid string) string {
		b, _ := json.Marshal(map[string]any{"index": index, "oid": oid})
		return string(b)
	}

	if c, _ := e.post("/git/stash/apply", body(s.Index, s.Oid)); c != 204 {
		t.Fatalf("apply = %d", c)
	}
	if b, _ := os.ReadFile(path); string(b) != "work in progress" {
		t.Errorf("after apply = %q", b)
	}
	e.sh("checkout", "-q", "--", "src/a.txt")

	if c, b := e.post("/git/stash/drop", body(s.Index, "0000000000000000000000000000000000000000")); c != 422 || !strings.Contains(b, "list changed") {
		t.Errorf("wrong oid = %d %s", c, b)
	}
	if c, _ := e.post("/git/stash/pop", `{"index":0}`); c != 400 {
		t.Errorf("missing oid = %d", c)
	}
	if c, _ := e.post("/git/stash/pop", `{"oid":"abc"}`); c != 400 {
		t.Errorf("missing index = %d", c)
	}
	if c, _ := e.post("/git/stash/pop", body(-1, s.Oid)); c != 400 {
		t.Errorf("negative index = %d", c)
	}
	if n := len(e.stashes().Stashes); n != 1 {
		t.Fatalf("refused requests changed the stash list: %d", n)
	}

	if c, _ := e.post("/git/stash/drop", body(s.Index, s.Oid)); c != 204 {
		t.Errorf("drop = %d", c)
	}
	if n := len(e.stashes().Stashes); n != 0 {
		t.Errorf("after drop = %d stashes", n)
	}
}

func TestRemotesOverHTTP(t *testing.T) {
	e := gitEnv(t)
	remote := filepath.Join(t.TempDir(), "origin.git")
	if out, err := exec.Command("git", "init", "-q", "--bare", remote).CombinedOutput(); err != nil {
		t.Fatalf("%v %s", err, out)
	}
	exec.Command("git", "-C", remote, "symbolic-ref", "HEAD", "refs/heads/main").Run()
	e.sh("remote", "add", "origin", remote)
	e.sh("push", "-qu", "origin", "main")

	type rl struct {
		IsRepo   bool     `json:"isRepo"`
		Remotes  []string `json:"remotes"`
		Branches []struct {
			Ref      string `json:"ref"`
			HasLocal bool   `json:"hasLocal"`
		} `json:"branches"`
	}
	var list rl
	_, body := e.get("/git/remotes")
	json.Unmarshal([]byte(body), &list)
	if !list.IsRepo || len(list.Remotes) != 1 || len(list.Branches) != 1 || list.Branches[0].Ref != "origin/main" || !list.Branches[0].HasLocal {
		t.Fatalf("remotes = %s", body)
	}

	// Publish another branch from a second clone, fetch, check it out as a local tracking branch.
	other := filepath.Join(t.TempDir(), "other")
	exec.Command("git", "clone", "-q", remote, other).Run()
	for _, args := range [][]string{{"switch", "-qc", "topic"}, {"commit", "-q", "--allow-empty", "-m", "topic work"}, {"push", "-qu", "origin", "topic"}} {
		if out, err := exec.Command("git", append([]string{"-C", other}, args...)...).CombinedOutput(); err != nil {
			t.Fatalf("%v: %v %s", args, err, out)
		}
	}
	if c, out := e.post("/git/fetch", ""); c != 200 || !strings.Contains(out, `"output"`) {
		t.Fatalf("fetch = %d %s", c, out)
	}
	if c, out := e.post("/git/checkout-remote", `{"name":"origin/topic"}`); c != 204 {
		t.Fatalf("checkout-remote = %d %s", c, out)
	}
	if bl := e.branches(); bl.Head != "topic" {
		t.Errorf("head = %q", bl.Head)
	}
	if c, out := e.post("/git/checkout-remote", `{"name":"origin/HEAD"}`); c != 422 {
		t.Errorf("origin/HEAD = %d %s", c, out)
	}
	if c, out := e.post("/git/checkout-remote", `{"name":"origin/ghost"}`); c != 422 || !strings.Contains(out, "no remote branch") {
		t.Errorf("unknown = %d %s", c, out)
	}
}

// Changes made outside the app (Termux, nvim) must reach the panels: the poller has to notice
// stash and branch changes even though `git status` itself does not change.
func TestOutsideStashAndBranchChangesEmitEvents(t *testing.T) {
	e := gitEnv(t)
	os.WriteFile(filepath.Join(e.root, "src", "a.txt"), []byte("edit"), 0o644)
	e.sh("stash", "push", "-q", "-m", "outside")

	s := e.subscribe("c1")
	s.expectQuiet(150 * time.Millisecond)

	e.sh("stash", "drop", "-q") // status output is identical before and after: only the stash list changed
	if ev := s.next(2 * time.Second); ev[0] != "git" {
		t.Errorf("stash drop event = %v, want git", ev)
	}
	e.sh("branch", "created-outside") // a new branch at HEAD: status output does not change either
	if ev := s.next(2 * time.Second); ev[0] != "git" {
		t.Errorf("branch create event = %v, want git", ev)
	}
}

func TestLogOverHTTP(t *testing.T) {
	e := gitEnv(t)
	os.WriteFile(filepath.Join(e.root, "src", "a.txt"), []byte("second"), 0o644)
	e.sh("commit", "-qam", "second commit")
	os.WriteFile(filepath.Join(e.root, "dirty.txt"), []byte("x"), 0o644)

	var l struct {
		IsRepo      bool `json:"isRepo"`
		Head        string
		HeadBranch  string `json:"headBranch"`
		Uncommitted int    `json:"uncommitted"`
		HasMore     bool   `json:"hasMore"`
		Commits     []struct {
			Oid     string   `json:"oid"`
			Parents []string `json:"parents"`
			Subject string   `json:"subject"`
			Refs    []struct {
				Name    string `json:"name"`
				Kind    string `json:"kind"`
				Current bool   `json:"current"`
			} `json:"refs"`
		} `json:"commits"`
	}
	c, body := e.get("/git/log?limit=50")
	if c != 200 {
		t.Fatalf("log = %d %s", c, body)
	}
	json.Unmarshal([]byte(body), &l)
	if !l.IsRepo || l.HeadBranch != "main" || l.Uncommitted != 1 || len(l.Commits) != 2 || l.HasMore {
		t.Fatalf("log = %s", body)
	}
	top := l.Commits[0]
	if top.Subject != "second commit" || len(top.Parents) != 1 || top.Parents[0] != l.Commits[1].Oid ||
		len(top.Refs) != 1 || top.Refs[0].Name != "main" || !top.Refs[0].Current {
		t.Errorf("top = %+v", top)
	}
	if c, _ := e.get("/git/log?limit=1"); c != 200 {
		t.Errorf("limit = %d", c)
	}
	_, body = e.get("/git/log?limit=1&scope=nonsense")
	if !strings.Contains(body, `"hasMore":true`) {
		t.Errorf("limit 1 of 2 must report hasMore: %s", body)
	}
	if c := e.do("GET", "/api/p/nope/git/log", "", nil).StatusCode; c != 404 {
		t.Errorf("unknown project = %d", c)
	}
}

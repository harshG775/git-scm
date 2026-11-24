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

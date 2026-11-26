package api

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/git-csm/server/internal/config"
	"github.com/git-csm/server/internal/watch"
)

type env struct {
	hub  *watch.Hub
	t    *testing.T
	srv  *httptest.Server
	root string
	id   string
}

func newEnv(t *testing.T) *env {
	t.Helper()
	store, err := config.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	hub := watch.New(30 * time.Millisecond)
	mux := http.NewServeMux()
	Register(mux, store, hub)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	t.Cleanup(hub.Close) // runs first (LIFO): ends open event streams so srv.Close can return

	root := t.TempDir()
	os.MkdirAll(filepath.Join(root, "src"), 0o755)
	os.MkdirAll(filepath.Join(root, ".git"), 0o755)
	os.WriteFile(filepath.Join(root, "src", "a.txt"), []byte("hello"), 0o644)
	os.WriteFile(filepath.Join(root, "b.txt"), []byte("b"), 0o644)
	os.WriteFile(filepath.Join(root, "bin.dat"), []byte{1, 0, 2}, 0o644)

	e := &env{t: t, srv: srv, root: root, hub: hub}
	var p config.Project
	res := e.do("POST", "/api/projects", `{"path":"`+root+`"}`, nil)
	json.NewDecoder(res.Body).Decode(&p)
	e.id = p.ID
	return e
}

func (e *env) do(method, path, body string, hdr map[string]string) *http.Response {
	e.t.Helper()
	req, _ := http.NewRequest(method, e.srv.URL+path, strings.NewReader(body))
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	return res
}

func (e *env) p(suffix string) string { return "/api/p/" + e.id + suffix }

func TestProjects(t *testing.T) {
	e := newEnv(t)
	if e.id == "" {
		t.Fatal("no project id")
	}
	var list []config.Project
	json.NewDecoder(e.do("GET", "/api/projects", "", nil).Body).Decode(&list)
	if len(list) != 1 || list[0].Path != e.root {
		t.Fatalf("list = %+v", list)
	}
	if c := e.do("POST", "/api/projects", `{"path":"/nope/nope"}`, nil).StatusCode; c != 404 {
		t.Errorf("missing dir = %d", c)
	}
	if c := e.do("POST", "/api/projects", `{}`, nil).StatusCode; c != 400 {
		t.Errorf("empty body = %d", c)
	}
}

func TestBrowseDirectories(t *testing.T) {
	home := filepath.Join(t.TempDir(), "home")
	shared := filepath.Join(t.TempDir(), "shared")
	outside := filepath.Join(t.TempDir(), "outside")
	for _, path := range []string{
		filepath.Join(home, "Projects", "sample"),
		filepath.Join(shared, "Documents", "vault"),
		outside,
	} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Join(home, "storage"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(shared, filepath.Join(home, "storage", "shared")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(home, "outside")); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)

	e := newEnv(t)
	var roots directoryListing
	res := e.do("GET", "/api/directories", "", nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("roots status = %d", res.StatusCode)
	}
	if err := json.NewDecoder(res.Body).Decode(&roots); err != nil {
		t.Fatal(err)
	}
	if len(roots.Directories) != 2 || roots.Directories[0].Name != "Home" || roots.Directories[1].Name != "Shared storage" {
		t.Fatalf("roots = %+v", roots.Directories)
	}

	var homeListing directoryListing
	res = e.do("GET", "/api/directories?path="+url.QueryEscape(home), "", nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("home status = %d", res.StatusCode)
	}
	if err := json.NewDecoder(res.Body).Decode(&homeListing); err != nil {
		t.Fatal(err)
	}
	for _, dir := range homeListing.Directories {
		if dir.Name == "outside" {
			t.Fatal("listed a symlink outside the browse roots")
		}
	}

	sharedRoot := filepath.Join(home, "storage", "shared")
	var sharedListing directoryListing
	res = e.do("GET", "/api/directories?path="+url.QueryEscape(sharedRoot), "", nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("shared root status = %d", res.StatusCode)
	}
	if err := json.NewDecoder(res.Body).Decode(&sharedListing); err != nil {
		t.Fatal(err)
	}
	if sharedListing.Parent != "" || len(sharedListing.Directories) != 1 ||
		sharedListing.Directories[0].Name != "Documents" {
		t.Fatalf("shared listing = %+v", sharedListing)
	}

	if status := e.do("GET", "/api/directories?path="+url.QueryEscape(outside), "", nil).StatusCode; status != http.StatusForbidden {
		t.Errorf("outside root status = %d", status)
	}
}

func TestTree(t *testing.T) {
	e := newEnv(t)
	var out struct {
		Entries []entry `json:"entries"`
	}
	json.NewDecoder(e.do("GET", e.p("/tree?path="), "", nil).Body).Decode(&out)
	var names []string
	for _, en := range out.Entries {
		names = append(names, en.Type+":"+en.Name)
	}
	if got := strings.Join(names, ","); got != "dir:src,file:b.txt,file:bin.dat" {
		t.Errorf("entries = %s (dirs first, .git hidden)", got)
	}
	if c := e.do("GET", e.p("/tree?path=../"), "", nil).StatusCode; c != 403 {
		t.Errorf("escape = %d", c)
	}
	if c := e.do("GET", "/api/p/nope/tree", "", nil).StatusCode; c != 404 {
		t.Errorf("unknown project = %d", c)
	}
}

func TestFileETagFlow(t *testing.T) {
	e := newEnv(t)
	url := e.p("/file?path=src/a.txt")

	res := e.do("GET", url, "", nil)
	body, _ := io.ReadAll(res.Body)
	tag := res.Header.Get("ETag")
	if string(body) != "hello" || tag == "" {
		t.Fatalf("read: %q etag=%q", body, tag)
	}

	if c := e.do("PUT", url, "x", nil).StatusCode; c != 428 {
		t.Errorf("no If-Match = %d, want 428", c)
	}
	if c := e.do("PUT", url, "x", map[string]string{"If-Match": `"bogus"`}).StatusCode; c != 412 {
		t.Errorf("stale If-Match = %d, want 412", c)
	}

	res = e.do("PUT", url, "updated", map[string]string{"If-Match": tag})
	if res.StatusCode != 204 {
		t.Fatalf("save = %d", res.StatusCode)
	}
	newTag := res.Header.Get("ETag")
	if newTag == "" || newTag == tag {
		t.Errorf("etag should change: %q -> %q", tag, newTag)
	}
	if b, _ := os.ReadFile(filepath.Join(e.root, "src", "a.txt")); string(b) != "updated" {
		t.Errorf("on disk = %q", b)
	}

	// External edit (nvim, etc.) makes the old ETag stale.
	os.WriteFile(filepath.Join(e.root, "src", "a.txt"), []byte("external edit!"), 0o644)
	if c := e.do("PUT", url, "mine", map[string]string{"If-Match": newTag}).StatusCode; c != 412 {
		t.Errorf("after external edit = %d, want 412", c)
	}
}

func TestFileCreateAndGuards(t *testing.T) {
	e := newEnv(t)
	if c := e.do("PUT", e.p("/file?path=src/new.txt"), "fresh", nil).StatusCode; c != 204 {
		t.Errorf("create = %d", c)
	}
	if b, _ := os.ReadFile(filepath.Join(e.root, "src", "new.txt")); string(b) != "fresh" {
		t.Errorf("created = %q", b)
	}
	if c := e.do("PUT", e.p("/file?path=../evil.txt"), "x", nil).StatusCode; c != 403 {
		t.Errorf("escape write = %d", c)
	}
	if c := e.do("PUT", e.p("/file?path=nodir/x.txt"), "x", nil).StatusCode; c != 404 {
		t.Errorf("missing parent = %d", c)
	}
	if c := e.do("GET", e.p("/file?path=bin.dat"), "", nil).StatusCode; c != 415 {
		t.Errorf("binary = %d", c)
	}
	if c := e.do("GET", e.p("/file?path=src"), "", nil).StatusCode; c != 400 {
		t.Errorf("dir as file = %d", c)
	}
	if c := e.do("GET", e.p("/file?path=missing.txt"), "", nil).StatusCode; c != 404 {
		t.Errorf("missing = %d", c)
	}
	// no leftover temp files
	des, _ := os.ReadDir(filepath.Join(e.root, "src"))
	for _, d := range des {
		if strings.HasPrefix(d.Name(), ".git-csm-") {
			t.Errorf("leftover temp file %s", d.Name())
		}
	}
}

// Same-size edits (and same mtime) must still be detected: the ETag is a content hash.
func TestETagIsContentBased(t *testing.T) {
	e := newEnv(t)
	url := e.p("/file?path=src/a.txt")
	tag := e.do("GET", url, "", nil).Header.Get("ETag")

	path := filepath.Join(e.root, "src", "a.txt")
	fi, _ := os.Stat(path)
	os.WriteFile(path, []byte("HELLO"), 0o644) // same length as "hello"
	os.Chtimes(path, fi.ModTime(), fi.ModTime())

	if c := e.do("PUT", url, "mine", map[string]string{"If-Match": tag}).StatusCode; c != 412 {
		t.Errorf("same-size edit = %d, want 412", c)
	}
}

// Two saves racing on the same ETag: exactly one wins.
func TestConcurrentSaves(t *testing.T) {
	e := newEnv(t)
	url := e.p("/file?path=src/a.txt")
	tag := e.do("GET", url, "", nil).Header.Get("ETag")

	var wg sync.WaitGroup
	codes := make([]int, 8)
	for i := range codes {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes[i] = e.do("PUT", url, "writer", map[string]string{"If-Match": tag}).StatusCode
		}()
	}
	wg.Wait()
	wins := 0
	for _, c := range codes {
		if c == 204 {
			wins++
		} else if c != 412 {
			t.Errorf("unexpected status %d", c)
		}
	}
	if wins != 1 {
		t.Errorf("%d saves succeeded, want exactly 1 (codes %v)", wins, codes)
	}
}

func TestRemoveProject(t *testing.T) {
	e := newEnv(t)
	if c := e.do("DELETE", "/api/projects/"+e.id, "", nil).StatusCode; c != 204 {
		t.Errorf("delete = %d", c)
	}
	if c := e.do("DELETE", "/api/projects/"+e.id, "", nil).StatusCode; c != 404 {
		t.Errorf("delete again = %d", c)
	}
	if c := e.do("GET", e.p("/tree"), "", nil).StatusCode; c != 404 {
		t.Errorf("tree after delete = %d", c)
	}
	if _, err := os.Stat(e.root); err != nil {
		t.Error("project directory must be left untouched")
	}
}

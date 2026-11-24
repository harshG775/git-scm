package api

import (
	"bufio"
	"context"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type stream struct {
	t      *testing.T
	events chan [2]string // {name, data}
}

// subscribe opens /events for a client id and waits for "ready".
func (e *env) subscribe(client string) *stream {
	e.t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	e.t.Cleanup(cancel)
	req, _ := http.NewRequestWithContext(ctx, "GET", e.srv.URL+e.p("/events?client="+client), nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		e.t.Fatal(err)
	}
	if res.StatusCode != 200 {
		e.t.Fatalf("events status %d", res.StatusCode)
	}
	s := &stream{t: e.t, events: make(chan [2]string, 64)}
	go func() {
		sc := bufio.NewScanner(res.Body)
		var name string
		for sc.Scan() {
			line := sc.Text()
			switch {
			case strings.HasPrefix(line, "event: "):
				name = strings.TrimPrefix(line, "event: ")
			case strings.HasPrefix(line, "data: "):
				s.events <- [2]string{name, strings.TrimPrefix(line, "data: ")}
			}
		}
		close(s.events)
	}()
	if got := s.next(2 * time.Second); got[0] != "ready" {
		e.t.Fatalf("first event = %v, want ready", got)
	}
	return s
}

func (s *stream) next(timeout time.Duration) [2]string {
	s.t.Helper()
	select {
	case ev, ok := <-s.events:
		if !ok {
			s.t.Fatal("stream closed")
		}
		return ev
	case <-time.After(timeout):
		s.t.Fatal("timed out waiting for event")
	}
	return [2]string{}
}

func (s *stream) expectQuiet(d time.Duration) {
	s.t.Helper()
	select {
	case ev := <-s.events:
		s.t.Fatalf("unexpected event %v", ev)
	case <-time.After(d):
	}
}

func (e *env) watch(client, body string) int {
	return e.do("PUT", e.p("/watch?client="+client), body, nil).StatusCode
}

func TestWatchFileEvent(t *testing.T) {
	e := newEnv(t)
	s := e.subscribe("c1")
	if c := e.watch("c1", `{"files":["src/a.txt"],"dirs":[]}`); c != 204 {
		t.Fatalf("watch = %d", c)
	}

	s.expectQuiet(200 * time.Millisecond) // nothing changed yet: the baseline must not fire

	os.WriteFile(filepath.Join(e.root, "b.txt"), []byte("unwatched change"), 0o644)
	s.expectQuiet(200 * time.Millisecond)

	os.WriteFile(filepath.Join(e.root, "src", "a.txt"), []byte("changed externally"), 0o644)
	if ev := s.next(2 * time.Second); ev[0] != "file" || ev[1] != `{"path":"src/a.txt"}` {
		t.Errorf("event = %v", ev)
	}
}

func TestWatchDirEvent(t *testing.T) {
	e := newEnv(t)
	s := e.subscribe("c1")
	e.watch("c1", `{"dirs":["src"],"files":[]}`)

	os.WriteFile(filepath.Join(e.root, "src", "new.go"), nil, 0o644)
	if ev := s.next(2 * time.Second); ev[0] != "dir" || ev[1] != `{"path":"src"}` {
		t.Errorf("event = %v", ev)
	}
	os.Remove(filepath.Join(e.root, "src", "new.go"))
	if ev := s.next(2 * time.Second); ev[0] != "dir" {
		t.Errorf("delete event = %v", ev)
	}
}

func TestGitEvent(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	e := newEnv(t)
	os.RemoveAll(filepath.Join(e.root, ".git")) // newEnv creates an empty .git dir
	run := func(args ...string) {
		cmd := exec.Command("git", append([]string{"-C", e.root}, args...)...)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	run("init", "-q")
	run("add", ".")
	run("-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "init")

	s := e.subscribe("c1") // no watch needed: git events go to every client
	s.expectQuiet(150 * time.Millisecond)

	os.WriteFile(filepath.Join(e.root, "b.txt"), []byte("edited"), 0o644)
	if ev := s.next(2 * time.Second); ev[0] != "git" {
		t.Errorf("event = %v", ev)
	}
	run("add", "b.txt")
	if ev := s.next(2 * time.Second); ev[0] != "git" {
		t.Errorf("stage event = %v", ev)
	}
	run("-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "edit")
	if ev := s.next(2 * time.Second); ev[0] != "git" {
		t.Errorf("commit event = %v", ev)
	}
}

func TestWatchGuards(t *testing.T) {
	e := newEnv(t)
	e.subscribe("c1")
	if c := e.watch("c1", `{"files":["../etc/passwd"]}`); c != 403 {
		t.Errorf("escape = %d, want 403", c)
	}
	if c := e.watch("nobody", `{"files":["b.txt"]}`); c != 404 {
		t.Errorf("unknown client = %d, want 404", c)
	}
	if c := e.watch("c1", `not json`); c != 400 {
		t.Errorf("bad body = %d, want 400", c)
	}
	if c := e.do("GET", e.p("/events"), "", nil).StatusCode; c != 400 {
		t.Errorf("missing client id = %d, want 400", c)
	}
}

func TestPollerStopsWithLastClient(t *testing.T) {
	e := newEnv(t)
	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", e.srv.URL+e.p("/events?client=c1"), nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	waitFor(t, func() bool { return e.hub.Pollers() == 1 })
	cancel()
	waitFor(t, func() bool { return e.hub.Pollers() == 0 })
}

func TestReconnectReplacesStream(t *testing.T) {
	e := newEnv(t)
	first := e.subscribe("c1")
	e.subscribe("c1") // same client id: the old stream must end
	deadline := time.After(2 * time.Second)
	for {
		select {
		case _, ok := <-first.events:
			if !ok {
				return
			}
		case <-deadline:
			t.Fatal("old stream was not closed")
		}
	}
}

func waitFor(t *testing.T, cond func() bool) {
	t.Helper()
	for i := 0; i < 100; i++ {
		if cond() {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("condition not met in time")
}

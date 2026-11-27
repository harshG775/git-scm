// Package watch detects changes made outside the app (nvim, file manager, git in Termux) by
// polling, and fans them out to connected clients. There is one poller per project and it
// only runs while at least one client is connected.
package watch

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/git-csm/server/internal/execpath"
	"github.com/git-csm/server/internal/pathguard"
)

// Event is sent to clients as an SSE message: name is the SSE event, data is JSON-encoded.
type Event struct {
	Name string
	Data any
}

// PathData is the payload of "file" and "dir" events.
type PathData struct {
	Path string `json:"path"`
}

// Client is one connected event stream plus what it asked to watch.
type Client struct {
	id     string
	events chan Event
	done   chan struct{}
	once   sync.Once

	mu    sync.Mutex
	dirs  map[string]bool
	files map[string]bool
}

func newClient(id string) *Client {
	return &Client{id: id, events: make(chan Event, 32), done: make(chan struct{}), dirs: map[string]bool{}, files: map[string]bool{}}
}

func (c *Client) Events() <-chan Event { return c.events }

// Done is closed when the client is removed: hub shutdown, replaced by a reconnect, or too slow.
func (c *Client) Done() <-chan struct{} { return c.done }

func (c *Client) close() { c.once.Do(func() { close(c.done) }) }

func (c *Client) setWatch(dirs, files []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.dirs, c.files = toSet(dirs), toSet(files)
}

func (c *Client) watches(kind, path string) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if kind == "d" {
		return c.dirs[path]
	}
	return c.files[path]
}

func toSet(s []string) map[string]bool {
	m := make(map[string]bool, len(s))
	for _, v := range s {
		m[v] = true
	}
	return m
}

type Hub struct {
	interval time.Duration

	mu      sync.Mutex
	pollers map[string]*poller
	closed  bool
}

func New(interval time.Duration) *Hub {
	return &Hub{interval: interval, pollers: map[string]*poller{}}
}

// Subscribe registers a client for a project and starts the project's poller if needed.
// The returned func must be called when the stream ends.
func (h *Hub) Subscribe(projectID, root, clientID string) (*Client, func()) {
	c := newClient(clientID)
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		c.close()
		return c, func() {}
	}
	p := h.pollers[projectID]
	if p == nil {
		ctx, cancel := context.WithCancel(context.Background())
		p = &poller{root: root, clients: map[string]*Client{}, sigs: map[string]string{}, cancel: cancel}
		h.pollers[projectID] = p
		go p.run(ctx, h.interval)
	}
	p.mu.Lock()
	if old := p.clients[clientID]; old != nil {
		old.close() // a reconnect replaces the stale stream
	}
	p.clients[clientID] = c
	p.mu.Unlock()
	return c, func() { h.unsubscribe(projectID, c) }
}

func (h *Hub) unsubscribe(projectID string, c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	c.close()
	p := h.pollers[projectID]
	if p == nil {
		return
	}
	p.mu.Lock()
	if p.clients[c.id] == c {
		delete(p.clients, c.id)
	}
	empty := len(p.clients) == 0
	p.mu.Unlock()
	if empty {
		p.cancel()
		delete(h.pollers, projectID)
	}
}

// SetWatch replaces what a client watches. Paths must already be validated and project-relative.
// It reports false if the client has no open stream.
func (h *Hub) SetWatch(projectID, clientID string, dirs, files []string) bool {
	h.mu.Lock()
	p := h.pollers[projectID]
	h.mu.Unlock()
	if p == nil {
		return false
	}
	p.mu.Lock()
	c := p.clients[clientID]
	p.mu.Unlock()
	if c == nil {
		return false
	}
	c.setWatch(dirs, files)
	// Baseline newly watched paths now so that only later changes produce events.
	for _, f := range files {
		p.baseline("f", f)
	}
	for _, d := range dirs {
		p.baseline("d", d)
	}
	return true
}

// Pollers reports how many projects are being polled (for tests).
func (h *Hub) Pollers() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.pollers)
}

// Close disconnects every client and stops all pollers.
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.closed = true
	for id, p := range h.pollers {
		p.cancel()
		p.mu.Lock()
		for _, c := range p.clients {
			c.close()
		}
		p.mu.Unlock()
		delete(h.pollers, id)
	}
}

type poller struct {
	root   string
	cancel context.CancelFunc

	mu      sync.Mutex
	clients map[string]*Client
	sigs    map[string]string // "f:path" / "d:path" -> signature at last look
	gitSig  string
}

func (p *poller) run(ctx context.Context, interval time.Duration) {
	p.mu.Lock()
	p.gitSig = gitSig(ctx, p.root)
	p.mu.Unlock()

	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			p.tick(ctx)
		}
	}
}

func (p *poller) tick(ctx context.Context) {
	p.mu.Lock()
	clients := make([]*Client, 0, len(p.clients))
	for _, c := range p.clients {
		clients = append(clients, c)
	}
	p.mu.Unlock()

	dirs, files := map[string]bool{}, map[string]bool{}
	for _, c := range clients {
		c.mu.Lock()
		for d := range c.dirs {
			dirs[d] = true
		}
		for f := range c.files {
			files[f] = true
		}
		c.mu.Unlock()
	}

	if sig := gitSig(ctx, p.root); sig != "" {
		p.mu.Lock()
		changed := sig != p.gitSig
		p.gitSig = sig
		p.mu.Unlock()
		if changed {
			emit(clients, Event{Name: "git", Data: struct{}{}}, nil)
		}
	}

	live := map[string]bool{}
	check := func(kind, name, path string, sig func(string, string) string) {
		key := kind + ":" + path
		live[key] = true
		now := sig(p.root, path)
		p.mu.Lock()
		old, seen := p.sigs[key]
		p.sigs[key] = now
		p.mu.Unlock()
		if seen && old != now {
			emit(clients, Event{Name: name, Data: PathData{Path: path}}, func(c *Client) bool { return c.watches(kind, path) })
		}
	}
	for f := range files {
		check("f", "file", f, fileSig)
	}
	for d := range dirs {
		check("d", "dir", d, dirSig)
	}

	// Forget paths nobody watches any more, so watching them again starts from a fresh baseline.
	p.mu.Lock()
	for key := range p.sigs {
		if !live[key] {
			delete(p.sigs, key)
		}
	}
	p.mu.Unlock()
}

func (p *poller) baseline(kind, path string) {
	key := kind + ":" + path
	p.mu.Lock()
	_, seen := p.sigs[key]
	p.mu.Unlock()
	if seen {
		return
	}
	sig := fileSig
	if kind == "d" {
		sig = dirSig
	}
	now := sig(p.root, path)
	p.mu.Lock()
	if _, seen := p.sigs[key]; !seen {
		p.sigs[key] = now
	}
	p.mu.Unlock()
}

// emit never blocks: a client whose buffer is full is dropped, and its browser reconnects and
// resyncs everything, which is cheaper than tracking what it missed.
func emit(clients []*Client, ev Event, filter func(*Client) bool) {
	for _, c := range clients {
		if filter != nil && !filter(c) {
			continue
		}
		select {
		case c.events <- ev:
		default:
			c.close()
		}
	}
}

func fileSig(root, rel string) string {
	abs, err := pathguard.Resolve(root, rel)
	if err != nil {
		return "err"
	}
	fi, err := os.Stat(abs)
	if err != nil {
		return "missing"
	}
	return fmt.Sprintf("%d:%d", fi.ModTime().UnixNano(), fi.Size())
}

func dirSig(root, rel string) string {
	abs, err := pathguard.Resolve(root, rel)
	if err != nil {
		return "err"
	}
	des, err := os.ReadDir(abs)
	if err != nil {
		return "missing"
	}
	var b strings.Builder
	for _, de := range des {
		if de.Name() == ".git" {
			continue
		}
		fmt.Fprintf(&b, "%c%s\n", "fdl?"[kindIndex(de)], de.Name())
	}
	return b.String()
}

func kindIndex(de os.DirEntry) int {
	switch {
	case de.Type()&os.ModeSymlink != 0:
		return 2
	case de.IsDir():
		return 1
	default:
		return 0
	}
}

// gitSig hashes what the Source Control and Branches panels show, so a change made anywhere
// (stage, commit, branch switch, edits, stash, fetch, branch created or deleted) is detected:
// `git status` (with the stash count) plus every branch and remote-branch tip.
// It returns "" when the context was cancelled, and a constant when root is not a repository.
func gitSig(ctx context.Context, root string) string {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	// --no-optional-locks: never take index.lock, so we cannot block the user's own git commands.
	git, err := execpath.Look("git")
	if err != nil {
		return "norepo"
	}
	status, err := exec.CommandContext(ctx, git, "--no-optional-locks", "-C", root, "status", "--porcelain=v2", "-z", "--branch", "--show-stash").Output()
	if ctx.Err() != nil {
		return ""
	}
	if err != nil {
		return "norepo"
	}
	// A failure here (for example no refs yet) just contributes nothing.
	refs, _ := exec.CommandContext(ctx, git, "--no-optional-locks", "-C", root, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/remotes").Output()
	if ctx.Err() != nil {
		return ""
	}
	h := sha1.New()
	h.Write(status)
	h.Write([]byte{0})
	h.Write(refs)
	return hex.EncodeToString(h.Sum(nil))
}

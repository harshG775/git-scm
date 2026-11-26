package git

import (
	"context"
	"sort"
	"strconv"
	"strings"
)

type Ref struct {
	Name string `json:"name"`
	// Kind is "branch" (local), "remote" or "tag".
	Kind    string `json:"kind"`
	Current bool   `json:"current,omitempty"`
}

type Commit struct {
	Oid     string   `json:"oid"`
	Parents []string `json:"parents"`
	Author  string   `json:"author"`
	Email   string   `json:"email"`
	// Time is the author date, in Unix seconds.
	Time    int64  `json:"time"`
	Subject string `json:"subject"`
	Body    string `json:"body"`
	Refs    []Ref  `json:"refs"`
}

type Log struct {
	IsRepo bool `json:"isRepo"`
	// Head is the commit HEAD points at ("" before the first commit).
	Head       string `json:"head"`
	HeadBranch string `json:"headBranch"`
	Detached   bool   `json:"detached"`
	// Uncommitted counts files with staged, unstaged, untracked or conflicted changes.
	Uncommitted int      `json:"uncommitted"`
	Commits     []Commit `json:"commits"`
	// HasMore reports that older commits exist beyond `limit`.
	HasMore bool    `json:"hasMore"`
	Stashes []Stash `json:"stashes"`
}

const (
	ScopeLocal = "local" // local branches and HEAD
	ScopeAll   = "all"   // plus remote branches and tags
	maxBody    = 4000
)

// Log returns commits newest first (by date, never before a child), with the topology the graph
// needs. Stash commits are not part of it: they are returned separately, with their base commit.
func (r Repo) Log(ctx context.Context, scope string, limit int) (Log, error) {
	out := Log{Commits: []Commit{}, Stashes: []Stash{}}
	if limit < 1 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}

	st, err := r.Status(ctx)
	if err != nil {
		return out, err
	}
	if !st.IsRepo {
		return out, nil
	}
	out.IsRepo, out.HeadBranch, out.Detached = true, st.Branch, st.Detached
	seen := map[string]bool{}
	for _, list := range [][]Change{st.Conflicts, st.Staged, st.Changes} {
		for _, c := range list {
			seen[c.Path] = true
		}
	}
	out.Uncommitted = len(seen)

	if sl, err := r.Stashes(ctx); err == nil {
		out.Stashes = sl.Stashes
	}
	if st.Oid == "(initial)" { // no commits yet
		return out, nil
	}
	out.Head = st.Oid

	args := []string{"log", "--date-order", "--max-count=" + strconv.Itoa(limit+1),
		"--format=%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%b%x1e", "--branches"}
	if scope == ScopeAll {
		args = append(args, "--remotes", "--tags")
	}
	args = append(args, "HEAD")
	res, err := r.run(ctx, opts{}, args...)
	if err != nil {
		return out, err
	}
	for _, rec := range strings.Split(string(res.out), "\x1e") {
		rec = strings.TrimLeft(rec, "\n")
		if rec == "" {
			continue
		}
		f := strings.SplitN(rec, "\x00", 7)
		if len(f) != 7 {
			continue
		}
		at, _ := strconv.ParseInt(f[4], 10, 64)
		body := strings.TrimSpace(f[6])
		if len(body) > maxBody {
			body = body[:maxBody] + "…"
		}
		out.Commits = append(out.Commits, Commit{
			Oid: f[0], Parents: strings.Fields(f[1]), Author: f[2], Email: f[3],
			Time: at, Subject: f[5], Body: body, Refs: []Ref{},
		})
	}
	if len(out.Commits) > limit {
		out.Commits, out.HasMore = out.Commits[:limit], true
	}

	// Decorations come from the ref list, not from `%D`, which cannot tell a local branch named
	// "origin/x" from a remote one.
	refs, err := r.run(ctx, opts{}, "for-each-ref", "--format=%(objectname)%00%(*objectname)%00%(refname)", "refs/heads", "refs/remotes", "refs/tags")
	if err != nil {
		return out, err
	}
	byOid := map[string][]Ref{}
	for _, line := range strings.Split(string(refs.out), "\n") {
		f := strings.Split(line, "\x00")
		if len(f) != 3 {
			continue
		}
		oid := f[0]
		if f[1] != "" { // annotated tag: the commit is the peeled object
			oid = f[1]
		}
		var ref Ref
		switch {
		case strings.HasPrefix(f[2], "refs/heads/"):
			ref = Ref{Name: strings.TrimPrefix(f[2], "refs/heads/"), Kind: "branch"}
			ref.Current = !st.Detached && ref.Name == st.Branch
		case strings.HasPrefix(f[2], "refs/remotes/"):
			if strings.HasSuffix(f[2], "/HEAD") {
				continue
			}
			ref = Ref{Name: strings.TrimPrefix(f[2], "refs/remotes/"), Kind: "remote"}
		case strings.HasPrefix(f[2], "refs/tags/"):
			ref = Ref{Name: strings.TrimPrefix(f[2], "refs/tags/"), Kind: "tag"}
		default:
			continue
		}
		byOid[oid] = append(byOid[oid], ref)
	}
	rank := map[string]int{"branch": 1, "remote": 2, "tag": 3}
	for i := range out.Commits {
		rs := byOid[out.Commits[i].Oid]
		sort.SliceStable(rs, func(a, b int) bool {
			if rs[a].Current != rs[b].Current {
				return rs[a].Current
			}
			if rank[rs[a].Kind] != rank[rs[b].Kind] {
				return rank[rs[a].Kind] < rank[rs[b].Kind]
			}
			return rs[a].Name < rs[b].Name
		})
		if rs != nil {
			out.Commits[i].Refs = rs
		}
	}
	return out, nil
}

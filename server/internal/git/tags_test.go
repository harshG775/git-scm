package git

import (
	"strings"
	"testing"
	"time"
)

func TestTagsListNewestFirst(t *testing.T) {
	r, dir := newRepo(t)
	write(t, dir, "a.txt", "first")
	commitAll(t, dir, "first commit")
	sh(t, dir, "tag", "v1.0.0")
	time.Sleep(1100 * time.Millisecond)
	sh(t, dir, "tag", "-a", "v1.1.0", "-m", "release 1.1")

	list, err := r.Tags(ctx)
	if err != nil || !list.IsRepo {
		t.Fatalf("tags = %+v, %v", list, err)
	}
	var names []string
	for _, tag := range list.Tags {
		names = append(names, tag.Name)
		if tag.Oid == "" || tag.Time == 0 {
			t.Errorf("incomplete tag = %+v", tag)
		}
	}
	if got := strings.Join(names, " "); got != "v1.1.0 v1.0.0" {
		t.Errorf("order = %q", got)
	}
	if list.Tags[0].Subject != "release 1.1" {
		t.Errorf("annotated tag subject = %q", list.Tags[0].Subject)
	}
}

func TestTagsOutsideRepo(t *testing.T) {
	isolate(t)
	list, err := (Repo{Root: t.TempDir()}).Tags(ctx)
	if err != nil || list.IsRepo || len(list.Tags) != 0 {
		t.Fatalf("not a repo = %+v, %v", list, err)
	}
}

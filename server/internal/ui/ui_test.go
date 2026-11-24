package ui

import (
	"mime"
	"net/http"
	"net/http/httptest"
	"testing"
)

func get(t *testing.T, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	Handler().ServeHTTP(rec, httptest.NewRequest("GET", path, nil))
	return rec
}

// dist may be empty (fresh checkout) or hold a real build, so tests use paths no build produces.
func TestMissingAssetIs404(t *testing.T) {
	for _, p := range []string{"/assets/gone-abc123.js", "/never-built.png", "/nope/missing.css"} {
		if rec := get(t, p); rec.Code != http.StatusNotFound {
			t.Errorf("%s = %d, want 404", p, rec.Code)
		}
	}
}

func TestManifestMime(t *testing.T) {
	if got := mime.TypeByExtension(".webmanifest"); got != "application/manifest+json" {
		t.Errorf("webmanifest mime = %q", got)
	}
}

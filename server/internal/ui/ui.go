// Package ui embeds the built web app (copied from web/dist by `make web`).
package ui

import (
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
)

//go:embed all:dist
var dist embed.FS

func init() {
	// Not in Go's built-in table, and Termux has no /etc/mime.types to fall back on.
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
}

// Handler serves the embedded SPA, falling back to index.html for client-side routes.
func Handler() http.Handler {
	sub, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}
	files := http.FileServerFS(sub)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(sub, p); err != nil {
			// A missing file (stale hashed asset, favicon, ...) is a 404; only extensionless
			// paths are client-side routes that the router should handle.
			if path.Ext(p) != "" {
				http.NotFound(w, r)
				return
			}
			p, r.URL.Path = "index.html", "/"
		}

		h := w.Header()
		if strings.HasPrefix(p, "assets/") {
			// Filenames contain a content hash, so they never change.
			h.Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			// The shell, service worker and manifest must be revalidated or updates never arrive.
			h.Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	})
}

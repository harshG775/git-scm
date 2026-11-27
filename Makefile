.PHONY: web build run dev-server

# Build the frontend and copy it where the Go binary embeds it from.
web:
	cd web && vp build
	rm -rf server/internal/ui/dist && mkdir -p server/internal/ui/dist
	cp -r web/dist/. server/internal/ui/dist/

# Single self-contained binary (frontend embedded).
build: web
	cd server && go build -o ../bin/git-scm .

# Rebuild the frontend, then run the server: the whole app on :8080 from one process.
run: web
	cd server && go run .

# API only, for use with `cd web && vp run dev` (app on :3000, proxied to this server).
# The app that :8080 serves under this target is whatever `make web` last embedded.
dev-server:
	cd server && go run .

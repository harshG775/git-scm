.PHONY: web server dev-server build

# Build the frontend and copy it where the Go binary embeds it from.
web:
	cd web && vp build
	rm -rf server/internal/ui/dist && mkdir -p server/internal/ui/dist
	cp -r web/dist/. server/internal/ui/dist/

# Single self-contained binary (frontend embedded).
build: web
	cd server && go build -o ../bin/git-csm .

dev-server:
	cd server && go run .

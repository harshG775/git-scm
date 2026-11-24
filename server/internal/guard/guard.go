// Package guard keeps other websites out of the local server. The API has no login, so the
// browser's same-origin rules are the only protection, and they are not enough on their own:
//   - a page on any site can send "simple" cross-origin POSTs to http://127.0.0.1:<port> (CSRF),
//   - a page on a hostile domain that re-points its DNS at 127.0.0.1 becomes same-origin (rebinding).
//
// So every request must name a local Host, and any Origin it carries must be this server itself.
package guard

import (
	"net"
	"net/http"
	"net/url"
	"strings"
)

// Wrap rejects requests with an unexpected Host or a cross-origin Origin. extraHosts are
// additional host names (no port) to accept, e.g. "phone.local" for use over a LAN.
func Wrap(next http.Handler, extraHosts []string) http.Handler {
	extra := map[string]bool{}
	for _, h := range extraHosts {
		if h = strings.ToLower(strings.TrimSpace(h)); h != "" {
			extra[h] = true
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !hostAllowed(hostname(r.Host), extra) {
			http.Error(w, "forbidden host (use localhost, an IP address, or start with --allow-hosts)", http.StatusForbidden)
			return
		}
		// Same-origin requests either omit Origin (GET navigations, curl) or send our own.
		if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			if err != nil || !strings.EqualFold(u.Host, r.Host) {
				http.Error(w, "cross-origin request blocked", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// hostAllowed accepts localhost and IP literals (an attacker's domain can resolve to a local
// IP, but the browser will still send the domain as Host, never the bare IP), plus extras.
func hostAllowed(host string, extra map[string]bool) bool {
	host = strings.ToLower(host)
	switch {
	case host == "localhost", strings.HasSuffix(host, ".localhost"):
		return true
	case net.ParseIP(host) != nil:
		return true
	}
	return extra[host]
}

// hostname strips the port and IPv6 brackets from a Host header value.
func hostname(hostport string) string {
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		return h
	}
	return strings.Trim(hostport, "[]")
}

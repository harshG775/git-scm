package guard

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func status(t *testing.T, extra []string, method, host string, hdr map[string]string) int {
	t.Helper()
	h := Wrap(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }), extra)
	req := httptest.NewRequest(method, "http://"+host+"/api/x", nil)
	req.Host = host
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code
}

func TestLocalHostsAllowed(t *testing.T) {
	for _, host := range []string{"localhost:8080", "127.0.0.1:8080", "[::1]:8080", "LocalHost:3000", "192.168.1.20:8080", "app.localhost:8080", "localhost"} {
		if c := status(t, nil, "GET", host, nil); c != 204 {
			t.Errorf("Host %s = %d, want 204", host, c)
		}
	}
}

func TestRebindingHostsBlocked(t *testing.T) {
	for _, host := range []string{"attacker.example:8080", "evil.com", "127.0.0.1.evil.com:8080", "localhost.evil.com"} {
		if c := status(t, nil, "GET", host, nil); c != 403 {
			t.Errorf("Host %s = %d, want 403", host, c)
		}
	}
}

func TestExtraHosts(t *testing.T) {
	if c := status(t, nil, "GET", "phone.local:8080", nil); c != 403 {
		t.Errorf("unlisted name = %d", c)
	}
	if c := status(t, []string{"Phone.Local"}, "GET", "phone.local:8080", nil); c != 204 {
		t.Errorf("listed name = %d", c)
	}
}

func TestOrigin(t *testing.T) {
	cases := []struct {
		name, host, origin string
		want               int
	}{
		{"no origin (curl, navigation)", "127.0.0.1:8080", "", 204},
		{"same origin", "127.0.0.1:8080", "http://127.0.0.1:8080", 204},
		{"same origin, https", "localhost:8443", "https://localhost:8443", 204},
		{"vite dev proxy keeps the page's host", "localhost:3000", "http://localhost:3000", 204},
		{"other site", "127.0.0.1:8080", "http://evil.example", 403},
		{"other site, same host different port", "127.0.0.1:8080", "http://127.0.0.1:3000", 403},
		{"localhost vs 127.0.0.1 are different origins", "127.0.0.1:8080", "http://localhost:8080", 403},
		{"opaque origin", "127.0.0.1:8080", "null", 403},
		{"garbage", "127.0.0.1:8080", "::::", 403},
	}
	for _, c := range cases {
		for _, method := range []string{"GET", "POST", "PUT", "DELETE"} {
			hdr := map[string]string{}
			if c.origin != "" {
				hdr["Origin"] = c.origin
			}
			if got := status(t, nil, method, c.host, hdr); got != c.want {
				t.Errorf("%s %s: %s = %d, want %d", c.name, method, c.origin, got, c.want)
			}
		}
	}
}

package core_test

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/alicebob/miniredis/v2"

	"gateway/core"
)

// newTestStore starts a miniredis server and returns a Store pointed at it.
// The server is shut down automatically when the test ends.
func newTestStore(t *testing.T) (*core.Store, *miniredis.Miniredis) {
	t.Helper()
	mr := miniredis.RunT(t)
	return core.NewStore(mr.Addr()), mr
}

// newTestGateway builds a Gateway wired to a fake upstream server and a
// miniredis-backed store. The upstream returns a fixed JSON body for any path.
func newTestGateway(t *testing.T) (*core.Gateway, *httptest.Server) {
	t.Helper()
	s, _ := newTestStore(t)

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"symbol":"AAPL","c":150.0}`))
	}))
	t.Cleanup(upstream.Close)

	target, _ := url.Parse(upstream.URL)
	gw := core.NewGateway(s, core.NewProxy(target, s), core.NewBacktestProxy(target))
	return gw, upstream
}

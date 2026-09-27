package httpx

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestBindJSON(t *testing.T) {
	type payload struct {
		Name string `json:"name"`
	}
	tests := []struct {
		body string
		ok   bool
	}{
		{`{"name":"Awa"}`, true},
		{`{"name":"Awa","extra":true}`, false},
		{`{"name":"Awa"}{"name":"Bob"}`, false},
		{`[1]`, false},
		{`{"name":"` + strings.Repeat("a", MaxJSONBodyBytes) + `"}`, false},
	}
	gin.SetMode(gin.TestMode)
	for _, tt := range tests {
		rec := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(rec)
		c.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tt.body))

		var got payload
		ok := BindJSON(c, &got)

		if ok != tt.ok {
			t.Errorf("body %.40q: ok = %v, want %v", tt.body, ok, tt.ok)
		}
		if !ok && rec.Code != http.StatusBadRequest {
			t.Errorf("body %.40q: status %d, want 400", tt.body, rec.Code)
		}
		if ok && got.Name != "Awa" {
			t.Errorf("decoded %+v", got)
		}
	}
}

func TestEndUserIPTrustsTheRelayedIPOnlyFromInternalCallers(t *testing.T) {
	tests := []struct {
		name     string
		internal bool
		relayed  string
		want     string
	}{
		{"internal caller relays the user IP", true, "41.82.10.7", "41.82.10.7"},
		{"public caller cannot spoof it", false, "41.82.10.7", "192.0.2.1"},
		{"invalid relayed value is ignored", true, "not-an-ip", "192.0.2.1"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/", nil)
			c.Request.RemoteAddr = "192.0.2.1:5000"
			c.Request.Header.Set(ClientIPHeader, tt.relayed)

			got := EndUserIP(func(*gin.Context) bool { return tt.internal })(c)

			if got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

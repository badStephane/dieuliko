package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/netip"
	"strconv"

	"github.com/gin-gonic/gin"
)

// MaxJSONBodyBytes bounds request bodies; every JSON payload of the API is small.
const MaxJSONBodyBytes = 16 << 10

// ClientIPHeader carries the end user's IP on calls made by the Next.js server on their behalf.
const ClientIPHeader = "X-Client-IP"

// BindJSON strictly decodes the body into dst (size-limited, single object, unknown fields rejected).
// On failure it answers 400 and returns false.
func BindJSON(c *gin.Context, dst any) bool {
	return BindJSONLimit(c, dst, MaxJSONBodyBytes)
}

// BindJSONLimit is BindJSON for the few payloads larger than MaxJSONBodyBytes.
func BindJSONLimit(c *gin.Context, dst any, maxBytes int64) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		Fail(c, http.StatusBadRequest, CodeBadRequest, "Requête invalide.")
		return false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		Fail(c, http.StatusBadRequest, CodeBadRequest, "Requête invalide.")
		return false
	}
	return true
}

// EndUserIP returns the IP of the person behind the request. Trusted server-side callers
// (isInternal) relay it in X-Client-IP; anyone else is identified by their own address.
func EndUserIP(isInternal func(*gin.Context) bool) func(*gin.Context) string {
	return func(c *gin.Context) string {
		if isInternal(c) {
			if addr, err := netip.ParseAddr(c.GetHeader(ClientIPHeader)); err == nil {
				return addr.String()
			}
		}
		return c.ClientIP()
	}
}

// IntQuery reads an integer query parameter between minimum and maximum; missing or empty gives fallback. The error
// message is shown to users (French).
func IntQuery(c *gin.Context, name string, fallback, minimum, maximum int) (int, error) {
	raw, ok := c.GetQuery(name)
	if !ok || raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf("Le paramètre « %s » doit être un entier entre %d et %d.", name, minimum, maximum)
	}
	return value, nil
}

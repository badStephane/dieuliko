// Package httpx holds the HTTP conventions shared by every handler: the JSON envelope and middleware.
package httpx

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// Error codes returned in the envelope; the front switches on these, never on messages.
const (
	CodeBadRequest  = "bad_request"
	CodeNotFound    = "not_found"
	CodeForbidden   = "forbidden"
	CodeNotAllowed  = "method_not_allowed"
	CodeRateLimited = "rate_limited"
	CodeInternal    = "internal_error"
	CodeValidation  = "validation_failed"
)

// Envelope is the shape of every JSON response.
type Envelope struct {
	Success bool   `json:"success"`
	Data    any    `json:"data"`
	Error   *Error `json:"error"`
	Meta    any    `json:"meta,omitempty"`
}

// Error describes a failed request; Message is safe to show to end users (French).
// Fields maps form field names to their error message (validation failures only).
type Error struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

// PageMeta accompanies paginated lists.
type PageMeta struct {
	Total  int `json:"total"`
	Offset int `json:"offset"`
	Limit  int `json:"limit"`
}

// OK writes a 200 response with data.
func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Envelope{Success: true, Data: data})
}

// OKPage writes a 200 response with a page of data and its pagination metadata.
func OKPage(c *gin.Context, data any, meta PageMeta) {
	c.JSON(http.StatusOK, Envelope{Success: true, Data: data, Meta: meta})
}

// Created writes a 201 response with data.
func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, Envelope{Success: true, Data: data})
}

// FailFields aborts with an error envelope carrying per-field messages.
func FailFields(c *gin.Context, status int, code, message string, fields map[string]string) {
	c.AbortWithStatusJSON(status, Envelope{Success: false, Error: &Error{Code: code, Message: message, Fields: fields}})
}

// Fail aborts the request with an error envelope.
func Fail(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, Envelope{Success: false, Error: &Error{Code: code, Message: message}})
}

// InternalError logs the cause (never sent to the client) and answers 500.
func InternalError(c *gin.Context, err error) {
	_ = c.Error(err) // picked up by the access log middleware
	Fail(c, http.StatusInternalServerError, CodeInternal, "Une erreur interne est survenue. Réessayez plus tard.")
}

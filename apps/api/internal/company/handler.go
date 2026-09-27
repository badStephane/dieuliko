package company

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// Pagination bounds for GET /companies.
const (
	DefaultPageLimit = 12
	MaxPageLimit     = 100
	MaxPageOffset    = 10_000
)

// Handler serves the public directory endpoints.
type Handler struct {
	repo Repository
}

// NewHandler builds the directory handler on top of a Repository.
func NewHandler(repo Repository) *Handler {
	return &Handler{repo: repo}
}

// Register mounts the directory routes on a router group (e.g. /v1).
func (h *Handler) Register(group *gin.RouterGroup) {
	group.GET("/companies", h.search)
	group.GET("/companies/:slug", h.get)
	group.GET("/company-slugs", h.slugs)
	group.GET("/sectors", h.sectors)
	group.GET("/cities", h.cities)
}

func (h *Handler) search(c *gin.Context) {
	filters, page, err := parseSearch(c)
	if err != nil {
		httpx.Fail(c, http.StatusBadRequest, httpx.CodeBadRequest, err.Error())
		return
	}
	result, err := h.repo.Search(c.Request.Context(), filters, page)
	if err != nil {
		httpx.InternalError(c, err)
		return
	}
	httpx.OKPage(c, result.Items, httpx.PageMeta{Total: result.Total, Offset: page.Offset, Limit: page.Limit})
}

func (h *Handler) get(c *gin.Context) {
	slug := c.Param("slug")
	if !IsValidSlug(slug) {
		failNotFound(c)
		return
	}
	company, err := h.repo.FindBySlug(c.Request.Context(), slug)
	if errors.Is(err, ErrNotFound) {
		failNotFound(c)
		return
	}
	if err != nil {
		httpx.InternalError(c, err)
		return
	}
	httpx.OK(c, company)
}

func (h *Handler) slugs(c *gin.Context) {
	slugs, err := h.repo.Slugs(c.Request.Context())
	if err != nil {
		httpx.InternalError(c, err)
		return
	}
	httpx.OK(c, slugs)
}

func (h *Handler) sectors(c *gin.Context) {
	counts, err := h.repo.SectorCounts(c.Request.Context())
	if err != nil {
		httpx.InternalError(c, err)
		return
	}
	httpx.OK(c, counts)
}

func (h *Handler) cities(c *gin.Context) {
	counts, err := h.repo.CityCounts(c.Request.Context())
	if err != nil {
		httpx.InternalError(c, err)
		return
	}
	httpx.OK(c, counts)
}

func failNotFound(c *gin.Context) {
	httpx.Fail(c, http.StatusNotFound, httpx.CodeNotFound, "Entreprise introuvable.")
}

// parseSearch validates the query string; error messages are shown to users (French).
func parseSearch(c *gin.Context) (Filters, PageRequest, error) {
	sector := strings.TrimSpace(c.Query("sector"))
	if sector != "" && !IsValidSlug(sector) {
		return Filters{}, PageRequest{}, errors.New("Le paramètre « sector » est invalide.")
	}
	offset, err := intParam(c, "offset", 0, 0, MaxPageOffset)
	if err != nil {
		return Filters{}, PageRequest{}, err
	}
	limit, err := intParam(c, "limit", DefaultPageLimit, 1, MaxPageLimit)
	if err != nil {
		return Filters{}, PageRequest{}, err
	}
	filters := Filters{
		Query:  c.Query("q"),
		Sector: sector,
		City:   strings.TrimSpace(c.Query("city")),
	}
	return filters, PageRequest{Offset: offset, Limit: limit}, nil
}

func intParam(c *gin.Context, name string, fallback, minimum, maximum int) (int, error) {
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

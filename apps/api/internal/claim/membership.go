package claim

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/badStephane/dieuliko/apps/api/internal/auth"
	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// CodeNoCompany answers a company account that manages no listing (its claim is pending, rejected or revoked).
const CodeNoCompany = "no_company"

// ErrNotMember means the account has no approved claim.
var ErrNotMember = errors.New("account manages no listing")

const membershipKey = "claim.membership"

// Membership is the listing an account manages.
type Membership struct {
	CompanyID uuid.UUID
	Slug      string
}

// Members finds the listing an account manages (Service in production, faked in tests).
type Members interface {
	Membership(ctx context.Context, userID uuid.UUID) (Membership, error)
}

// Membership returns the listing the account manages, or ErrNotMember.
func (s *Service) Membership(ctx context.Context, userID uuid.UUID) (Membership, error) {
	row, err := s.queries.GetMembership(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Membership{}, ErrNotMember
	}
	if err != nil {
		return Membership{}, fmt.Errorf("membership: %w", err)
	}
	return Membership{CompanyID: row.ID, Slug: row.Slug}, nil
}

// RequireMember restricts a route to the manager of a listing (use after RequireCompanyAccount). The claim is read on
// every request, so a revocation takes effect at once.
func RequireMember(members Members) gin.HandlerFunc {
	return func(c *gin.Context) {
		membership, err := members.Membership(c.Request.Context(), auth.CurrentUser(c).ID)
		if errors.Is(err, ErrNotMember) {
			httpx.Fail(c, http.StatusForbidden, CodeNoCompany, "Votre compte ne gère pas encore de fiche entreprise.")
			return
		}
		if err != nil {
			httpx.InternalError(c, err)
			return
		}
		c.Set(membershipKey, membership)
		c.Next()
	}
}

// CurrentMembership returns the listing set by RequireMember.
func CurrentMembership(c *gin.Context) Membership {
	membership, _ := c.Get(membershipKey)
	return membership.(Membership)
}

package listing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
	"github.com/badStephane/dieuliko/apps/api/internal/logo"
)

// ErrStale means the listing changed since the manager read it (an admin edit, or another tab).
var ErrStale = errors.New("listing changed since it was read")

// ValidationError names the invalid fields of an edit, with French messages.
type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string { return "invalid input" }

// Member is the company account managing a listing.
type Member struct {
	UserID    uuid.UUID
	CompanyID uuid.UUID
	Slug      string
}

// Listing is a listing as its manager sees it.
type Listing struct {
	Input
	Slug        string     `json:"slug"`
	LogoVersion *string    `json:"logoVersion"`
	Verified    bool       `json:"verified"`
	HiddenAt    *time.Time `json:"hiddenAt"`
	// UpdatedAt is sent back as ExpectedUpdatedAt, so an edit made in between is not overwritten.
	UpdatedAt time.Time `json:"updatedAt"`
}

// UpdateInput is the manager's edit. Name, sector and city are ignored: only the team changes them.
type UpdateInput struct {
	Input
	ExpectedUpdatedAt time.Time `json:"expectedUpdatedAt"`
}

// Manager lets a company account edit the listing it manages; every change is recorded in company_activity.
type Manager struct {
	db    DB
	logos *Logos
}

// NewManager builds the service.
func NewManager(db DB, logos *Logos) *Manager {
	return &Manager{db: db, logos: logos}
}

// Get returns the managed listing, hidden or not.
func (m *Manager) Get(ctx context.Context, companyID uuid.UUID) (Listing, error) {
	row, err := dbgen.New(m.db).GetManagedListing(ctx, companyID)
	if err != nil {
		return Listing{}, fmt.Errorf("get managed listing: %w", err)
	}
	return fromRow(dbgen.LockManagedListingRow(row))
}

// Update saves the editable fields when the listing has not changed since the manager read it.
func (m *Manager) Update(ctx context.Context, member Member, input UpdateInput) (Listing, error) {
	err := pgx.BeginFunc(ctx, m.db, func(tx pgx.Tx) error {
		q := dbgen.New(tx)
		row, err := q.LockManagedListing(ctx, member.CompanyID)
		if err != nil {
			return fmt.Errorf("update managed listing: lock: %w", err)
		}
		current, err := fromRow(row)
		if err != nil {
			return err
		}
		if !current.UpdatedAt.Equal(input.ExpectedUpdatedAt) {
			return ErrStale
		}
		edited := input.Input
		edited.Name, edited.Sector, edited.City = current.Name, current.Sector, current.City
		clean, problems := Validate(edited)
		if len(problems) > 0 {
			return &ValidationError{Fields: problems}
		}
		changed := ChangedFields(current.Input, clean)
		if len(changed) == 0 {
			return nil
		}
		links, err := json.Marshal(clean.SocialLinks)
		if err != nil {
			return fmt.Errorf("update managed listing: encode links: %w", err)
		}
		err = q.UpdateManagedListing(ctx, dbgen.UpdateManagedListingParams{
			ID: member.CompanyID, CompanyType: nullable(clean.CompanyType), Description: nullable(clean.Description),
			Website: nullable(clean.Website), Email: nullable(clean.Email), Phone: nullable(clean.Phone),
			Address: nullable(clean.Address), Size: nullable(clean.Size), SocialLinks: links,
		})
		if err != nil {
			return fmt.Errorf("update managed listing: %w", err)
		}
		return recordActivity(ctx, q, member, "listing.update", changed)
	})
	if err != nil {
		return Listing{}, err
	}
	return m.Get(ctx, member.CompanyID)
}

// SetLogo replaces the listing's logo; an image that is not accepted is reported on the upload field.
func (m *Manager) SetLogo(ctx context.Context, member Member, content []byte) (Listing, error) {
	err := m.logos.Set(ctx, member.Slug, content, activityRecord(member, "listing.logo_set"))
	var invalid *logo.InvalidError
	if errors.As(err, &invalid) {
		return Listing{}, &ValidationError{Fields: map[string]string{logo.UploadField: invalid.Message}}
	}
	if err != nil {
		return Listing{}, err
	}
	return m.Get(ctx, member.CompanyID)
}

// RemoveLogo takes the logo off the listing; the monogram is shown again.
func (m *Manager) RemoveLogo(ctx context.Context, member Member) (Listing, error) {
	if err := m.logos.Remove(ctx, member.Slug, activityRecord(member, "listing.logo_remove")); err != nil {
		return Listing{}, err
	}
	return m.Get(ctx, member.CompanyID)
}

func activityRecord(member Member, action string) Record {
	return func(ctx context.Context, q *dbgen.Queries) error {
		return recordActivity(ctx, q, member, action, nil)
	}
}

// recordActivity keeps what the company changed; fields holds names only, never values.
func recordActivity(ctx context.Context, q *dbgen.Queries, member Member, action string, fields []string) error {
	if fields == nil {
		fields = []string{}
	}
	err := q.InsertCompanyActivity(ctx, dbgen.InsertCompanyActivityParams{
		CompanyID: member.CompanyID, UserID: pgtype.UUID{Bytes: member.UserID, Valid: true}, Action: action, ChangedFields: fields,
	})
	if err != nil {
		return fmt.Errorf("company activity %s: %w", action, err)
	}
	return nil
}

func fromRow(row dbgen.LockManagedListingRow) (Listing, error) {
	links := map[string]string{}
	if err := json.Unmarshal(row.SocialLinks, &links); err != nil {
		return Listing{}, fmt.Errorf("listing %q: decode social_links: %w", row.Slug, err)
	}
	return Listing{
		Input: Input{
			Name: row.Name, Sector: row.Sector, City: row.City, CompanyType: deref(row.CompanyType), Description: deref(row.Description),
			Website: deref(row.Website), Email: deref(row.Email), Phone: deref(row.Phone), Address: deref(row.Address), Size: deref(row.Size),
			SocialLinks: links,
		},
		Slug: row.Slug, LogoVersion: logo.VersionOf(row.LogoKey), Verified: row.Verified, HiddenAt: row.HiddenAt, UpdatedAt: row.UpdatedAt,
	}, nil
}

func nullable(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func deref(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

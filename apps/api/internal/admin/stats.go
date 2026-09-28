package admin

import (
	"context"
	"fmt"

	"github.com/badStephane/dieuliko/apps/api/internal/database/dbgen"
)

// CandidateStats counts candidate accounts (admins excluded) and what they filled in.
type CandidateStats struct {
	Total          int64 `json:"total"`
	Last7Days      int64 `json:"last7Days"`
	Last30Days     int64 `json:"last30Days"`
	VerifiedEmails int64 `json:"verifiedEmails"`
	Suspended      int64 `json:"suspended"`
	WithProfile    int64 `json:"withProfile"`
	WithCV         int64 `json:"withCv"`
}

// ApplicationStats counts spontaneous applications by status.
type ApplicationStats struct {
	Sent      int64 `json:"sent"`
	Withdrawn int64 `json:"withdrawn"`
}

// CompanyStats counts directory listings.
type CompanyStats struct {
	Visible  int64 `json:"visible"`
	Hidden   int64 `json:"hidden"`
	Verified int64 `json:"verified"`
}

// TopCompany is a company ranked by the applications it received in the last 30 days.
type TopCompany struct {
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	City         string `json:"city"`
	Applications int64  `json:"applications"`
}

// Stats are the key numbers of the dashboard.
type Stats struct {
	Candidates   CandidateStats   `json:"candidates"`
	Letters      int64            `json:"letters"`
	Applications ApplicationStats `json:"applications"`
	Companies    CompanyStats     `json:"companies"`
	TopCompanies []TopCompany     `json:"topCompanies"`
}

// StatsService computes the dashboard numbers.
type StatsService struct {
	queries *dbgen.Queries
}

// NewStatsService builds the service; db is satisfied by *pgxpool.Pool.
func NewStatsService(db dbgen.DBTX) *StatsService {
	return &StatsService{queries: dbgen.New(db)}
}

// Get returns the current numbers (TopCompanies is never nil).
func (s *StatsService) Get(ctx context.Context) (Stats, error) {
	row, err := s.queries.GetAdminStats(ctx)
	if err != nil {
		return Stats{}, fmt.Errorf("admin stats: %w", err)
	}
	top, err := s.queries.ListTopCompaniesByApplications(ctx)
	if err != nil {
		return Stats{}, fmt.Errorf("admin stats: top companies: %w", err)
	}
	companies := make([]TopCompany, 0, len(top))
	for _, company := range top {
		companies = append(companies, TopCompany{Slug: company.Slug, Name: company.Name, City: company.City, Applications: company.Applications})
	}
	return Stats{
		Candidates: CandidateStats{
			Total: row.Candidates, Last7Days: row.CandidatesLast7Days, Last30Days: row.CandidatesLast30Days,
			VerifiedEmails: row.VerifiedEmails, Suspended: row.SuspendedCandidates, WithProfile: row.ProfilesWithContent, WithCV: row.Cvs,
		},
		Letters:      row.Letters,
		Applications: ApplicationStats{Sent: row.ApplicationsSent, Withdrawn: row.ApplicationsWithdrawn},
		Companies:    CompanyStats{Visible: row.CompaniesVisible, Hidden: row.CompaniesHidden, Verified: row.CompaniesVerified},
		TopCompanies: companies,
	}, nil
}

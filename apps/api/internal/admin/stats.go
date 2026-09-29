package admin

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

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
	// PendingClaims are company accounts' requests waiting for a review.
	PendingClaims int64 `json:"pendingClaims"`
}

// TopCompany is a company ranked by the applications it received in the last 30 days.
type TopCompany struct {
	Slug         string `json:"slug"`
	Name         string `json:"name"`
	City         string `json:"city"`
	Applications int64  `json:"applications"`
}

// Trend compares the last 7 days with the 7 before.
type Trend struct {
	Last7Days     int64 `json:"last7Days"`
	Previous7Days int64 `json:"previous7Days"`
}

// Trends are the weekly changes the dashboard's key figures show.
type Trends struct {
	Signups      Trend `json:"signups"`
	Applications Trend `json:"applications"`
	Letters      Trend `json:"letters"`
}

// QualityStats counts the listings to complete, with the rules of the list's quality filters.
type QualityStats struct {
	NoLogo        int64 `json:"noLogo"`
	NoDescription int64 `json:"noDescription"`
	NoContact     int64 `json:"noContact"`
	Unverified    int64 `json:"unverified"`
}

// DayCount is one day of activity (a Dakar date, "2006-01-02").
type DayCount struct {
	Day          string `json:"day"`
	Signups      int64  `json:"signups"`
	Applications int64  `json:"applications"`
}

// RecentCandidate is a new candidate account.
type RecentCandidate struct {
	ID        uuid.UUID `json:"id"`
	FirstName string    `json:"firstName"`
	LastName  string    `json:"lastName"`
	CreatedAt time.Time `json:"createdAt"`
}

// RecentApplication tells which listing received an application and when; never who applied or what they wrote.
type RecentApplication struct {
	Slug      string    `json:"slug"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
}

// Stats are the key numbers of the dashboard. Slices are never nil.
type Stats struct {
	Candidates         CandidateStats      `json:"candidates"`
	Letters            int64               `json:"letters"`
	Applications       ApplicationStats    `json:"applications"`
	Companies          CompanyStats        `json:"companies"`
	TopCompanies       []TopCompany        `json:"topCompanies"`
	Trends             Trends              `json:"trends"`
	Quality            QualityStats        `json:"quality"`
	Daily              []DayCount          `json:"daily"`
	RecentCandidates   []RecentCandidate   `json:"recentCandidates"`
	RecentApplications []RecentApplication `json:"recentApplications"`
}

// StatsService computes the dashboard numbers.
type StatsService struct {
	queries *dbgen.Queries
}

// NewStatsService builds the service; db is satisfied by *pgxpool.Pool.
func NewStatsService(db dbgen.DBTX) *StatsService {
	return &StatsService{queries: dbgen.New(db)}
}

// Get returns the current numbers.
func (s *StatsService) Get(ctx context.Context) (Stats, error) {
	row, err := s.queries.GetAdminStats(ctx)
	if err != nil {
		return Stats{}, fmt.Errorf("admin stats: %w", err)
	}
	stats := Stats{
		Candidates: CandidateStats{
			Total: row.Candidates, Last7Days: row.CandidatesLast7Days, Last30Days: row.CandidatesLast30Days,
			VerifiedEmails: row.VerifiedEmails, Suspended: row.SuspendedCandidates, WithProfile: row.ProfilesWithContent, WithCV: row.Cvs,
		},
		Letters:      row.Letters,
		Applications: ApplicationStats{Sent: row.ApplicationsSent, Withdrawn: row.ApplicationsWithdrawn},
		Companies:    CompanyStats{Visible: row.CompaniesVisible, Hidden: row.CompaniesHidden, Verified: row.CompaniesVerified, PendingClaims: row.PendingClaims},
		Trends: Trends{
			Signups:      Trend{Last7Days: row.CandidatesLast7Days, Previous7Days: row.CandidatesPrevious7Days},
			Applications: Trend{Last7Days: row.ApplicationsLast7Days, Previous7Days: row.ApplicationsPrevious7Days},
			Letters:      Trend{Last7Days: row.LettersLast7Days, Previous7Days: row.LettersPrevious7Days},
		},
		Quality: QualityStats{
			NoLogo: row.CompaniesNoLogo, NoDescription: row.CompaniesNoDescription, NoContact: row.CompaniesNoContact,
			Unverified: row.CompaniesVisible + row.CompaniesHidden - row.CompaniesVerified,
		},
	}
	if stats.TopCompanies, err = s.topCompanies(ctx); err != nil {
		return Stats{}, err
	}
	if stats.Daily, err = s.daily(ctx); err != nil {
		return Stats{}, err
	}
	if stats.RecentCandidates, stats.RecentApplications, err = s.recent(ctx); err != nil {
		return Stats{}, err
	}
	return stats, nil
}

func (s *StatsService) topCompanies(ctx context.Context) ([]TopCompany, error) {
	rows, err := s.queries.ListTopCompaniesByApplications(ctx)
	if err != nil {
		return nil, fmt.Errorf("admin stats: top companies: %w", err)
	}
	companies := make([]TopCompany, 0, len(rows))
	for _, row := range rows {
		companies = append(companies, TopCompany{Slug: row.Slug, Name: row.Name, City: row.City, Applications: row.Applications})
	}
	return companies, nil
}

func (s *StatsService) daily(ctx context.Context) ([]DayCount, error) {
	rows, err := s.queries.ListDailyActivity(ctx)
	if err != nil {
		return nil, fmt.Errorf("admin stats: daily activity: %w", err)
	}
	days := make([]DayCount, 0, len(rows))
	for _, row := range rows {
		days = append(days, DayCount{Day: row.Day.Format(time.DateOnly), Signups: row.Signups, Applications: row.Applications})
	}
	return days, nil
}

func (s *StatsService) recent(ctx context.Context) ([]RecentCandidate, []RecentApplication, error) {
	candidateRows, err := s.queries.ListRecentCandidates(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("admin stats: recent candidates: %w", err)
	}
	candidates := make([]RecentCandidate, 0, len(candidateRows))
	for _, row := range candidateRows {
		candidates = append(candidates, RecentCandidate(row))
	}
	applicationRows, err := s.queries.ListRecentApplications(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("admin stats: recent applications: %w", err)
	}
	applications := make([]RecentApplication, 0, len(applicationRows))
	for _, row := range applicationRows {
		applications = append(applications, RecentApplication(row))
	}
	return candidates, applications, nil
}

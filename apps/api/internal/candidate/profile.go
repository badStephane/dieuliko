// Package candidate manages what a candidate brings to a spontaneous application:
// a structured profile and a CV file.
package candidate

import (
	"errors"
	"time"
)

// Domain errors; handlers translate them into HTTP responses.
var (
	ErrNoCV = errors.New("candidate has no CV")
)

// ValidationError lists user input problems by field; messages are French and shown to users.
// List items are addressed as "<list>.<index>.<field>" (e.g. "experiences.0.title").
type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string {
	return "invalid input"
}

// Language levels, from beginner to native.
const (
	LevelBasic        = "notions"
	LevelIntermediate = "intermediaire"
	LevelFluent       = "courant"
	LevelNative       = "natif"
)

// ProfileInput is the whole profile as the candidate edits it; saving replaces every field and list.
type ProfileInput struct {
	Headline string `json:"headline"`
	Summary  string `json:"summary"`
	// Phone is returned in E.164 ("+221771234567"); Senegalese numbers may be given without +221.
	Phone string `json:"phone"`
	City  string `json:"city"`
	// DesiredSectors are sector slugs of the company directory, in order of preference.
	DesiredSectors []string     `json:"desiredSectors"`
	Skills         []string     `json:"skills"`
	Languages      []Language   `json:"languages"`
	Experiences    []Experience `json:"experiences"`
	Educations     []Education  `json:"educations"`
}

// Profile is a saved profile. UpdatedAt is nil until the candidate saves it for the first time.
type Profile struct {
	ProfileInput
	UpdatedAt *time.Time `json:"updatedAt"`
}

// Language is a spoken language and the candidate's level in it.
type Language struct {
	Language string `json:"language"`
	Level    string `json:"level"`
}

// Experience is a past or current job. Months are "YYYY-MM"; a nil EndMonth means ongoing.
type Experience struct {
	Title        string  `json:"title"`
	Organization string  `json:"organization"`
	City         string  `json:"city"`
	StartMonth   string  `json:"startMonth"`
	EndMonth     *string `json:"endMonth"`
	Description  string  `json:"description"`
}

// Education is a degree or training. Months are "YYYY-MM"; a nil EndMonth means ongoing.
type Education struct {
	Degree      string  `json:"degree"`
	School      string  `json:"school"`
	Field       string  `json:"field"`
	StartMonth  string  `json:"startMonth"`
	EndMonth    *string `json:"endMonth"`
	Description string  `json:"description"`
}

// emptyProfile is the profile of a candidate who never saved one (lists are empty, never null).
func emptyProfile() Profile {
	return Profile{ProfileInput: ProfileInput{
		DesiredSectors: []string{},
		Skills:         []string{},
		Languages:      []Language{},
		Experiences:    []Experience{},
		Educations:     []Education{},
	}}
}

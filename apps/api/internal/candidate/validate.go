package candidate

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// Input limits, mirrored by the CHECK constraints of migration 00003.
const (
	MaxHeadlineLength    = 100
	MaxSummaryLength     = 2000
	MaxCityLength        = 60
	MaxDesiredSectors    = 5
	MaxSkills            = 30
	MaxSkillLength       = 50
	MaxLanguages         = 10
	MaxLanguageLength    = 40
	MaxExperiences       = 20
	MaxEducations        = 10
	MaxLabelLength       = 100 // job titles, organizations, degrees, schools, fields of study
	MaxDescriptionLength = 2000
	// minYear rejects typos such as "0224-01" while covering any working life.
	minYear = 1950
)

const (
	monthLayout = "2006-01"
	senegalCode = "+221"
)

var (
	sectorSlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	e164Pattern       = regexp.MustCompile(`^\+[1-9][0-9]{7,14}$`)
	// Senegalese numbers have 9 digits: mobiles start with 7, landlines with 3.
	senegalNumberPattern = regexp.MustCompile(`^[37][0-9]{8}$`)
	languageLevels       = map[string]bool{LevelBasic: true, LevelIntermediate: true, LevelFluent: true, LevelNative: true}
)

const (
	msgForbiddenChars = "Ce champ contient des caractères non autorisés."
	msgRequired       = "Ce champ est obligatoire."
	msgMonthFormat    = "Utilisez le format AAAA-MM."
)

// fieldErrors collects one message per field (the first one wins).
type fieldErrors map[string]string

func (f fieldErrors) add(field, message string) {
	if message != "" && f[field] == "" {
		f[field] = message
	}
}

func (f fieldErrors) err() error {
	if len(f) == 0 {
		return nil
	}
	return &ValidationError{Fields: f}
}

// validateProfile normalizes the input and reports every invalid field. now bounds dates:
// nothing may start or end after the current month.
func validateProfile(input ProfileInput, now time.Time) (ProfileInput, error) {
	errs := fieldErrors{}
	now = now.UTC() // months are stored and compared in UTC
	lastMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	phone, isPhoneValid := normalizePhone(input.Phone)
	if !isPhoneValid {
		errs.add("phone", "Ce numéro de téléphone n’est pas valide.")
	}
	out := ProfileInput{
		Headline:       optionalText(errs, "headline", singleLine(input.Headline), MaxHeadlineLength),
		Summary:        optionalText(errs, "summary", multiLine(input.Summary), MaxSummaryLength),
		Phone:          phone,
		City:           optionalText(errs, "city", singleLine(input.City), MaxCityLength),
		DesiredSectors: normalizeSectors(errs, input.DesiredSectors),
		Skills:         normalizeSkills(errs, input.Skills),
		Languages:      normalizeLanguages(errs, input.Languages),
		Experiences:    normalizeExperiences(errs, input.Experiences, lastMonth),
		Educations:     normalizeEducations(errs, input.Educations, lastMonth),
	}
	if err := errs.err(); err != nil {
		return ProfileInput{}, err
	}
	return out, nil
}

// normalizePhone returns the number in E.164. Numbers without an international prefix are Senegalese.
// An empty number is valid (the phone is optional).
func normalizePhone(raw string) (string, bool) {
	compact := strings.Map(func(r rune) rune {
		if strings.ContainsRune(" .-() ", r) {
			return -1
		}
		return r
	}, raw)
	if compact == "" {
		return "", true
	}
	if rest, found := strings.CutPrefix(compact, "00"); found {
		compact = "+" + rest
	}
	if !strings.HasPrefix(compact, "+") {
		compact = senegalCode + compact
	}
	if !e164Pattern.MatchString(compact) {
		return "", false
	}
	if national, found := strings.CutPrefix(compact, senegalCode); found && !senegalNumberPattern.MatchString(national) {
		return "", false
	}
	return compact, true
}

func normalizeSectors(errs fieldErrors, sectors []string) []string {
	out := dedupe(sectors, strings.TrimSpace)
	if len(out) > MaxDesiredSectors {
		errs.add("desiredSectors", fmt.Sprintf("Choisissez au plus %d secteurs.", MaxDesiredSectors))
	}
	for _, sector := range out {
		if !sectorSlugPattern.MatchString(sector) {
			errs.add("desiredSectors", "Ce secteur n’existe pas.")
		}
	}
	return out
}

func normalizeSkills(errs fieldErrors, skills []string) []string {
	out := dedupe(skills, singleLine)
	if len(out) > MaxSkills {
		errs.add("skills", fmt.Sprintf("Indiquez au plus %d compétences.", MaxSkills))
	}
	for _, skill := range out {
		if checkText(skill, MaxSkillLength) != "" {
			errs.add("skills", fmt.Sprintf("Chaque compétence doit faire au plus %d caractères, sans caractères spéciaux.", MaxSkillLength))
		}
	}
	return out
}

func normalizeLanguages(errs fieldErrors, languages []Language) []Language {
	if len(languages) > MaxLanguages {
		errs.add("languages", fmt.Sprintf("Indiquez au plus %d langues.", MaxLanguages))
	}
	out := make([]Language, 0, len(languages))
	seen := map[string]bool{}
	for i, item := range languages {
		prefix := fmt.Sprintf("languages.%d.", i)
		name := requiredText(errs, prefix+"language", singleLine(item.Language), MaxLanguageLength)
		key := strings.ToLower(name)
		if name != "" && seen[key] {
			errs.add(prefix+"language", "Cette langue est déjà dans la liste.")
		}
		seen[key] = true
		if !languageLevels[item.Level] {
			errs.add(prefix+"level", "Choisissez un niveau.")
		}
		out = append(out, Language{Language: name, Level: item.Level})
	}
	return out
}

func normalizeExperiences(errs fieldErrors, experiences []Experience, lastMonth time.Time) []Experience {
	if len(experiences) > MaxExperiences {
		errs.add("experiences", fmt.Sprintf("Indiquez au plus %d expériences.", MaxExperiences))
	}
	out := make([]Experience, 0, len(experiences))
	for i, item := range experiences {
		prefix := fmt.Sprintf("experiences.%d.", i)
		start, end := normalizePeriod(errs, prefix, item.StartMonth, item.EndMonth, lastMonth)
		out = append(out, Experience{
			Title:        requiredText(errs, prefix+"title", singleLine(item.Title), MaxLabelLength),
			Organization: requiredText(errs, prefix+"organization", singleLine(item.Organization), MaxLabelLength),
			City:         optionalText(errs, prefix+"city", singleLine(item.City), MaxCityLength),
			StartMonth:   start,
			EndMonth:     end,
			Description:  optionalText(errs, prefix+"description", multiLine(item.Description), MaxDescriptionLength),
		})
	}
	return out
}

func normalizeEducations(errs fieldErrors, educations []Education, lastMonth time.Time) []Education {
	if len(educations) > MaxEducations {
		errs.add("educations", fmt.Sprintf("Indiquez au plus %d formations.", MaxEducations))
	}
	out := make([]Education, 0, len(educations))
	for i, item := range educations {
		prefix := fmt.Sprintf("educations.%d.", i)
		start, end := normalizePeriod(errs, prefix, item.StartMonth, item.EndMonth, lastMonth)
		out = append(out, Education{
			Degree:      requiredText(errs, prefix+"degree", singleLine(item.Degree), MaxLabelLength),
			School:      requiredText(errs, prefix+"school", singleLine(item.School), MaxLabelLength),
			Field:       optionalText(errs, prefix+"field", singleLine(item.Field), MaxLabelLength),
			StartMonth:  start,
			EndMonth:    end,
			Description: optionalText(errs, prefix+"description", multiLine(item.Description), MaxDescriptionLength),
		})
	}
	return out
}

// normalizePeriod checks a start month and an optional end month (nil or blank: ongoing).
func normalizePeriod(errs fieldErrors, prefix, rawStart string, rawEnd *string, lastMonth time.Time) (string, *string) {
	start := strings.TrimSpace(rawStart)
	startMonth, message := checkMonth(start, lastMonth)
	if start == "" {
		message = "Indiquez le mois de début."
	}
	errs.add(prefix+"startMonth", message)

	if rawEnd == nil || strings.TrimSpace(*rawEnd) == "" {
		return start, nil
	}
	end := strings.TrimSpace(*rawEnd)
	endMonth, message := checkMonth(end, lastMonth)
	if message == "" && !startMonth.IsZero() && endMonth.Before(startMonth) {
		message = "La fin doit être après le début."
	}
	errs.add(prefix+"endMonth", message)
	return start, &end
}

// checkMonth parses a "YYYY-MM" month no older than minYear and not after lastMonth.
func checkMonth(raw string, lastMonth time.Time) (time.Time, string) {
	month, ok := parseMonth(raw)
	switch {
	case !ok:
		return time.Time{}, msgMonthFormat
	case month.Year() < minYear:
		return time.Time{}, fmt.Sprintf("Indiquez une date à partir de %d.", minYear)
	case month.After(lastMonth):
		return time.Time{}, "Cette date est dans le futur."
	}
	return month, ""
}

// parseMonth reads "YYYY-MM" as the first day of that month (UTC).
func parseMonth(raw string) (time.Time, bool) {
	if len(raw) != len(monthLayout) {
		return time.Time{}, false
	}
	month, err := time.Parse(monthLayout, raw)
	return month, err == nil
}

func formatMonth(month time.Time) string {
	return month.Format(monthLayout)
}

func requiredText(errs fieldErrors, field, value string, maxLength int) string {
	if value == "" {
		errs.add(field, msgRequired)
		return value
	}
	return optionalText(errs, field, value, maxLength)
}

func optionalText(errs fieldErrors, field, value string, maxLength int) string {
	errs.add(field, checkText(value, maxLength))
	return value
}

// checkText bounds the length in characters and rejects control characters other than newlines
// and tabs (which singleLine already turns into spaces in single-line fields).
func checkText(value string, maxLength int) string {
	if !utf8.ValidString(value) {
		return msgForbiddenChars
	}
	if utf8.RuneCountInString(value) > maxLength {
		return fmt.Sprintf("Ce champ ne peut pas dépasser %d caractères.", maxLength)
	}
	forbidden := func(r rune) bool {
		return unicode.IsControl(r) && r != '\n' && r != '\t'
	}
	if strings.ContainsFunc(value, forbidden) {
		return msgForbiddenChars
	}
	return ""
}

// singleLine trims and collapses whitespace ("  Chef   de projet " → "Chef de projet").
func singleLine(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

// multiLine keeps line breaks (normalized to \n) and trims the text as a whole.
func multiLine(value string) string {
	return strings.TrimSpace(strings.NewReplacer("\r\n", "\n", "\r", "\n").Replace(value))
}

// dedupe normalizes items, drops blanks and keeps the first of case-insensitive duplicates.
func dedupe(items []string, normalize func(string) string) []string {
	out := make([]string, 0, len(items))
	seen := map[string]bool{}
	for _, item := range items {
		value := normalize(item)
		key := strings.ToLower(value)
		if value == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, value)
	}
	return out
}

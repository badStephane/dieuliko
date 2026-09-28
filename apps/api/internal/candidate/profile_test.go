package candidate

import "testing"

func TestProfileHasContent(t *testing.T) {
	tests := []struct {
		name    string
		profile Profile
		want    bool
	}{
		{"never filled in", Profile{}, false},
		{"only contact details", Profile{ProfileInput: ProfileInput{Phone: "+221771234567", City: "Dakar"}}, false},
		{"headline", Profile{ProfileInput: ProfileInput{Headline: "Comptable"}}, true},
		{"one experience", Profile{ProfileInput: ProfileInput{Experiences: []Experience{{Title: "Caissière"}}}}, true},
		{"one education", Profile{ProfileInput: ProfileInput{Educations: []Education{{Degree: "Licence"}}}}, true},
		{"one skill", Profile{ProfileInput: ProfileInput{Skills: []string{"Excel"}}}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.profile.HasContent(); got != tt.want {
				t.Errorf("HasContent() = %v, want %v", got, tt.want)
			}
		})
	}
}

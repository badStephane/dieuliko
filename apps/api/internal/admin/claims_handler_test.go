package admin

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// fakeClaimReviews records calls; err applies to every call.
type fakeClaimReviews struct {
	err       error
	gotStatus string
	gotID     uuid.UUID
	gotReason string
	decision  string
}

func (f *fakeClaimReviews) List(_ context.Context, status string, _, _ int) (ClaimPage, error) {
	f.gotStatus = status
	return ClaimPage{Items: []ClaimSummary{}}, f.err
}

func (f *fakeClaimReviews) Get(_ context.Context, id uuid.UUID) (ClaimDetail, error) {
	f.gotID = id
	return ClaimDetail{ClaimSummary: ClaimSummary{ID: id, Status: "pending"}}, f.err
}

func (f *fakeClaimReviews) Approve(_ context.Context, _, id uuid.UUID) (ClaimDetail, error) {
	f.gotID, f.decision = id, "approve"
	return ClaimDetail{ClaimSummary: ClaimSummary{ID: id, Status: "approved"}}, f.err
}

func (f *fakeClaimReviews) Reject(_ context.Context, _, id uuid.UUID, reason string) (ClaimDetail, error) {
	f.gotID, f.gotReason, f.decision = id, reason, "reject"
	return ClaimDetail{}, f.err
}

func (f *fakeClaimReviews) Revoke(_ context.Context, _, id uuid.UUID, reason string) (ClaimDetail, error) {
	f.gotID, f.gotReason, f.decision = id, reason, "revoke"
	return ClaimDetail{}, f.err
}

const claimPath = "/v1/admin/claims/00000000-0000-0000-0000-0000000000c1"

func TestClaimListDefaultsToThePendingQueueAndChecksTheStatus(t *testing.T) {
	claims := &fakeClaimReviews{}
	router := newRouter(Services{Claims: claims})

	if rec := send(router, http.MethodGet, "/v1/admin/claims", adminToken, ""); rec.Code != http.StatusOK || claims.gotStatus != "pending" {
		t.Errorf("status %d, listed %q", rec.Code, claims.gotStatus)
	}
	if rec := send(router, http.MethodGet, "/v1/admin/claims?status=approved", adminToken, ""); rec.Code != http.StatusOK || claims.gotStatus != "approved" {
		t.Errorf("status %d, listed %q", rec.Code, claims.gotStatus)
	}
	if rec := send(router, http.MethodGet, "/v1/admin/claims?status=all", adminToken, ""); rec.Code != http.StatusBadRequest {
		t.Errorf("unknown status: %d", rec.Code)
	}
}

func TestClaimRoutesAreForAdmins(t *testing.T) {
	rec := send(newRouter(Services{Claims: &fakeClaimReviews{}}), http.MethodGet, "/v1/admin/claims", candidateToken, "")

	if rec.Code != http.StatusForbidden {
		t.Errorf("status %d", rec.Code)
	}
}

func TestClaimDecisionsReachTheService(t *testing.T) {
	tests := []struct {
		path, body, decision, reason string
	}{
		{claimPath + "/approval", "", "approve", ""},
		{claimPath + "/rejection", `{"reason":"Fonction non vérifiable."}`, "reject", "Fonction non vérifiable."},
		{claimPath + "/revocation", `{"reason":"Départ."}`, "revoke", "Départ."},
	}
	for _, tt := range tests {
		t.Run(tt.decision, func(t *testing.T) {
			claims := &fakeClaimReviews{}

			rec := send(newRouter(Services{Claims: claims}), http.MethodPost, tt.path, adminToken, tt.body)

			if rec.Code != http.StatusOK || claims.decision != tt.decision || claims.gotReason != tt.reason || claims.gotID.String() != "00000000-0000-0000-0000-0000000000c1" {
				t.Errorf("status %d, service got %+v", rec.Code, claims)
			}
		})
	}
}

func TestClaimErrorsMapToStatusAndCode(t *testing.T) {
	tests := []struct {
		err    error
		status int
		code   string
	}{
		{ErrClaimNotFound, http.StatusNotFound, "not_found"},
		{ErrClaimNotPending, http.StatusConflict, CodeClaimNotPending},
		{ErrClaimNotApproved, http.StatusConflict, CodeClaimNotApproved},
		{ErrListingManaged, http.StatusConflict, CodeListingManaged},
		{&ValidationError{Fields: map[string]string{"reason": "x"}}, http.StatusUnprocessableEntity, "validation_failed"},
		{errors.New("database down"), http.StatusInternalServerError, "internal_error"},
	}
	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			rec := send(newRouter(Services{Claims: &fakeClaimReviews{err: tt.err}}), http.MethodPost, claimPath+"/approval", adminToken, "")

			if rec.Code != tt.status || !strings.Contains(rec.Body.String(), `"code":"`+tt.code+`"`) {
				t.Errorf("status %d, body %s", rec.Code, rec.Body)
			}
		})
	}
	if rec := send(newRouter(Services{Claims: &fakeClaimReviews{}}), http.MethodGet, "/v1/admin/claims/not-a-uuid", adminToken, ""); rec.Code != http.StatusNotFound {
		t.Errorf("malformed id: status %d", rec.Code)
	}
}

package main

import (
	"math"
	"testing"
)

func TestParseOpencodeQuota(t *testing.T) {
	quota, err := parseOpencodeQuota([]byte(`{"data":{"workspace":{"id":"org_test"},"go":{"rolling":{"percent":25,"limited":false,"resetsAt":1793778908000},"weekly":{"percent":60.5,"limited":false,"resetsAt":1794182400000},"monthly":{"percent":10,"limited":true,"resetsAt":1796292553000}}}}`))
	if err != nil {
		t.Fatal(err)
	}
	if quota.Account != "org_test" || quota.Plan != "Go" {
		t.Fatalf("unexpected identity: %+v", quota)
	}
	if quota.IsAPIKey {
		t.Fatal("a Go subscription must not be flagged as API-key billed")
	}
	if *quota.FiveHourRemain != .75 || math.Abs(*quota.WeeklyRemain-.395) > 1e-10 || *quota.MonthlyRemain != 0 {
		t.Fatalf("incorrect remaining quota: %+v", quota)
	}
	if *quota.FiveHourResetAt != 1793778908 || *quota.WeeklyResetAt != 1794182400 || *quota.MonthlyResetAt != 1796292553 {
		t.Fatal("reset timestamps must use seconds")
	}
}

func TestParseOpencodeQuotaFreeUser(t *testing.T) {
	quota, err := parseOpencodeQuota([]byte(`{"data":{"workspace":{"id":"org_free"},"budgets":[]}}`))
	if err != nil {
		t.Fatal(err)
	}
	if quota.Account != "org_free" || quota.Plan != "Free" || quota.IsAPIKey {
		t.Fatalf("unexpected identity: %+v", quota)
	}
	if quota.FiveHourRemain != nil || quota.WeeklyRemain != nil || quota.MonthlyRemain != nil {
		t.Fatal("a free account has no usage windows to report")
	}
}

func TestParseOpencodeQuotaUnauthenticated(t *testing.T) {
	quota, err := parseOpencodeQuota([]byte(`{"data":{"budgets":[]}}`))
	if err != nil {
		t.Fatal(err)
	}
	if quota.Account != "unauthenticated" || quota.Plan != "Unknown" || quota.IsAPIKey {
		t.Fatalf("unexpected identity: %+v", quota)
	}
}

func TestParseOpencodeQuotaMissingData(t *testing.T) {
	if _, err := parseOpencodeQuota([]byte(`not json`)); err == nil {
		t.Fatal("expected error for malformed JSON")
	}
	quota, err := parseOpencodeQuota([]byte(`{"data":{"workspace":{"id":"org_test"},"go":{"rolling":{"limited":false}}}}`))
	if err != nil {
		t.Fatal(err)
	}
	if quota.FiveHourRemain != nil || quota.WeeklyRemain != nil || quota.MonthlyRemain != nil {
		t.Fatal("missing windows must remain unknown")
	}
}

func TestParseOpencodeQuotaWithoutData(t *testing.T) {
	for _, output := range []string{`{"data":null}`, `{}`} {
		quota, err := parseOpencodeQuota([]byte(output))
		if err != nil {
			t.Fatalf("expected no error for %s: %v", output, err)
		}
		if quota.Account != "unauthenticated" || quota.Plan != "Unknown" || quota.IsAPIKey {
			t.Fatalf("unexpected identity for %s: %+v", output, quota)
		}
		if quota.FiveHourRemain != nil || quota.WeeklyRemain != nil || quota.MonthlyRemain != nil {
			t.Fatal("a response without data has no usage windows")
		}
	}
}

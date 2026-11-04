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
	if *quota.FiveHourRemain != .75 || math.Abs(*quota.WeeklyRemain-.395) > 1e-10 || *quota.MonthlyRemain != 0 {
		t.Fatalf("incorrect remaining quota: %+v", quota)
	}
	if *quota.FiveHourResetAt != 1793778908 || *quota.WeeklyResetAt != 1794182400 || *quota.MonthlyResetAt != 1796292553 {
		t.Fatal("reset timestamps must use seconds")
	}
}

func TestParseOpencodeQuotaMissingData(t *testing.T) {
	for _, output := range []string{`not json`, `{"data":null}`, `{"data":{"workspace":{"id":"org_test"},"go":null}}`, `{"data":{"go":{}}}`} {
		if _, err := parseOpencodeQuota([]byte(output)); err == nil {
			t.Fatalf("expected error for %s", output)
		}
	}
	quota, err := parseOpencodeQuota([]byte(`{"data":{"workspace":{"id":"org_test"},"go":{"rolling":{"limited":false}}}}`))
	if err != nil {
		t.Fatal(err)
	}
	if quota.FiveHourRemain != nil || quota.WeeklyRemain != nil || quota.MonthlyRemain != nil {
		t.Fatal("missing windows must remain unknown")
	}
}

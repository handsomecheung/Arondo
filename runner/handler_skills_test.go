package main

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestSkillInstallValidation(t *testing.T) {
	valid := skillsInstallRequest{Source: "owner/repo", Skill: "OpenDesign", Agents: []string{"codex", "claude-code", "opencode", "antigravity-cli", "pi"}}
	if err := validateSkillRequest(valid); err != nil {
		t.Fatal(err)
	}
	for _, modify := range []func(*skillsInstallRequest){
		func(r *skillsInstallRequest) { r.Source = "--all" },
		func(r *skillsInstallRequest) { r.Source = "owner/repo\n--all" },
		func(r *skillsInstallRequest) { r.Skill = "../escape" },
		func(r *skillsInstallRequest) { r.Skill = "*" },
		func(r *skillsInstallRequest) { r.Agents = []string{"claude"} },
		func(r *skillsInstallRequest) { r.Agents = []string{"codex", "codex"} },
		func(r *skillsInstallRequest) { r.Agents = nil },
	} {
		invalid := valid
		modify(&invalid)
		if validateSkillRequest(invalid) == nil {
			t.Fatalf("accepted invalid request: %+v", invalid)
		}
	}
}

func skillTestEnvironment(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("CLAUDE_CONFIG_DIR", filepath.Join(home, ".claude"))
	bin := t.TempDir()
	script := `#!/usr/bin/env bash
printf 'called\n' >> "$HOME/calls"
printf '%s\n' "$@" > "$HOME/args"
agent=""
while (( $# )); do
  if [[ "$1" == "--agent" ]]; then agent="$2"; fi
  shift
done
if [[ "$agent" == "claude-code" ]]; then
  printf 'fixture install failure\n' >&2
  exit 1
fi
printf '[{"name":"opendesign","status":"installed","path":"/fixture/opendesign"}]\n'
`
	if err := os.WriteFile(filepath.Join(bin, "npx"), []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	return home
}

func TestSkillInstallationUsesArgumentsAndContinuesAfterFailure(t *testing.T) {
	home := skillTestEnvironment(t)
	source := "/source with spaces/$(touch injected);repository"
	results := installSkills(skillsInstallRequest{Source: source, Skill: "OpenDesign", Agents: []string{"codex", "claude-code", "antigravity-cli"}}, make(chan struct{}))
	if len(results) != 3 || results[0].Status != "success" || results[1].Status != "failed" || results[2].Status != "success" {
		t.Fatalf("unexpected results: %+v", results)
	}
	if !strings.Contains(results[1].Output, "fixture install failure") {
		t.Fatal("lost failure output")
	}
	args, err := os.ReadFile(filepath.Join(home, "args"))
	if err != nil {
		t.Fatal(err)
	}
	expected := []string{"--yes", "skills@" + skillsCLIVersion, "add", source, "--skill", "OpenDesign", "--rename", "opendesign", "--global", "--agent", "antigravity-cli", "--yes", "--json"}
	if !reflect.DeepEqual(strings.Split(strings.TrimSuffix(string(args), "\n"), "\n"), expected) {
		t.Fatalf("unexpected arguments: %s", args)
	}
	if _, err := os.Stat(filepath.Join(home, "injected")); !os.IsNotExist(err) {
		t.Fatal("source was interpreted as shell code")
	}
}

func TestSkillInstallationPreservesExistingSkillAndSupportsReplacement(t *testing.T) {
	home := skillTestEnvironment(t)
	directory := filepath.Join(home, ".agents", "skills", "opendesign")
	if err := os.MkdirAll(directory, 0755); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(directory, "SKILL.md")
	if err := os.WriteFile(file, []byte("keep this"), 0644); err != nil {
		t.Fatal(err)
	}
	req := skillsInstallRequest{Source: "owner/repo", Skill: "OpenDesign", Agents: []string{"codex", "pi"}}
	for _, result := range installSkills(req, make(chan struct{})) {
		if result.Status != "skipped" || !strings.Contains(result.Output, "already exists") {
			t.Fatalf("unexpected result: %+v", result)
		}
	}
	data, err := os.ReadFile(file)
	if err != nil || string(data) != "keep this" {
		t.Fatal("existing skill changed")
	}
	if _, err := os.Stat(filepath.Join(home, "args")); !os.IsNotExist(err) {
		t.Fatal("CLI ran despite existing skill")
	}
	req.Replace = true
	for _, result := range installSkills(req, make(chan struct{})) {
		if result.Status != "success" {
			t.Fatalf("replacement failed: %+v", result)
		}
	}
}

func TestSharedSkillAgentsInstallOnlyOnce(t *testing.T) {
	home := skillTestEnvironment(t)
	req := skillsInstallRequest{Source: "owner/repo", Skill: "OpenDesign", Agents: []string{"opencode", "pi", "codex"}, Replace: true}
	results := installSkills(req, make(chan struct{}))
	if len(results) != 3 {
		t.Fatalf("unexpected results: %+v", results)
	}
	for _, result := range results {
		if result.Status != "success" {
			t.Fatalf("unexpected result: %+v", result)
		}
	}
	calls, err := os.ReadFile(filepath.Join(home, "calls"))
	if err != nil || string(calls) != "called\n" {
		t.Fatalf("shared agents invoked the CLI more than once: %q, %v", calls, err)
	}
}

func TestSkillInstallationLinksExistingCopyToNewAgents(t *testing.T) {
	home := skillTestEnvironment(t)
	canonical := filepath.Join(home, ".agents", "skills", "opendesign")
	if err := os.MkdirAll(canonical, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(canonical, "SKILL.md"), []byte("keep existing contents"), 0644); err != nil {
		t.Fatal(err)
	}
	req := skillsInstallRequest{Source: "owner/repo", Skill: "OpenDesign", Agents: []string{"codex", "claude-code", "antigravity-cli"}}
	results := installSkills(req, make(chan struct{}))
	if results[0].Status != "skipped" || results[1].Status != "success" || results[2].Status != "success" {
		t.Fatalf("unexpected results: %+v", results)
	}
	for _, agent := range req.Agents[1:] {
		link := filepath.Join(skillAgentPaths(home)[agent], "opendesign")
		target, err := os.Readlink(link)
		if err != nil || target != canonical {
			t.Fatalf("invalid link for %s: %q, %v", agent, target, err)
		}
	}
	for _, result := range installSkills(req, make(chan struct{})) {
		if result.Status != "skipped" {
			t.Fatalf("repeat installation was not skipped: %+v", result)
		}
	}
	data, err := os.ReadFile(filepath.Join(canonical, "SKILL.md"))
	if err != nil || string(data) != "keep existing contents" {
		t.Fatal("existing skill changed")
	}
	if _, err := os.Stat(filepath.Join(home, "calls")); !os.IsNotExist(err) {
		t.Fatal("CLI ran despite reusable existing skill")
	}
}

func TestExistingSkillDoesNotPreventInstallingOtherTargets(t *testing.T) {
	home := skillTestEnvironment(t)
	existing := filepath.Join(skillAgentPaths(home)["claude-code"], "opendesign")
	if err := os.MkdirAll(existing, 0755); err != nil {
		t.Fatal(err)
	}
	req := skillsInstallRequest{Source: "owner/repo", Skill: "OpenDesign", Agents: []string{"claude-code", "antigravity-cli"}}
	results := installSkills(req, make(chan struct{}))
	if results[0].Status != "skipped" || results[1].Status != "success" {
		t.Fatalf("unexpected results: %+v", results)
	}
}

func TestSkillInstallationRequiresSuccessfulCLIReport(t *testing.T) {
	skillTestEnvironment(t)
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "npx"), []byte("#!/usr/bin/env bash\nprintf '[]\\n'\n"), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	results := installSkills(skillsInstallRequest{Source: "owner/repo", Skill: "opendesign", Agents: []string{"codex"}}, make(chan struct{}))
	if results[0].Status != "failed" {
		t.Fatal("empty successful CLI exit was accepted")
	}
}

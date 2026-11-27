package git

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// globalRepo points git's global config at a file inside the test's temp dir.
func globalRepo(t *testing.T) (Repo, string) {
	t.Helper()
	isolate(t)
	file := filepath.Join(t.TempDir(), "gitconfig")
	t.Setenv("GIT_CONFIG_GLOBAL", file)
	return Repo{Root: t.TempDir()}, file
}

func TestGlobalConfigMissingFileIsEmpty(t *testing.T) {
	r, _ := globalRepo(t)
	v, err := r.Config(ctx, ConfigGlobal)
	if err != nil || len(v) != 0 {
		t.Fatalf("config = %v, %v", v, err)
	}
}

func TestSetAndReadGlobalConfig(t *testing.T) {
	r, file := globalRepo(t)
	for key, value := range map[string]string{
		"user.name":          "Mira Okafor",
		"user.email":         "mira@acme.dev",
		"init.defaultBranch": "main",
		"pull.rebase":        "true",
		"core.autocrlf":      "input",
	} {
		if err := r.SetConfig(ctx, ConfigGlobal, key, value); err != nil {
			t.Fatalf("set %s: %v", key, err)
		}
	}
	v, err := r.Config(ctx, ConfigGlobal)
	if err != nil {
		t.Fatal(err)
	}
	if v["user.name"] != "Mira Okafor" || v["user.email"] != "mira@acme.dev" || v["pull.rebase"] != "true" || v["core.autocrlf"] != "input" {
		t.Errorf("values = %v", v)
	}
	if b, _ := os.ReadFile(file); !strings.Contains(string(b), "Mira Okafor") {
		t.Errorf("should have written %s: %q", file, b)
	}

	// an empty value removes the key, and removing one that is not set is fine
	if err := r.SetConfig(ctx, ConfigGlobal, "pull.rebase", ""); err != nil {
		t.Fatal(err)
	}
	if err := r.SetConfig(ctx, ConfigGlobal, "push.autoSetupRemote", ""); err != nil {
		t.Errorf("unsetting a key that is not set: %v", err)
	}
	if v, _ := r.Config(ctx, ConfigGlobal); v["pull.rebase"] != "" || len(v) != 4 {
		t.Errorf("after unset = %v", v)
	}
}

func TestConfigIgnoresKeysOutsideTheAllowlist(t *testing.T) {
	r, file := globalRepo(t)
	os.WriteFile(file, []byte("[alias]\n\tx = !echo hi\n[core]\n\tsshCommand = evil\n[user]\n\tname = Me\n"), 0o644)
	v, err := r.Config(ctx, ConfigGlobal)
	if err != nil {
		t.Fatal(err)
	}
	if len(v) != 1 || v["user.name"] != "Me" {
		t.Errorf("only allowed keys should be listed: %v", v)
	}
}

func TestSetConfigRefusesDangerousAndInvalid(t *testing.T) {
	r, file := globalRepo(t)
	for _, key := range []string{"alias.x", "core.sshCommand", "core.hooksPath", "core.fsmonitor", "credential.helper", "user.signingkey", "", "-x", "user.name --unset"} {
		if err := r.SetConfig(ctx, ConfigGlobal, key, "!rm -rf ~"); err == nil || !strings.Contains(err.Error(), "cannot be changed") {
			t.Errorf("SetConfig(%q) = %v, want refusal", key, err)
		}
	}
	if err := r.SetConfig(ctx, ConfigGlobal, "pull.rebase", "maybe"); err == nil || !strings.Contains(err.Error(), "must be one of") {
		t.Errorf("bad enum = %v", err)
	}
	if err := r.SetConfig(ctx, ConfigGlobal, "user.name", "a\nb"); err == nil {
		t.Error("a value with a line break must be refused")
	}
	if err := r.SetConfig(ctx, "system", "user.name", "x"); err == nil {
		t.Error("the system scope must be refused")
	}
	if b, _ := os.ReadFile(file); len(b) != 0 {
		t.Errorf("a refused write must leave the file alone: %q", b)
	}
}

func TestLocalConfigOverridesGlobal(t *testing.T) {
	r, dir := newRepo(t)
	t.Setenv("GIT_CONFIG_GLOBAL", filepath.Join(t.TempDir(), "gitconfig"))
	if err := r.SetConfig(ctx, ConfigGlobal, "user.name", "Global Name"); err != nil {
		t.Fatal(err)
	}
	if err := r.SetConfig(ctx, ConfigLocal, "user.name", "Repo Name"); err != nil {
		t.Fatal(err)
	}
	if got := sh(t, dir, "config", "user.name"); got != "Repo Name" {
		t.Errorf("effective name = %q", got)
	}
	g, _ := r.Config(ctx, ConfigGlobal)
	l, _ := r.Config(ctx, ConfigLocal)
	if g["user.name"] != "Global Name" || l["user.name"] != "Repo Name" {
		t.Errorf("global = %v, local = %v", g, l)
	}
}

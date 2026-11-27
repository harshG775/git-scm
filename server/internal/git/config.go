package git

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Config scopes the API exposes. System config is never touched.
const (
	ConfigGlobal = "global"
	ConfigLocal  = "local"
)

// ConfigKeys are the only keys the API reads or writes. Anything else is refused, because some git
// config values run programs (alias.* with "!", core.sshCommand, core.hooksPath, core.fsmonitor,
// credential.helper): letting a web page set them would be remote code execution.
// An empty list of choices means free text.
var ConfigKeys = map[string][]string{
	"user.name":            nil,
	"user.email":           nil,
	"init.defaultBranch":   nil,
	"pull.rebase":          {"true", "false"},
	"push.autoSetupRemote": {"true", "false"},
	"core.autocrlf":        {"true", "false", "input"},
}

var canonicalKey = func() map[string]string {
	m := map[string]string{}
	for k := range ConfigKeys {
		m[strings.ToLower(k)] = k
	}
	return m
}()

// ConfigValues holds the allowed keys that are set in one scope. Keys that are not set are absent.
type ConfigValues map[string]string

// GlobalRepo is a Repo for commands that do not belong to a project (global config). It runs in the
// home directory, so a repository there cannot change what --global means.
func GlobalRepo() Repo {
	if home, err := os.UserHomeDir(); err == nil {
		return Repo{Root: home}
	}
	return Repo{Root: os.TempDir()}
}

// GlobalConfigPath is the file global writes go to: $GIT_CONFIG_GLOBAL, else ~/.gitconfig.
func GlobalConfigPath() string {
	if p := os.Getenv("GIT_CONFIG_GLOBAL"); p != "" {
		return p
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".gitconfig")
}

func scopeFlag(scope string) (string, error) {
	switch scope {
	case ConfigGlobal, ConfigLocal:
		return "--" + scope, nil
	}
	return "", &Error{Msg: fmt.Sprintf("unknown config scope %q", scope)}
}

// Config reads the allowed keys that are set in one scope.
func (r Repo) Config(ctx context.Context, scope string) (ConfigValues, error) {
	flag, err := scopeFlag(scope)
	if err != nil {
		return nil, err
	}
	values := ConfigValues{}
	// --null: values may contain newlines; each record is "key\nvalue\0"
	res, err := r.run(ctx, opts{}, "config", flag, "--null", "--list")
	if err != nil {
		var ge *Error
		// no config file yet: git exits 128 ("unable to read config file ... No such file")
		if errors.As(err, &ge) && ge.Code == 128 && strings.Contains(ge.Msg, "No such file") {
			return values, nil
		}
		return nil, err
	}
	for _, rec := range strings.Split(string(res.out), "\x00") {
		key, value, _ := strings.Cut(rec, "\n")
		// git lists keys lower-cased ("init.defaultbranch"); report them under their usual spelling
		if name, ok := canonicalKey[strings.ToLower(key)]; ok {
			values[name] = value // the last one wins, as in git
		}
	}
	return values, nil
}

// SetConfig sets one allowed key in one scope; an empty value removes it.
func (r Repo) SetConfig(ctx context.Context, scope, key, value string) error {
	flag, err := scopeFlag(scope)
	if err != nil {
		return err
	}
	choices, ok := ConfigKeys[key]
	if !ok {
		return &Error{Msg: fmt.Sprintf("%q cannot be changed here", key)}
	}
	value = strings.TrimSpace(value)
	if strings.ContainsAny(value, "\n\r\x00") {
		return &Error{Msg: "a value cannot contain line breaks"}
	}
	if len(value) > 500 {
		return &Error{Msg: "that value is too long"}
	}
	if value == "" {
		_, err := r.git(ctx, "config", flag, "--unset-all", key)
		var ge *Error
		if errors.As(err, &ge) && ge.Code == 5 { // "key not present": already unset
			return nil
		}
		return err
	}
	if choices != nil {
		valid := false
		for _, c := range choices {
			valid = valid || c == value
		}
		if !valid {
			return &Error{Msg: fmt.Sprintf("%s must be one of: %s", key, strings.Join(choices, ", "))}
		}
	}
	// --replace-all collapses duplicates left by hand-editing; the key is a literal, never a regex
	_, err = r.git(ctx, "config", flag, "--replace-all", key, value)
	return err
}

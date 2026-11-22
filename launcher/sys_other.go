//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func documentsDir() string {
	if d := os.Getenv("DOOG_DOCS"); d != "" {
		return d
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Documents")
}

func fatal(msg string) {
	fmt.Fprintln(os.Stderr, msg)
	os.Exit(1)
}

func openWindow(url string) {
	if os.Getenv("DOOG_NO_BROWSER") != "" {
		fmt.Println("Serving at", url)
		return
	}
	for _, b := range []string{"microsoft-edge", "google-chrome", "chromium", "chromium-browser"} {
		if p, err := exec.LookPath(b); err == nil {
			if exec.Command(p, "--app="+url, "--user-data-dir="+filepath.Join(dataDir, "browser")).Start() == nil {
				return
			}
		}
	}
	exec.Command("xdg-open", url).Start()
}

func bambuPath() string { return "" }

func openPath(p, app string) error { return exec.Command("xdg-open", p).Start() }

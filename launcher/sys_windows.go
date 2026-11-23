//go:build windows

package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	shell32  = syscall.NewLazyDLL("shell32.dll")
	ole32    = syscall.NewLazyDLL("ole32.dll")
	user32   = syscall.NewLazyDLL("user32.dll")
	pSHGetKF = shell32.NewProc("SHGetKnownFolderPath")
	pCoFree  = ole32.NewProc("CoTaskMemFree")
	pMsgBox  = user32.NewProc("MessageBoxW")
)

// FOLDERID_Documents {FDD39AD0-238F-46AF-ADB4-6C85480369C7}
var folderDocuments = syscall.GUID{Data1: 0xFDD39AD0, Data2: 0x238F, Data3: 0x46AF, Data4: [8]byte{0xAD, 0xB4, 0x6C, 0x85, 0x48, 0x03, 0x69, 0xC7}}

func documentsDir() string {
	var p *uint16
	r, _, _ := pSHGetKF.Call(uintptr(unsafe.Pointer(&folderDocuments)), 0, 0, uintptr(unsafe.Pointer(&p)))
	if r == 0 && p != nil {
		defer pCoFree.Call(uintptr(unsafe.Pointer(p)))
		return syscall.UTF16ToString((*[1 << 15]uint16)(unsafe.Pointer(p))[:])
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Documents")
}

func fatal(msg string) {
	t, _ := syscall.UTF16PtrFromString("Velocity")
	m, _ := syscall.UTF16PtrFromString(msg)
	pMsgBox.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x10)
	os.Exit(1)
}

func firstExisting(paths ...string) string {
	for _, p := range paths {
		if p == "" {
			continue
		}
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}
	return ""
}

func browserPath() string {
	pf, pf86, lad := os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)"), os.Getenv("LOCALAPPDATA")
	return firstExisting(
		filepath.Join(pf86, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(lad, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(pf86, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(lad, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(pf, `BraveSoftware\Brave-Browser\Application\brave.exe`),
	)
}

func hide(c *exec.Cmd) *exec.Cmd {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return c
}

func openWindow(url string) {
	if b := browserPath(); b != "" {
		profile := filepath.Join(dataDir, "browser")
		c := exec.Command(b, "--app="+url, "--user-data-dir="+profile, "--no-first-run", "--no-default-browser-check",
			"--window-size=1600,960", "--disable-features=Translate", "--disable-background-timer-throttling")
		if c.Start() == nil {
			return
		}
	}
	hide(exec.Command("rundll32", "url.dll,FileProtocolHandler", url)).Start()
}

func bambuPath() string {
	pf, pf86 := os.Getenv("ProgramFiles"), os.Getenv("ProgramFiles(x86)")
	return firstExisting(
		filepath.Join(pf, `Bambu Studio\bambu-studio.exe`),
		filepath.Join(pf86, `Bambu Studio\bambu-studio.exe`),
	)
}

func openPath(p, app string) error {
	switch app {
	case "bambu":
		b := bambuPath()
		if b == "" {
			return errors.New("Bambu Studio not found")
		}
		return exec.Command(b, p).Start()
	case "folder":
		return exec.Command("explorer", "/select,", p).Start()
	default:
		return exec.Command("explorer", p).Start()
	}
}

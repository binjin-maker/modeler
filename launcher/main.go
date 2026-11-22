// DOOG Modeler launcher: keeps the app in sync with GitHub, serves it locally, opens it in an app window.
package main

import (
	"crypto/sha1"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	Repo            = "binjin-maker/modeler"
	Branch          = "main"
	LauncherVersion = 1
	DefaultPort     = 47823
	PollEvery       = 10 * time.Second
)

//go:embed loading.html
var loadingHTML []byte

type State struct {
	Sha          string            `json:"sha"`
	Etag         string            `json:"etag"`
	Dir          string            `json:"dir"`
	Files        map[string]string `json:"files"`
	LauncherBlob string            `json:"launcherBlob"`
}

var (
	dataDir, docsDir, exportsDir string
	state                        State
	stateMu                      sync.Mutex
	appDir                       atomic.Value // string
	port                         int
	status                       = &Status{State: "starting"}
	clients                      = map[chan string]bool{}
	clientsMu                    sync.Mutex
	lastClient                   atomic.Int64
	everConnected                atomic.Bool
	httpc                        = &http.Client{Timeout: 60 * time.Second}
)

type Status struct {
	mu       sync.Mutex
	State    string `json:"state"`
	Message  string `json:"message"`
	Done     int64  `json:"done"`
	Total    int64  `json:"total"`
	Ready    bool   `json:"ready"`
	Version  string `json:"version"`
	Launcher string `json:"launcher"`
}

func (s *Status) set(f func(*Status)) {
	s.mu.Lock()
	f(s)
	b, _ := json.Marshal(s)
	s.mu.Unlock()
	broadcast("status", string(b))
}
func (s *Status) json() []byte {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, _ := json.Marshal(s)
	return b
}

func main() {
	base, err := os.UserCacheDir()
	if err != nil {
		base = os.TempDir()
	}
	dataDir = filepath.Join(base, "DOOG Modeler")
	docsDir = filepath.Join(documentsDir(), "DOOG Modeler")
	exportsDir = filepath.Join(docsDir, "Exports")
	for _, d := range []string{dataDir, docsDir, exportsDir} {
		os.MkdirAll(d, 0o755)
	}
	cleanupOldExe()
	loadState()

	ln, p, existing := listen()
	if existing {
		openWindow(fmt.Sprintf("http://127.0.0.1:%d/", p))
		return
	}
	port = p
	if state.Dir != "" && dirExists(filepath.Join(dataDir, state.Dir)) {
		appDir.Store(filepath.Join(dataDir, state.Dir))
		status.set(func(s *Status) { s.Ready = true; s.State = "ready"; s.Version = state.Sha })
	} else {
		appDir.Store("")
	}
	go cleanupOldDirs()
	go updater()
	go watchdog()

	srv := &http.Server{Handler: guard(routes())}
	go openWindow(fmt.Sprintf("http://127.0.0.1:%d/", port))
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fatal("Server error: " + err.Error())
	}
}

func listen() (net.Listener, int, bool) {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", DefaultPort))
	if err == nil {
		return ln, DefaultPort, false
	}
	c := &http.Client{Timeout: 2 * time.Second}
	req, _ := http.NewRequest("GET", fmt.Sprintf("http://127.0.0.1:%d/api/ping", DefaultPort), nil)
	req.Header.Set("X-Modeler", "1")
	if r, err := c.Do(req); err == nil && r.StatusCode == 200 {
		r.Body.Close()
		return nil, DefaultPort, true
	}
	ln, err = net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fatal("Couldn't open a local port: " + err.Error())
	}
	return ln, ln.Addr().(*net.TCPAddr).Port, false
}

// ---------- state ----------
func loadState() {
	b, err := os.ReadFile(filepath.Join(dataDir, "state.json"))
	if err == nil {
		json.Unmarshal(b, &state)
	}
	if state.Files == nil {
		state.Files = map[string]string{}
	}
}
func saveState() {
	b, _ := json.MarshalIndent(state, "", " ")
	tmp := filepath.Join(dataDir, "state.json.tmp")
	if os.WriteFile(tmp, b, 0o644) == nil {
		os.Rename(tmp, filepath.Join(dataDir, "state.json"))
	}
}

// ---------- updater ----------
func updater() {
	backoff := PollEvery
	for {
		err := checkOnce()
		if err != nil {
			if appDir.Load().(string) == "" {
				status.set(func(s *Status) { s.State = "error"; s.Message = err.Error() })
			} else {
				status.set(func(s *Status) { s.State = "offline"; s.Message = err.Error() })
			}
			if strings.Contains(err.Error(), "rate limit") {
				backoff = 5 * time.Minute
			} else {
				backoff = 30 * time.Second
			}
		} else {
			backoff = PollEvery
		}
		time.Sleep(backoff)
	}
}

func ghGet(u string, accept string, etag string) (*http.Response, error) {
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("User-Agent", "DOOG-Modeler-Launcher")
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	if etag != "" {
		req.Header.Set("If-None-Match", etag)
	}
	if t := os.Getenv("DOOG_GITHUB_TOKEN"); t != "" && strings.Contains(u, "api.github.com") {
		req.Header.Set("Authorization", "Bearer "+t)
	}
	return httpc.Do(req)
}

func checkOnce() error {
	stateMu.Lock()
	etag := state.Etag
	if appDir.Load().(string) == "" {
		etag = ""
	}
	stateMu.Unlock()
	r, err := ghGet(fmt.Sprintf("https://api.github.com/repos/%s/commits/%s", Repo, Branch), "application/vnd.github.sha", etag)
	if err != nil {
		return fmt.Errorf("can't reach GitHub (%v)", shortErr(err))
	}
	defer r.Body.Close()
	if r.StatusCode == 304 {
		status.set(func(s *Status) {
			if s.State != "ready" && s.Ready {
				s.State = "ready"
				s.Message = ""
			}
		})
		return nil
	}
	if r.StatusCode == 403 || r.StatusCode == 429 {
		return errors.New("GitHub rate limit hit, retrying in a few minutes")
	}
	if r.StatusCode != 200 {
		return fmt.Errorf("GitHub said %s", r.Status)
	}
	b, _ := io.ReadAll(io.LimitReader(r.Body, 200))
	sha := strings.TrimSpace(string(b))
	newEtag := r.Header.Get("ETag")
	stateMu.Lock()
	same := sha == state.Sha && appDir.Load().(string) != ""
	stateMu.Unlock()
	if same {
		stateMu.Lock()
		state.Etag = newEtag
		saveState()
		stateMu.Unlock()
		return nil
	}
	if err := install(sha); err != nil {
		return err
	}
	stateMu.Lock()
	state.Etag = newEtag
	saveState()
	stateMu.Unlock()
	return nil
}

type treeEntry struct {
	Path string `json:"path"`
	Type string `json:"type"`
	Sha  string `json:"sha"`
	Size int64  `json:"size"`
}

func install(sha string) error {
	first := appDir.Load().(string) == ""
	status.set(func(s *Status) {
		s.State = "updating"
		s.Message = "Downloading update…"
		if first {
			s.Message = "Downloading DOOG Modeler (first launch)…"
		}
	})
	r, err := ghGet(fmt.Sprintf("https://api.github.com/repos/%s/git/trees/%s?recursive=1", Repo, sha), "application/vnd.github+json", "")
	if err != nil {
		return fmt.Errorf("can't reach GitHub (%v)", shortErr(err))
	}
	defer r.Body.Close()
	if r.StatusCode == 403 || r.StatusCode == 429 {
		return errors.New("GitHub rate limit hit, retrying in a few minutes")
	}
	if r.StatusCode != 200 {
		return fmt.Errorf("GitHub tree request failed: %s", r.Status)
	}
	var tree struct {
		Tree      []treeEntry `json:"tree"`
		Truncated bool        `json:"truncated"`
	}
	if err := json.NewDecoder(r.Body).Decode(&tree); err != nil {
		return fmt.Errorf("bad tree data: %v", err)
	}
	var files []treeEntry
	var launcherVer, launcherExe *treeEntry
	for i := range tree.Tree {
		e := tree.Tree[i]
		if e.Type != "blob" {
			continue
		}
		if strings.HasPrefix(e.Path, "app/") {
			files = append(files, e)
		}
		if e.Path == "dist/launcher-version.txt" {
			launcherVer = &tree.Tree[i]
		}
		if e.Path == "dist/Modeler.ex_" {
			launcherExe = &tree.Tree[i]
		}
	}
	if len(files) == 0 {
		return errors.New("update has no app files")
	}
	cur := appDir.Load().(string)
	newDir := filepath.Join(dataDir, "app-"+sha[:12])
	os.RemoveAll(newDir)
	var total int64
	var need []treeEntry
	for _, f := range files {
		rel := strings.TrimPrefix(f.Path, "app/")
		dst := filepath.Join(newDir, filepath.FromSlash(rel))
		os.MkdirAll(filepath.Dir(dst), 0o755)
		if cur != "" && state.Files[f.Path] == f.Sha {
			src := filepath.Join(cur, filepath.FromSlash(rel))
			if linkOrCopy(src, dst) == nil {
				continue
			}
		}
		need = append(need, f)
		total += f.Size
	}
	status.set(func(s *Status) { s.Done = 0; s.Total = total })
	var done atomic.Int64
	errCh := make(chan error, len(need))
	sem := make(chan struct{}, 6)
	var wg sync.WaitGroup
	for _, f := range need {
		wg.Add(1)
		go func(f treeEntry) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			rel := strings.TrimPrefix(f.Path, "app/")
			dst := filepath.Join(newDir, filepath.FromSlash(rel))
			var err error
			for try := 0; try < 3; try++ {
				if err = downloadBlob(sha, f, dst, &done); err == nil {
					break
				}
				time.Sleep(time.Second)
			}
			if err != nil {
				errCh <- fmt.Errorf("%s: %v", rel, err)
			}
		}(f)
	}
	stop := make(chan bool)
	go func() {
		for {
			select {
			case <-stop:
				return
			case <-time.After(250 * time.Millisecond):
				d := done.Load()
				status.set(func(s *Status) { s.Done = d })
			}
		}
	}()
	wg.Wait()
	close(stop)
	close(errCh)
	if err := <-errCh; err != nil {
		os.RemoveAll(newDir)
		return fmt.Errorf("download failed: %v", err)
	}
	stateMu.Lock()
	state.Sha = sha
	state.Dir = filepath.Base(newDir)
	state.Files = map[string]string{}
	for _, f := range files {
		state.Files[f.Path] = f.Sha
	}
	saveState()
	stateMu.Unlock()
	appDir.Store(newDir)
	status.set(func(s *Status) { s.Ready = true; s.State = "ready"; s.Message = ""; s.Version = sha; s.Done = s.Total })
	if !first {
		broadcast("update", fmt.Sprintf(`{"version":%q}`, sha))
	} else {
		broadcast("ready", fmt.Sprintf(`{"version":%q}`, sha))
	}
	go func() { time.Sleep(20 * time.Second); cleanupOldDirs() }()
	if launcherVer != nil && launcherExe != nil {
		go selfUpdate(sha, *launcherVer, *launcherExe)
	}
	return nil
}

func downloadBlob(sha string, f treeEntry, dst string, done *atomic.Int64) error {
	parts := strings.Split(f.Path, "/")
	for i, p := range parts {
		parts[i] = url.PathEscape(p)
	}
	u := fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/%s", Repo, sha, strings.Join(parts, "/"))
	r, err := ghGet(u, "", "")
	if err != nil {
		return shortErr(err)
	}
	defer r.Body.Close()
	if r.StatusCode != 200 {
		return fmt.Errorf("HTTP %s", r.Status)
	}
	tmp := dst + ".part"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	h := sha1.New()
	fmt.Fprintf(h, "blob %d\x00", f.Size)
	buf := make([]byte, 64*1024)
	var n int64
	for {
		k, rerr := r.Body.Read(buf)
		if k > 0 {
			out.Write(buf[:k])
			h.Write(buf[:k])
			n += int64(k)
			done.Add(int64(k))
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			out.Close()
			done.Add(-n)
			return rerr
		}
	}
	out.Close()
	if hex.EncodeToString(h.Sum(nil)) != f.Sha {
		os.Remove(tmp)
		done.Add(-n)
		return errors.New("checksum mismatch")
	}
	return os.Rename(tmp, dst)
}

func selfUpdate(sha string, ver, exe treeEntry) {
	stateMu.Lock()
	known := state.LauncherBlob == ver.Sha
	stateMu.Unlock()
	if known {
		return
	}
	r, err := ghGet(fmt.Sprintf("https://raw.githubusercontent.com/%s/%s/dist/launcher-version.txt", Repo, sha), "", "")
	if err != nil {
		return
	}
	b, _ := io.ReadAll(io.LimitReader(r.Body, 64))
	r.Body.Close()
	v, err := strconv.Atoi(strings.TrimSpace(string(b)))
	if err != nil {
		return
	}
	if v > LauncherVersion {
		self, err := os.Executable()
		if err != nil {
			return
		}
		var dummy atomic.Int64
		newPath := self + ".new"
		if err := downloadBlob(sha, treeEntry{Path: exe.Path, Sha: exe.Sha, Size: exe.Size}, newPath, &dummy); err != nil {
			return
		}
		os.Remove(self + ".old")
		if err := os.Rename(self, self+".old"); err != nil {
			os.Remove(newPath)
			return
		}
		if err := os.Rename(newPath, self); err != nil {
			os.Rename(self+".old", self)
			return
		}
		status.set(func(s *Status) { s.Launcher = "updated" })
	}
	stateMu.Lock()
	state.LauncherBlob = ver.Sha
	saveState()
	stateMu.Unlock()
}

func cleanupOldExe() {
	if self, err := os.Executable(); err == nil {
		os.Remove(self + ".old")
		os.Remove(self + ".new")
	}
}

func cleanupOldDirs() {
	cur := filepath.Base(appDir.Load().(string))
	entries, _ := os.ReadDir(dataDir)
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), "app-") && e.Name() != cur {
			os.RemoveAll(filepath.Join(dataDir, e.Name()))
		}
	}
}

func linkOrCopy(src, dst string) error {
	if _, err := os.Stat(src); err != nil {
		return err
	}
	if os.Link(src, dst) == nil {
		return nil
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	out.Close()
	return err
}

func dirExists(p string) bool { st, err := os.Stat(p); return err == nil && st.IsDir() }

func shortErr(err error) error {
	s := err.Error()
	if len(s) > 120 {
		s = s[:120] + "…"
	}
	return errors.New(s)
}

// ---------- lifetime ----------
func watchdog() {
	start := time.Now()
	for {
		time.Sleep(3 * time.Second)
		clientsMu.Lock()
		n := len(clients)
		clientsMu.Unlock()
		if n > 0 {
			lastClient.Store(time.Now().UnixNano())
			continue
		}
		if everConnected.Load() {
			if time.Since(time.Unix(0, lastClient.Load())) > 15*time.Second {
				os.Exit(0)
			}
		} else if time.Since(start) > 10*time.Minute {
			os.Exit(0)
		}
	}
}

// ---------- events ----------
func broadcast(event, data string) {
	clientsMu.Lock()
	defer clientsMu.Unlock()
	msg := fmt.Sprintf("event: %s\ndata: %s\n\n", event, data)
	for c := range clients {
		select {
		case c <- msg:
		default:
		}
	}
}

// ---------- http ----------
func guard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host := r.Host
		if host != fmt.Sprintf("127.0.0.1:%d", port) && host != fmt.Sprintf("localhost:%d", port) {
			http.Error(w, "bad host", 403)
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") && r.URL.Path != "/api/events" && r.Header.Get("X-Modeler") != "1" {
			http.Error(w, "forbidden", 403)
			return
		}
		next.ServeHTTP(w, r)
	})
}

var safeName = regexp.MustCompile(`[\\/:*?"<>|\x00-\x1f]+`)

func cleanName(n string) string {
	n = strings.TrimSpace(safeName.ReplaceAllString(n, "_"))
	n = strings.Trim(n, ". ")
	if n == "" {
		n = "Untitled"
	}
	if len(n) > 120 {
		n = n[:120]
	}
	return n
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func routes() http.Handler {
	for ext, t := range map[string]string{".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".wasm": "application/wasm", ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png"} {
		mime.AddExtensionType(ext, t)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"version": state.Sha, "launcher": LauncherVersion, "bambu": bambuPath() != "", "docs": docsDir})
	})
	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write(status.json())
	})
	mux.HandleFunc("/api/heartbeat", func(w http.ResponseWriter, r *http.Request) {
		lastClient.Store(time.Now().UnixNano())
		w.WriteHeader(204)
	})
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		fl, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "no stream", 500)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		c := make(chan string, 8)
		clientsMu.Lock()
		clients[c] = true
		clientsMu.Unlock()
		everConnected.Store(true)
		defer func() {
			clientsMu.Lock()
			delete(clients, c)
			clientsMu.Unlock()
			lastClient.Store(time.Now().UnixNano())
		}()
		fmt.Fprintf(w, "event: status\ndata: %s\n\n", status.json())
		fl.Flush()
		tick := time.NewTicker(20 * time.Second)
		defer tick.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case m := <-c:
				fmt.Fprint(w, m)
				fl.Flush()
			case <-tick.C:
				fmt.Fprint(w, ": ping\n\n")
				fl.Flush()
			}
		}
	})
	mux.HandleFunc("/api/projects", func(w http.ResponseWriter, r *http.Request) {
		type item struct {
			Name     string `json:"name"`
			Modified int64  `json:"modified"`
		}
		list := []item{}
		entries, _ := os.ReadDir(docsDir)
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(strings.ToLower(e.Name()), ".dmodel") {
				continue
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			list = append(list, item{strings.TrimSuffix(e.Name(), filepath.Ext(e.Name())), info.ModTime().UnixMilli()})
		}
		sort.Slice(list, func(i, j int) bool { return list[i].Modified > list[j].Modified })
		writeJSON(w, list)
	})
	mux.HandleFunc("/api/project", func(w http.ResponseWriter, r *http.Request) {
		p := filepath.Join(docsDir, cleanName(r.URL.Query().Get("name"))+".dmodel")
		switch r.Method {
		case "GET":
			b, err := os.ReadFile(p)
			if err != nil {
				http.Error(w, "not found", 404)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.Write(b)
		case "POST":
			b, err := io.ReadAll(io.LimitReader(r.Body, 200<<20))
			if err != nil || !json.Valid(b) {
				http.Error(w, "bad data", 400)
				return
			}
			if os.WriteFile(p+".tmp", b, 0o644) != nil || os.Rename(p+".tmp", p) != nil {
				http.Error(w, "couldn't write file", 500)
				return
			}
			w.WriteHeader(204)
		case "DELETE":
			os.Remove(p)
			w.WriteHeader(204)
		}
	})
	mux.HandleFunc("/api/autosave", func(w http.ResponseWriter, r *http.Request) {
		p := filepath.Join(dataDir, "autosave.json")
		if r.Method == "POST" {
			b, err := io.ReadAll(io.LimitReader(r.Body, 200<<20))
			if err == nil && json.Valid(b) {
				os.WriteFile(p+".tmp", b, 0o644)
				os.Rename(p+".tmp", p)
			}
			w.WriteHeader(204)
			return
		}
		b, err := os.ReadFile(p)
		if err != nil {
			http.Error(w, "none", 404)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	})
	mux.HandleFunc("/api/export", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "POST only", 405)
			return
		}
		name := cleanName(r.URL.Query().Get("name"))
		p := filepath.Join(exportsDir, name)
		out, err := os.Create(p)
		if err != nil {
			http.Error(w, "couldn't write file (is it open in another program?)", 500)
			return
		}
		_, err = io.Copy(out, io.LimitReader(r.Body, 1<<30))
		out.Close()
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		writeJSON(w, map[string]string{"path": p})
	})
	mux.HandleFunc("/api/open", func(w http.ResponseWriter, r *http.Request) {
		app := r.URL.Query().Get("app")
		if app == "docs" {
			openPath(docsDir, "")
			w.WriteHeader(204)
			return
		}
		p := filepath.Clean(r.URL.Query().Get("path"))
		if !strings.HasPrefix(strings.ToLower(p), strings.ToLower(docsDir)+string(os.PathSeparator)) {
			http.Error(w, "not allowed", 403)
			return
		}
		if err := openPath(p, app); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		w.WriteHeader(204)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		dir := appDir.Load().(string)
		w.Header().Set("Cache-Control", "no-cache")
		if dir == "" {
			if r.URL.Path == "/" || r.URL.Path == "/index.html" {
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.Write(loadingHTML)
				return
			}
			http.Error(w, "not ready", 503)
			return
		}
		rel := path.Clean("/" + r.URL.Path)
		if rel == "/" {
			rel = "/index.html"
		}
		http.ServeFile(w, r, filepath.Join(dir, filepath.FromSlash(rel)))
	})
	return mux
}

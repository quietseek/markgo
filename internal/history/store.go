// Package history stores article metadata and ACP session references, never messages.
package history

import (
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
	_ "modernc.org/sqlite"
)

type Store struct{ db *sql.DB }

type Document struct {
	ID        string   `json:"id"`
	Path      string   `json:"path"`
	Title     string   `json:"title" yaml:"title"`
	Slug      string   `json:"slug" yaml:"slug"`
	Summary   string   `json:"summary" yaml:"summary"`
	Category  string   `json:"category" yaml:"category"`
	Status    string   `json:"status" yaml:"status"`
	Theme     string   `json:"theme" yaml:"theme"`
	Tags      []string `json:"tags" yaml:"tags"`
	UpdatedAt string   `json:"updatedAt" yaml:"updated_at"`
}

type Conversation struct {
	ID               string `json:"id"`
	DocumentID       string `json:"documentId"`
	Title            string `json:"title"`
	AgentID          string `json:"agentId"`
	SessionID        string `json:"sessionId"`
	WorkingDirectory string `json:"workingDirectory"`
	CreatedAt        string `json:"createdAt"`
	UpdatedAt        string `json:"updatedAt"`
}

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// A single shared connection keeps transactions and connection-scoped pragmas simple.
	db.SetMaxOpenConns(1)
	var version int
	if err = db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil || version > 1 {
		db.Close()
		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("history database version %d is newer than this app supports", version)
	}
	_, err = db.Exec(`PRAGMA busy_timeout=5000;
PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS documents (
 id TEXT PRIMARY KEY NOT NULL, path TEXT UNIQUE, title TEXT NOT NULL,
 slug TEXT, summary TEXT, category TEXT, status TEXT, theme TEXT,
 tags TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags) AND json_type(tags)='array'), updated_at TEXT
);
CREATE TABLE IF NOT EXISTS conversations (
 id TEXT PRIMARY KEY NOT NULL, document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
 title TEXT NOT NULL, agent_id TEXT NOT NULL, session_id TEXT, working_directory TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_document_updated ON conversations(document_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS documents_status ON documents(status);
PRAGMA user_version=1;`)
	if err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func newID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	b[6], b[8] = (b[6]&0x0f)|0x40, (b[8]&0x3f)|0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func canonical(path string) string {
	p, err := filepath.Abs(path)
	if err == nil {
		path = p
	}
	path = filepath.Clean(path)
	if runtime.GOOS == "windows" {
		path = strings.ToLower(path)
	}
	return path
}

// Metadata reads only the leading YAML block. Invalid YAML never prevents editing
// an article; it falls back to its filename until the next successful save.
func Metadata(path, content string) Document {
	d := Document{Path: canonical(path), Tags: []string{}}
	lines := strings.Split(strings.ReplaceAll(strings.TrimPrefix(content, "\ufeff"), "\r\n", "\n"), "\n")
	if len(lines) > 0 && strings.TrimSpace(lines[0]) == "---" {
		for i := 1; i < len(lines); i++ {
			if strings.TrimSpace(lines[i]) == "---" || strings.TrimSpace(lines[i]) == "..." {
				var meta Document
				if yaml.Unmarshal([]byte(strings.Join(lines[1:i], "\n")), &meta) == nil {
					meta.Path = d.Path
					d = meta
				}
				break
			}
		}
	}
	if d.Title == "" {
		d.Title = strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
	}
	tags := []string{}
	seen := map[string]bool{}
	for _, tag := range d.Tags {
		tag = strings.TrimSpace(tag)
		if tag != "" && !seen[tag] {
			tags = append(tags, tag)
			seen[tag] = true
		}
	}
	d.Tags = tags
	return d
}

func (s *Store) SyncDocument(path, content string) (Document, error) {
	d := Metadata(path, content)
	d.ID = newID()
	tags, _ := json.Marshal(d.Tags)
	err := s.db.QueryRow(`INSERT INTO documents(id,path,title,slug,summary,category,status,theme,tags,updated_at)
VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET
title=excluded.title,slug=excluded.slug,summary=excluded.summary,category=excluded.category,
status=excluded.status,theme=excluded.theme,tags=excluded.tags,updated_at=excluded.updated_at RETURNING id`,
		d.ID, d.Path, d.Title, d.Slug, d.Summary, d.Category, d.Status, d.Theme, string(tags), d.UpdatedAt).Scan(&d.ID)
	return d, err
}

// MoveDocuments handles both single files and entire folders without changing IDs.
func (s *Store) MoveDocuments(from, to string) error {
	from, to = canonical(from), canonical(to)
	if from == to {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.Query(`SELECT id,path FROM documents WHERE path IS NOT NULL`)
	if err != nil {
		return err
	}
	type move struct{ id, path string }
	var moves []move
	for rows.Next() {
		var id, p string
		if err = rows.Scan(&id, &p); err != nil {
			rows.Close()
			return err
		}
		if p == from || strings.HasPrefix(p, from+string(filepath.Separator)) {
			moves = append(moves, move{id, to + strings.TrimPrefix(p, from)})
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, m := range moves {
		// A path can be reused after an external deletion or Save As overwrite.
		// Keep its old article/history identity detached instead of merging chats.
		if _, err = tx.Exec(`UPDATE documents SET path=NULL WHERE path=? AND id<>?`, m.path, m.id); err != nil {
			return err
		}
		if _, err = tx.Exec(`UPDATE documents SET path=? WHERE id=?`, m.path, m.id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) NewConversation(documentID, title, agentID, cwd string) (Conversation, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	c := Conversation{ID: newID(), DocumentID: documentID, Title: title, AgentID: agentID, WorkingDirectory: cwd, CreatedAt: now, UpdatedAt: now}
	_, err := s.db.Exec(`INSERT INTO conversations(id,document_id,title,agent_id,working_directory,created_at,updated_at) VALUES(?,NULLIF(?,''),?,?,?,?,?)`, c.ID, c.DocumentID, c.Title, c.AgentID, c.WorkingDirectory, now, now)
	return c, err
}

const conversationColumns = `id,COALESCE(document_id,''),title,agent_id,COALESCE(session_id,''),working_directory,created_at,updated_at`

func scanConversation(row interface{ Scan(...any) error }) (Conversation, error) {
	var c Conversation
	err := row.Scan(&c.ID, &c.DocumentID, &c.Title, &c.AgentID, &c.SessionID, &c.WorkingDirectory, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func (s *Store) Conversation(id string) (Conversation, error) {
	return scanConversation(s.db.QueryRow(`SELECT `+conversationColumns+` FROM conversations WHERE id=?`, id))
}

func (s *Store) Conversations(documentID string) ([]Conversation, error) {
	rows, err := s.db.Query(`SELECT `+conversationColumns+` FROM conversations WHERE document_id=? ORDER BY updated_at DESC,id`, documentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Conversation{}
	for rows.Next() {
		c, err := scanConversation(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}

func (s *Store) SetSession(id, sessionID string) error {
	_, err := s.db.Exec(`UPDATE conversations SET session_id=?,updated_at=? WHERE id=?`, sessionID, time.Now().UTC().Format(time.RFC3339Nano), id)
	return err
}

func (s *Store) BindConversation(id, documentID string) error {
	_, err := s.db.Exec(`UPDATE conversations SET document_id=NULLIF(?,'') WHERE id=?`, documentID, id)
	return err
}

func (s *Store) DeleteConversation(id string) error {
	_, err := s.db.Exec(`DELETE FROM conversations WHERE id=?`, id)
	return err
}

// Keep session references when a file is deleted, but don't attach them to a
// different article that later reuses the same path.
func (s *Store) RemoveDocuments(path string) error {
	path = canonical(path)
	prefix := path + string(filepath.Separator)
	_, err := s.db.Exec(`DELETE FROM documents WHERE path=? OR substr(path,1,length(?))=?`, path, prefix, prefix)
	return err
}

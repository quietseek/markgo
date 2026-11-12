package main

import (
	"context"
	"errors"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/quietseek/markgo/internal/acp"
	"github.com/quietseek/markgo/internal/history"
)

func (b *Bridge) historyStore() (*history.Store, error) {
	r := b.owner
	r.historyOnce.Do(func() {
		r.history, r.historyErr = history.Open(filepath.Join(r.store.Dir(), "history.db"))
	})
	return r.history, r.historyErr
}

// Index failures must never make a successfully written Markdown file look unsaved.
func (b *Bridge) indexDocument(path, content string) {
	s, err := b.historyStore()
	if err == nil {
		_, err = s.SyncDocument(path, content)
	}
	if err != nil {
		log.Printf("article index: %v", err)
	}
}

func (b *Bridge) HistoryDocument(path string) (history.Document, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return history.Document{}, err
	}
	s, err := b.historyStore()
	if err != nil {
		return history.Document{}, err
	}
	return s.SyncDocument(path, string(raw))
}

func (b *Bridge) HistoryList(documentID string) ([]history.Conversation, error) {
	s, err := b.historyStore()
	if err != nil {
		return nil, err
	}
	return s.Conversations(documentID)
}

func (b *Bridge) HistoryBind(ctx context.Context, id, path string) (history.Conversation, error) {
	b = b.session(ctx)
	if !b.chatMu.TryLock() {
		return history.Conversation{}, errors.New("请等待当前对话结束")
	}
	defer b.chatMu.Unlock()
	d, err := b.HistoryDocument(path)
	if err != nil {
		return history.Conversation{}, err
	}
	s, err := b.historyStore()
	if err != nil {
		return history.Conversation{}, err
	}
	if err = s.BindConversation(id, d.ID); err != nil {
		return history.Conversation{}, err
	}
	return s.Conversation(id)
}

func (b *Bridge) HistoryDelete(ctx context.Context, id string) error {
	b = b.session(ctx)
	if !b.chatMu.TryLock() {
		return errors.New("请等待当前对话结束")
	}
	defer b.chatMu.Unlock()
	s, err := b.historyStore()
	if err != nil {
		return err
	}
	return s.DeleteConversation(id)
}

type historyLoadResult struct {
	Conversation history.Conversation `json:"conversation"`
	Events       []acp.Event          `json:"events"`
}

func (b *Bridge) HistoryLoad(ctx context.Context, id string) (historyLoadResult, error) {
	b = b.session(ctx)
	if !b.chatMu.TryLock() {
		return historyLoadResult{}, errors.New("请等待当前对话结束")
	}
	defer b.chatMu.Unlock()
	s, err := b.historyStore()
	if err != nil {
		return historyLoadResult{}, err
	}
	c, err := s.Conversation(id)
	if err != nil {
		return historyLoadResult{}, err
	}
	cfg := b.store.Get()
	profile := cfg.ActiveAgent()
	if profile == nil || profile.ID != c.AgentID {
		return historyLoadResult{}, errors.New("请先切换到此对话使用的 Agent，再恢复对话")
	}
	events, err := b.acp.LoadSession("chat", c.SessionID, c.WorkingDirectory)
	return historyLoadResult{Conversation: c, Events: events}, err
}

func (b *Bridge) promptChat(input acp.PromptInput) promptResult {
	if !b.chatMu.TryLock() {
		return promptResult{Error: "请等待当前对话结束"}
	}
	defer b.chatMu.Unlock()
	s, err := b.historyStore()
	if err != nil {
		return promptResult{Error: err.Error()}
	}
	cfg := b.store.Get()
	profile := cfg.ActiveAgent()
	if profile == nil {
		return promptResult{Error: "请先配置 Agent"}
	}
	d, err := b.HistoryDocument(input.DocPath)
	if err != nil {
		return promptResult{Error: err.Error()}
	}
	var c history.Conversation
	if input.ConversationID != "" {
		c, err = s.Conversation(input.ConversationID)
		if err == nil && (c.AgentID != profile.ID || c.DocumentID != d.ID) {
			err = errors.New("对话与当前文章或 Agent 不匹配，请新建对话")
		}
	} else {
		title := strings.TrimSpace(input.Title)
		if title == "" {
			title = strings.TrimSpace(input.Text)
		}
		if r := []rune(title); len(r) > 60 {
			title = string(r[:60])
		}
		c, err = s.NewConversation(d.ID, title, profile.ID, b.agentCwd())
	}
	if err != nil {
		return promptResult{Error: err.Error()}
	}
	input.SessionID, input.WorkingDirectory, input.Fresh = c.SessionID, c.WorkingDirectory, c.SessionID == ""
	input.SessionCreated = func(id string) error {
		if err := s.SetSession(c.ID, id); err != nil {
			return err
		}
		c.SessionID = id
		return nil
	}
	stop, err := b.acp.Prompt(input)
	if c.SessionID != "" {
		if touchErr := s.SetSession(c.ID, c.SessionID); touchErr != nil {
			log.Printf("conversation timestamp: %v", touchErr)
		}
	}
	if saved, readErr := s.Conversation(c.ID); readErr == nil {
		c = saved
	}
	result := promptResult{OK: err == nil, StopReason: stop, Conversation: &c}
	if err != nil {
		result.Error = err.Error()
	}
	return result
}

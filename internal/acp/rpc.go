package acp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"sync"
)

// RPCError JSON-RPC 错误对象
type RPCError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

func (e *RPCError) Error() string { return e.Message }

type message struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *RPCError       `json:"error,omitempty"`
}

// Handler 处理对端发来的请求（返回结果）或通知（isNotification 为 true，返回值被忽略）
type Handler func(method string, params json.RawMessage, isNotification bool) (any, error)

// Conn 基于换行分隔 JSON（NDJSON）的 JSON-RPC 2.0 双向连接，即 ACP 的 stdio 传输
type Conn struct {
	w       io.Writer
	handler Handler

	writeMu sync.Mutex
	mu      sync.Mutex
	nextID  int64
	pending map[string]chan message
	closed  error
	done    chan struct{}
}

func NewConn(r io.Reader, w io.Writer, handler Handler) *Conn {
	c := &Conn{w: w, handler: handler, pending: map[string]chan message{}, done: make(chan struct{})}
	go c.readLoop(r)
	return c
}

// Done 在连接关闭后关闭
func (c *Conn) Done() <-chan struct{} { return c.done }

func (c *Conn) readLoop(r io.Reader) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64*1024), 64*1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var msg message
		if json.Unmarshal(line, &msg) != nil {
			continue
		}
		switch {
		case msg.Method != "" && msg.ID != nil:
			// 请求可能要等待用户操作（权限确认、审阅修改），不能阻塞后续消息
			go c.serve(msg)
		case msg.Method != "":
			// 通知按到达顺序同步处理，保证流式消息不乱序
			c.handler(msg.Method, msg.Params, true)
		case msg.ID != nil:
			c.mu.Lock()
			ch := c.pending[string(msg.ID)]
			delete(c.pending, string(msg.ID))
			c.mu.Unlock()
			if ch != nil {
				ch <- msg
			}
		}
	}
	// 读取出错（如单行超长）时连接已不可用；继续读空输出，避免 Agent 写满管道后卡住
	if err := sc.Err(); err != nil {
		c.Close(fmt.Errorf("读取 Agent 输出失败：%w", err))
		io.Copy(io.Discard, r)
	}
}

func (c *Conn) serve(msg message) {
	result, err := c.handler(msg.Method, msg.Params, false)
	reply := message{JSONRPC: "2.0", ID: msg.ID}
	if err != nil {
		var rpcErr *RPCError
		if !errors.As(err, &rpcErr) {
			rpcErr = &RPCError{Code: -32603, Message: err.Error()}
		}
		reply.Error = rpcErr
	} else {
		if result == nil {
			result = struct{}{}
		}
		reply.Result, _ = json.Marshal(result)
	}
	_ = c.write(reply)
}

func (c *Conn) write(msg message) error {
	raw, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_, err = c.w.Write(append(raw, '\n'))
	return err
}

// Request 发送请求并等待响应，结果解码到 out（可为 nil）
func (c *Conn) Request(ctx context.Context, method string, params, out any) error {
	raw, err := json.Marshal(params)
	if err != nil {
		return err
	}
	ch := make(chan message, 1)
	c.mu.Lock()
	if c.closed != nil {
		c.mu.Unlock()
		return c.closed
	}
	c.nextID++
	id := json.RawMessage(strconv.FormatInt(c.nextID, 10))
	c.pending[string(id)] = ch
	c.mu.Unlock()
	if err := c.write(message{JSONRPC: "2.0", ID: id, Method: method, Params: raw}); err != nil {
		c.forget(id)
		return fmt.Errorf("无法发送到 Agent：%w", err)
	}
	select {
	case msg := <-ch:
		if msg.Error != nil {
			return msg.Error
		}
		if out != nil && len(msg.Result) > 0 {
			return json.Unmarshal(msg.Result, out)
		}
		return nil
	case <-c.done:
		c.forget(id)
		return c.closed
	case <-ctx.Done():
		c.forget(id)
		return context.Cause(ctx)
	}
}

func (c *Conn) forget(id json.RawMessage) {
	c.mu.Lock()
	delete(c.pending, string(id))
	c.mu.Unlock()
}

func (c *Conn) Notify(method string, params any) error {
	raw, err := json.Marshal(params)
	if err != nil {
		return err
	}
	if c.Err() != nil {
		return c.Err()
	}
	return c.write(message{JSONRPC: "2.0", Method: method, Params: raw})
}

// Close 关闭连接，等待中的请求以 err 失败
func (c *Conn) Close(err error) {
	if err == nil {
		err = errors.New("连接已关闭")
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.closed != nil {
		return
	}
	c.closed = err
	close(c.done)
}

func (c *Conn) Err() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.closed
}

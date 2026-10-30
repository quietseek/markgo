package settings

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"strings"

	"github.com/zalando/go-keyring"
)

// SecretBox 在落盘前加密 AppSecret / API Key 等敏感字段
type SecretBox interface {
	Seal(secret string) string
	Open(stored string) string
}

const secretPrefix = "enc:"

type plainBox struct{}

func (plainBox) Seal(s string) string { return s }
func (plainBox) Open(s string) string {
	if strings.HasPrefix(s, secretPrefix) {
		return ""
	}
	return s
}

// keyringBox 用存放在系统钥匙串（macOS Keychain / Windows 凭据管理器 / Secret Service）中的
// 随机密钥做 AES-GCM 加密；钥匙串不可用时退化为明文
type keyringBox struct {
	aead cipher.AEAD
}

func NewKeyringBox(service string) SecretBox {
	const user = "settings-key"
	encoded, err := keyring.Get(service, user)
	key, decodeErr := base64.StdEncoding.DecodeString(encoded)
	if err != nil || decodeErr != nil || len(key) != 32 {
		key = make([]byte, 32)
		if _, err := rand.Read(key); err != nil {
			return plainBox{}
		}
		if keyring.Set(service, user, base64.StdEncoding.EncodeToString(key)) != nil {
			return plainBox{}
		}
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return plainBox{}
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return plainBox{}
	}
	return &keyringBox{aead: aead}
}

func (b *keyringBox) Seal(secret string) string {
	if secret == "" {
		return ""
	}
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return secret
	}
	return secretPrefix + base64.StdEncoding.EncodeToString(b.aead.Seal(nonce, nonce, []byte(secret), nil))
}

func (b *keyringBox) Open(stored string) string {
	if !strings.HasPrefix(stored, secretPrefix) {
		return stored
	}
	raw, err := base64.StdEncoding.DecodeString(stored[len(secretPrefix):])
	n := b.aead.NonceSize()
	if err != nil || len(raw) < n {
		return ""
	}
	plain, err := b.aead.Open(nil, raw[:n], raw[n:], nil)
	if err != nil {
		return ""
	}
	return string(plain)
}

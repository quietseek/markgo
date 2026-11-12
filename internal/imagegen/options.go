package imagegen

import (
	"fmt"
	"math"
	"strings"
)

// Request is transient: images and generated versions are not stored in settings.
type Request struct {
	Prompt  string   `json:"prompt"`
	Ratio   string   `json:"ratio,omitempty"`
	Quality string   `json:"quality,omitempty"`
	Mode    string   `json:"mode,omitempty"` // generate or edit; first image is the edit source
	Images  []string `json:"images,omitempty"`
}

type Ratio struct {
	Value string `json:"value"`
	Size  string `json:"size"`
}

type Capabilities struct {
	MaxImages int      `json:"maxImages"`
	Ratios    []Ratio  `json:"ratios"`
	Qualities []string `json:"qualities"`
}

func gptImage(provider, model string) bool {
	return (provider == "openai" || provider == "custom") && (strings.HasPrefix(model, "gpt-image-") || model == "chatgpt-image-latest")
}

func seedream(provider, model string) bool {
	return provider == "doubao" && (strings.HasPrefix(model, "doubao-seedream-4-") || strings.HasPrefix(model, "doubao-seedream-5-"))
}

// GetCapabilities is shared by UI discovery and request validation. Unknown
// models retain basic generation without guessing unsupported parameters.
func GetCapabilities(provider, model string) Capabilities {
	c := Capabilities{Ratios: []Ratio{{"auto", ""}}, Qualities: []string{}}
	add := func(ratios ...Ratio) { c.Ratios = append(c.Ratios, ratios...) }
	switch {
	case gptImage(provider, model):
		c.MaxImages = 4
		c.Qualities = []string{"auto", "low", "medium", "high"}
		add(Ratio{"1:1", "1024x1024"}, Ratio{"3:2", "1536x1024"}, Ratio{"2:3", "1024x1536"})
		if strings.HasPrefix(model, "gpt-image-2") {
			add(Ratio{"16:9", "1536x864"}, Ratio{"9:16", "864x1536"}, Ratio{"4:3", "1536x1152"}, Ratio{"3:4", "1152x1536"})
			add(Ratio{"4:5", "1024x1280"}, Ratio{"5:4", "1280x1024"}, Ratio{"21:9", "2016x864"}, Ratio{"9:21", "864x2016"})
		}
	case seedream(provider, model):
		c.MaxImages = 4
		add(Ratio{"1:1", "2048x2048"}, Ratio{"4:3", "2304x1728"}, Ratio{"3:4", "1728x2304"}, Ratio{"16:9", "2560x1440"}, Ratio{"9:16", "1440x2560"})
		add(Ratio{"3:2", "2496x1664"}, Ratio{"2:3", "1664x2496"}, Ratio{"4:5", "1792x2240"}, Ratio{"5:4", "2240x1792"}, Ratio{"21:9", "3024x1296"}, Ratio{"9:21", "1296x3024"})
	case (provider == "openai" || provider == "custom") && model == "dall-e-3":
		c.Qualities = []string{"standard", "hd"}
		add(Ratio{"1:1", "1024x1024"}, Ratio{"7:4", "1792x1024"}, Ratio{"4:7", "1024x1792"})
	case provider == "dashscope" && strings.HasPrefix(model, "wanx2.1-t2i-"):
		add(Ratio{"1:1", "1024*1024"}, Ratio{"16:9", "1280*720"}, Ratio{"9:16", "720*1280"})
	case provider == "zhipu" && model == "cogview-4":
		add(Ratio{"1:1", "1024x1024"}, Ratio{"16:9", "1280x720"}, Ratio{"9:16", "720x1280"})
	case provider == "siliconflow" && (model == "Kwai-Kolors/Kolors" || model == "black-forest-labs/FLUX.1-schnell"):
		add(Ratio{"1:1", "1024x1024"}, Ratio{"4:3", "1024x768"}, Ratio{"3:4", "768x1024"})
	}
	return c
}

func (c Capabilities) validate(r Request) error {
	if r.Mode != "" && r.Mode != "generate" && r.Mode != "edit" {
		return fmt.Errorf("不支持的图片操作")
	}
	if r.Mode == "edit" && len(r.Images) == 0 {
		return fmt.Errorf("请先添加要修改的图片")
	}
	if len(r.Images) > 0 && c.MaxImages == 0 {
		return fmt.Errorf("当前模型尚未适配参考图和改图，请在设置中选择 GPT Image 或 Seedream 4 / 5 模型")
	}
	if len(r.Images) > c.MaxImages {
		return fmt.Errorf("最多添加 %d 张图片（含原图）", c.MaxImages)
	}
	validRatio := r.Ratio == ""
	for _, ratio := range c.Ratios {
		validRatio = validRatio || ratio.Value == r.Ratio
	}
	if !validRatio {
		return fmt.Errorf("当前模型不支持所选画面比例")
	}
	validQuality := r.Quality == ""
	for _, quality := range c.Qualities {
		validQuality = validQuality || quality == r.Quality
	}
	if !validQuality {
		return fmt.Errorf("当前模型不支持所选画质")
	}
	return nil
}

func (c Capabilities) size(r Request, images []referenceImage) string {
	for _, ratio := range c.Ratios {
		if ratio.Value == r.Ratio && ratio.Value != "auto" {
			return ratio.Size
		}
	}
	// Editing defaults to the closest supported shape; never stretch the result.
	if r.Mode == "edit" && len(images) > 0 {
		shape := float64(images[0].width) / float64(images[0].height)
		best, distance := "", math.Inf(1)
		for _, ratio := range c.Ratios[1:] {
			var w, h float64
			fmt.Sscanf(ratio.Value, "%f:%f", &w, &h)
			if d := math.Abs(math.Log(w / h / shape)); d < distance {
				best, distance = ratio.Size, d
			}
		}
		return best
	}
	return ""
}

/**
 * 公众号排版主题 —— 移植自 MarkNice (https://github.com/willmove/marknice, MIT License)
 * Copyright (c) 2026 Willmove
 *
 * 样式全部以内联 style 形式写入（公众号会丢弃 <style> 与 class），
 * 本文件由 marknice/src/main.js 中的主题定义原样移植，仅补充了类型。
 */

export interface HeadingOptions {
  margin: string
  fontSize: number
  lineHeight: number
  fontWeight: number
  paddingLeft: number
  bgPadding: string
  bgRadius: number
  tailHeight: number
  tailWidth: number
}

interface TokenThemeInput {
  bodyFont: string
  text: string
  heading: string
  accent: string
  strong?: string
  quoteBg: string
  quoteBorder: string
  codeBg: string
  codeText?: string
  hr: string
  markBg?: string
  pageBg?: string
  pageBgSize?: string
  headingBg?: string
  headingText?: string
  headingVariant?: 'ribbon'
  headingTailBg?: string
  headingLine?: string
}

/** tokenHeadingStyle 需要的主题字段 */
export type TokenTheme = Pick<TokenThemeInput, 'accent' | 'heading' | 'headingBg' | 'headingText' | 'headingVariant' | 'headingLine'>

export interface Theme {
  section: string
  styles: Record<string, string>
  accent?: string
  heading?: string
  headingVariant?: 'ribbon'
  headingBg?: string
  headingText?: string
  headingTailBg?: string
  headingLine?: string
}

export function tokenHeadingOptions(tagName: string): HeadingOptions {
  return tagName === 'H1'
    ? {
      margin: '28px 0 18px',
      fontSize: 24,
      lineHeight: 1.4,
      fontWeight: 800,
      paddingLeft: 12,
      bgPadding: '8px 14px 7px',
      bgRadius: 3,
      tailHeight: 48,
      tailWidth: 26,
    }
    : {
      margin: '24px 0 14px',
      fontSize: 21,
      lineHeight: 1.45,
      fontWeight: 800,
      paddingLeft: 10,
      bgPadding: '7px 13px 6px',
      bgRadius: 3,
      tailHeight: 42,
      tailWidth: 23,
    };
}

export function tokenHeadingStyle(theme: TokenTheme, opts: HeadingOptions): string {
  if (theme.headingVariant === 'ribbon') {
    return `margin:${opts.margin};border-bottom:2px solid ${theme.headingLine || theme.accent};line-height:0;`;
  }
  if (theme.headingBg) {
    return `margin:${opts.margin};padding:${opts.bgPadding};background:${theme.headingBg};border-radius:${opts.bgRadius}px;color:${theme.headingText || theme.heading};font-size:${opts.fontSize}px;line-height:${opts.lineHeight};font-weight:${opts.fontWeight};box-shadow:0 10px 24px rgba(79,70,229,0.16);`;
  }
  return `margin:${opts.margin};padding-left:${opts.paddingLeft}px;border-left:4px solid ${theme.accent};font-size:${opts.fontSize}px;line-height:${opts.lineHeight};color:${theme.heading};font-weight:${opts.fontWeight};`;
}

function makeTokenTheme(theme: TokenThemeInput): Theme {
  const strongColor = theme.strong || theme.heading;
  const codeText = theme.codeText || theme.text;
  const pageBgStyle = theme.pageBg
    ? `background:${theme.pageBg};${theme.pageBgSize ? `background-size:${theme.pageBgSize};` : ''}padding:24px 20px;border-radius:8px;`
    : '';
  return {
    section: `font-family:${theme.bodyFont};font-size:16px;color:${theme.text};line-height:1.9;letter-spacing:0.5px;word-break:break-word;${pageBgStyle}`,
    headingVariant: theme.headingVariant,
    headingBg: theme.headingBg,
    headingText: theme.headingText,
    headingTailBg: theme.headingTailBg,
    headingLine: theme.headingLine,
    accent: theme.accent,
    styles: {
      p: `margin:16px 0;line-height:1.9;color:${theme.text};font-size:16px;word-break:break-word;text-align:justify;`,
      h1: tokenHeadingStyle(theme, tokenHeadingOptions('H1')),
      h2: tokenHeadingStyle(theme, tokenHeadingOptions('H2')),
      h3: `margin:20px 0 12px;font-size:18px;line-height:1.5;color:${theme.heading};font-weight:700;`,
      'h4,h5,h6': `margin:18px 0 10px;font-size:17px;line-height:1.6;color:${theme.heading};font-weight:600;`,
      blockquote: `margin:18px 0;padding:12px 16px;background:${theme.quoteBg};border-left:4px solid ${theme.quoteBorder};color:${theme.text};border-radius:6px;`,
      ul: `margin:14px 0 14px 1.2em;padding:0;color:${theme.text};line-height:1.9;`,
      ol: `margin:14px 0 14px 1.2em;padding:0;color:${theme.text};line-height:1.9;`,
      li: 'margin:6px 0;font-size:16px;',
      a: `color:${theme.accent};text-decoration:none;border-bottom:1px solid ${theme.accent};`,
      img: 'max-width:100%;height:auto;border-radius:8px;display:block;margin:20px auto;',
      pre: `margin:18px 0;padding:14px 16px;overflow:auto;background:${theme.codeBg};border-radius:8px;color:${codeText};font-family:Menlo,Consolas,monospace;font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;`,
      code: `font-family:Menlo,Consolas,monospace;background:${theme.codeBg};color:${theme.accent};display:inline;white-space:normal;padding:2px 6px;border-radius:4px;font-size:0.92em;`,
      'strong,b': `color:${strongColor};font-weight:700;`,
      mark: `background:${theme.markBg || theme.quoteBg};color:${theme.heading};padding:1px 4px;border-radius:3px;`,
      table: 'width:100%;border-collapse:collapse;margin:18px 0;font-size:14px;',
      th: `border:1px solid ${theme.hr};padding:8px 10px;background:${theme.quoteBg};font-weight:700;color:${theme.heading};text-align:left;`,
      td: `border:1px solid ${theme.hr};padding:8px 10px;color:${theme.text};`,
      hr: `border:none;border-top:1px solid ${theme.hr};margin:28px 0;`,
    }
  };
}

export const themes: Record<string, Theme> = {
  claude: makeTokenTheme({
    bodyFont: '-apple-system,BlinkMacSystemFont,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
    text: '#3d3929',
    heading: '#181815',
    accent: '#d97757',
    strong: '#c2613f',
    quoteBg: '#faf9f5',
    quoteBorder: '#d97757',
    codeBg: '#f5f4ef',
    hr: '#e8e6dc',
    markBg: '#f9e8e0',
  }),
  simple: { section: 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;word-break:break-word;color:#222;', styles: {
    h1:'font-size:24px;line-height:1.6;font-weight:700;margin:24px 0 16px;color:#111;',h2:'font-size:20px;line-height:1.6;font-weight:700;margin:22px 0 14px;color:#111;',h3:'font-size:17px;line-height:1.6;font-weight:700;margin:20px 0 12px;color:#222;',h4:'font-size:15px;line-height:1.6;font-weight:700;margin:16px 0 10px;color:#222;',h5:'font-size:14px;line-height:1.6;font-weight:700;margin:14px 0 8px;color:#333;',h6:'font-size:13px;line-height:1.6;font-weight:700;margin:12px 0 8px;color:#333;',p:'font-size:14px;line-height:1.85;margin:10px 0;color:#222;text-align:justify;',blockquote:'margin:14px 0;padding:10px 14px;border-left:4px solid #3e7bfa;background:#f4f7ff;color:#3a4a77;font-size:13px;line-height:1.8;',ul:'margin:10px 0;padding-left:24px;line-height:1.85;color:#222;font-size:14px;',ol:'margin:10px 0;padding-left:24px;line-height:1.85;color:#222;font-size:14px;',li:'margin:6px 0;',a:'color:#276ef1;text-decoration:none;border-bottom:1px solid #8eb2ff;',img:'max-width:100%;display:block;margin:16px auto;border-radius:6px;',pre:'background:#f6f8fa;border:1px solid #e2e8f0;border-radius:8px;padding:12px;overflow:auto;line-height:1.6;font-size:12px;',code:'background:#f1f4f8;padding:2px 5px;border-radius:4px;font-size:90%;font-family:Menlo,Consolas,monospace;',table:'border-collapse:collapse;width:100%;margin:12px 0;font-size:12px;',th:'border:1px solid #d9e2f0;padding:8px;background:#f7faff;text-align:left;',td:'border:1px solid #d9e2f0;padding:8px;',hr:'border:none;border-top:1px solid #dbe3ef;margin:24px 0;'
  }},
  tech: { section: 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;word-break:break-word;color:#1a2433;', styles: {
    h1:'font-size:25px;line-height:1.55;font-weight:800;margin:36px 0 22px;color:#0b3b8b;border-bottom:2px solid #dce9ff;padding-bottom:8px;',h2:'font-size:21px;line-height:1.6;font-weight:700;margin:32px 0 20px;color:#1456c5;',h3:'font-size:17px;line-height:1.6;font-weight:700;margin:28px 0 10px;color:#1d3f6f;',h4:'font-size:15px;line-height:1.6;font-weight:700;margin:16px 0 10px;color:#1d3f6f;',p:'font-size:14px;line-height:1.9;margin:10px 0;color:#1f2d3d;text-align:justify;',blockquote:'margin:14px 0;padding:12px 14px;border-left:4px solid #5b8dff;background:#f5f8ff;color:#2a4f8a;font-size:13px;line-height:1.85;',ul:'margin:10px 0;padding-left:24px;line-height:1.9;color:#1f2d3d;font-size:14px;',ol:'margin:10px 0;padding-left:24px;line-height:1.9;color:#1f2d3d;font-size:14px;',li:'margin:6px 0;',a:'color:#1456c5;text-decoration:none;border-bottom:1px dashed #7aa2ff;',img:'max-width:100%;display:block;margin:18px auto;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.08);',pre:'background:#eef6ff;color:#1b3f75;border:1px solid #cfe2ff;border-radius:8px;padding:12px;overflow:auto;line-height:1.65;font-size:12px;',code:'background:#eef4ff;padding:2px 6px;border-radius:4px;font-size:90%;font-family:Menlo,Consolas,monospace;color:#174ea6;',table:'border-collapse:collapse;width:100%;margin:12px 0;font-size:12px;',th:'border:1px solid #d3e3ff;padding:8px;background:#edf3ff;text-align:left;color:#1d3f6f;',td:'border:1px solid #d3e3ff;padding:8px;',hr:'border:none;border-top:1px solid #dce6ff;margin:24px 0;'
  }},
  green: { section: 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;word-break:break-word;color:#2b2b2b;', styles: {
    h1:'font-size:25px;line-height:1.6;font-weight:800;margin:36px 0 22px;color:#2e5b1f;',h2:'font-size:21px;line-height:1.6;font-weight:700;margin:32px 0 20px;color:#3f7f2f;',h3:'font-size:17px;line-height:1.6;font-weight:700;margin:28px 0 10px;color:#4a6b2f;',h4:'font-size:15px;line-height:1.6;font-weight:700;margin:16px 0 10px;color:#4a6b2f;',p:'font-size:14px;line-height:1.95;margin:10px 0;color:#2f2f2f;text-align:justify;',blockquote:'margin:14px 0;padding:12px 14px;border-left:4px solid #7abf45;background:#f6fbef;color:#486a30;font-size:13px;line-height:1.85;',ul:'margin:10px 0;padding-left:24px;line-height:1.9;color:#2f2f2f;font-size:14px;',ol:'margin:10px 0;padding-left:24px;line-height:1.9;color:#2f2f2f;font-size:14px;',li:'margin:6px 0;',a:'color:#3f7f2f;text-decoration:none;border-bottom:1px solid #9fd57a;',img:'max-width:100%;display:block;margin:16px auto;border-radius:6px;',pre:'background:#f6f8f0;border:1px solid #d8e6c6;border-radius:8px;padding:12px;overflow:auto;line-height:1.6;font-size:12px;',code:'background:#eef5e7;padding:2px 6px;border-radius:4px;font-size:90%;font-family:Menlo,Consolas,monospace;color:#496e2d;',table:'border-collapse:collapse;width:100%;margin:12px 0;font-size:12px;',th:'border:1px solid #d5e4c5;padding:8px;background:#f2f8ea;text-align:left;color:#496e2d;',td:'border:1px solid #d5e4c5;padding:8px;',hr:'border:none;border-top:1px solid #dbe8cf;margin:24px 0;'
  }},
  health: makeTokenTheme({
    bodyFont: '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
    text: '#183d34',
    heading: '#123f34',
    accent: '#0f8f67',
    strong: '#087857',
    quoteBg: '#f7fcf9',
    quoteBorder: '#5a8f75',
    codeBg: '#edf7f2',
    codeText: '#0f3129',
    hr: '#dcebe3',
    markBg: '#e5f5ee',
    pageBg: 'linear-gradient(rgba(18,63,52,0.045) 1px,transparent 1px),linear-gradient(90deg,rgba(18,63,52,0.045) 1px,transparent 1px),#f4faf7',
    pageBgSize: '48px 48px,48px 48px,auto',
  }),
  newspaper: { section: 'font-family:Georgia,"PingFang SC","Microsoft YaHei",serif;word-break:break-word;color:#1f1f1f;', styles: {
    h1:'font-size:28px;line-height:1.45;font-weight:700;margin:36px 0 22px;color:#111;',h2:'font-size:22px;line-height:1.5;font-weight:700;margin:32px 0 20px;color:#1b1b1b;',h3:'font-size:18px;line-height:1.55;font-weight:700;margin:28px 0 10px;color:#2b2b2b;',h4:'font-size:16px;line-height:1.55;font-weight:700;margin:16px 0 10px;color:#2b2b2b;',p:'font-size:15px;line-height:2;margin:10px 0;color:#1f1f1f;text-align:justify;',blockquote:'margin:14px 0;padding:10px 14px;border-left:4px solid #999;background:#f8f8f8;color:#444;font-size:13px;line-height:1.85;',ul:'margin:10px 0;padding-left:24px;line-height:1.9;color:#1f1f1f;font-size:15px;',ol:'margin:10px 0;padding-left:24px;line-height:1.9;color:#1f1f1f;font-size:15px;',li:'margin:6px 0;',a:'color:#1155cc;text-decoration:underline;',img:'max-width:100%;display:block;margin:18px auto;',pre:'background:#f5f5f5;border:1px solid #e3e3e3;border-radius:4px;padding:12px;overflow:auto;line-height:1.6;font-size:12px;',code:'background:#f0f0f0;padding:2px 5px;border-radius:3px;font-size:90%;font-family:Menlo,Consolas,monospace;',table:'border-collapse:collapse;width:100%;margin:12px 0;font-size:12px;',th:'border:1px solid #ddd;padding:8px;background:#f7f7f7;text-align:left;',td:'border:1px solid #ddd;padding:8px;',hr:'border:none;border-top:1px solid #ddd;margin:24px 0;'
  }},
  magazine: makeTokenTheme({
    bodyFont: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
    text: '#2f2f33',
    heading: '#7a1f1f',
    accent: '#c23a3a',
    strong: '#992d2d',
    quoteBg: '#fff3f2',
    quoteBorder: '#c23a3a',
    codeBg: '#ffeef0',
    codeText: '#9c2f3a',
    hr: '#e8c2c2',
    markBg: '#ffe0de',
  }),
  ocean: makeTokenTheme({
    bodyFont: '-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
    text: '#1f3a3d',
    heading: '#0b4f55',
    accent: '#0e9594',
    strong: '#0a7e7d',
    quoteBg: '#effbfa',
    quoteBorder: '#0e9594',
    codeBg: '#e8f6f5',
    codeText: '#0b6b6a',
    hr: '#cdeae8',
    markBg: '#d6f3f1',
  }),
  minimal: { section: 'font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;word-break:break-word;color:#111827;', styles: {
    h1:'font-size:26px;line-height:1.45;font-weight:700;margin:30px 0 18px;color:#111827;',h2:'font-size:21px;line-height:1.5;font-weight:700;margin:24px 0 14px;color:#1f2937;',h3:'font-size:17px;line-height:1.6;font-weight:600;margin:20px 0 10px;color:#374151;',h4:'font-size:15px;line-height:1.6;font-weight:600;margin:16px 0 8px;color:#374151;',p:'font-size:15px;line-height:2.05;margin:14px 0;color:#111827;',blockquote:'margin:16px 0;padding:0 0 0 14px;border-left:3px solid #111827;background:transparent;color:#374151;font-size:14px;line-height:1.95;',ul:'margin:12px 0;padding-left:22px;line-height:2;color:#111827;font-size:15px;',ol:'margin:12px 0;padding-left:22px;line-height:2;color:#111827;font-size:15px;',li:'margin:6px 0;',a:'color:#111827;text-decoration:underline;',img:'max-width:100%;display:block;margin:22px auto;border-radius:2px;',pre:'background:#fafafa;border:1px solid #ececec;border-radius:6px;padding:12px;overflow:auto;line-height:1.65;font-size:12px;',code:'background:#f3f4f6;padding:2px 5px;border-radius:4px;font-size:90%;font-family:Menlo,Consolas,monospace;',table:'border-collapse:collapse;width:100%;margin:12px 0;font-size:12px;',th:'border-bottom:1px solid #d1d5db;padding:8px 6px;text-align:left;',td:'border-bottom:1px solid #e5e7eb;padding:8px 6px;',hr:'border:none;border-top:1px solid #e5e7eb;margin:28px 0;'
  }},
  retro: { section: 'font-family:Georgia,"Times New Roman","PingFang SC",serif;word-break:break-word;color:#2d2418;', styles: {
    h1:'font-size:28px;line-height:1.5;font-weight:700;margin:24px 0 14px;color:#4a3215;',h2:'font-size:22px;line-height:1.55;font-weight:700;margin:20px 0 12px;color:#5f3f17;',h3:'font-size:18px;line-height:1.6;font-weight:700;margin:16px 0 10px;color:#704a1a;',h4:'font-size:16px;line-height:1.6;font-weight:700;margin:14px 0 8px;color:#704a1a;',p:'font-size:15px;line-height:2;margin:12px 0;color:#2f261b;text-align:justify;',blockquote:'margin:16px 0;padding:12px 14px;border-left:4px solid #8b6a35;background:#f8f2e8;color:#5a4423;font-size:14px;line-height:1.9;',ul:'margin:10px 0;padding-left:24px;line-height:1.95;color:#2f261b;font-size:15px;',ol:'margin:10px 0;padding-left:24px;line-height:1.95;color:#2f261b;font-size:15px;',li:'margin:6px 0;',a:'color:#7a4e14;text-decoration:none;border-bottom:1px solid #c8a870;',img:'max-width:100%;display:block;margin:20px auto;border:6px solid #f0e3cc;border-radius:2px;',pre:'background:#f8f2e8;border:1px solid #e4d1ad;border-radius:6px;padding:12px;overflow:auto;line-height:1.65;font-size:12px;',code:'background:#f2e7d4;padding:2px 5px;border-radius:3px;font-size:90%;font-family:Menlo,Consolas,monospace;color:#704a1a;',table:'border-collapse:collapse;width:100%;margin:12px 0;font-size:12px;',th:'border:1px solid #d7c19a;padding:8px;background:#f7ebd6;text-align:left;',td:'border:1px solid #d7c19a;padding:8px;',hr:'border:none;border-top:1px solid #d7c19a;margin:24px 0;'
  }},
  night: { section: 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;word-break:break-word;color:#cbd5ff;background:#0f1220;padding:14px;border-radius:12px;', styles: {
    h1:'font-size:27px;line-height:1.5;font-weight:800;margin:24px 0 14px;color:#9ec5ff;',h2:'font-size:22px;line-height:1.55;font-weight:700;margin:20px 0 12px;color:#84f0ff;',h3:'font-size:18px;line-height:1.6;font-weight:700;margin:16px 0 10px;color:#b9a3ff;',h4:'font-size:16px;line-height:1.6;font-weight:700;margin:14px 0 8px;color:#b9a3ff;',p:'font-size:15px;line-height:1.95;margin:12px 0;color:#d5dbff;text-align:justify;',blockquote:'margin:16px 0;padding:12px 14px;border-left:4px solid #7c8cff;background:#171b2f;color:#aebcff;font-size:14px;line-height:1.85;',ul:'margin:10px 0;padding-left:24px;line-height:1.9;color:#d5dbff;font-size:15px;',ol:'margin:10px 0;padding-left:24px;line-height:1.9;color:#d5dbff;font-size:15px;',li:'margin:6px 0;',a:'color:#7de3ff;text-decoration:none;border-bottom:1px dashed #7de3ff;',img:'max-width:100%;display:block;margin:20px auto;border-radius:10px;box-shadow:0 0 0 1px #2c3255,0 8px 24px rgba(0,0,0,.35);',pre:'background:#171b2f;border:1px solid #2f3763;border-radius:8px;padding:12px;overflow:auto;line-height:1.65;font-size:12px;color:#d6e0ff;',code:'background:#23294a;padding:2px 6px;border-radius:4px;font-size:90%;font-family:Menlo,Consolas,monospace;color:#9ec5ff;',table:'border-collapse:collapse;width:100%;margin:12px 0;font-size:12px;',th:'border:1px solid #2f3763;padding:8px;background:#1f2440;text-align:left;color:#9ec5ff;',td:'border:1px solid #2f3763;padding:8px;color:#d5dbff;',hr:'border:none;border-top:1px solid #2f3763;margin:24px 0;'
  }},
  elegant: makeTokenTheme({
    bodyFont: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif',
    text: '#4a3a30',
    heading: '#5a3826',
    accent: '#b08968',
    strong: '#8a5a36',
    quoteBg: '#fffaf2',
    quoteBorder: '#d8b891',
    codeBg: '#f7efe4',
    codeText: '#6b4a35',
    hr: '#eadcc9',
    markBg: '#f6e6cf',
    pageBg: '#fff8ee',
  }),
  vivid: makeTokenTheme({
    bodyFont: '"PingFang SC","Microsoft YaHei",sans-serif',
    text: '#233044',
    heading: '#d94841',
    accent: '#ff6b6b',
    headingBg: '#f1665d',
    headingText: '#ffffff',
    headingVariant: 'ribbon',
    headingTailBg: '#e5e7eb',
    headingLine: '#ff6b6b',
    strong: '#e05252',
    quoteBg: '#fff4f4',
    quoteBorder: '#ff6b6b',
    codeBg: '#fff8f1',
    hr: '#ffd6d6',
    markBg: '#ffe3e3',
  }),
  warmred: { section: 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;word-break:break-word;color:#3b2e2a;background:#fffcfa;padding:16px;', styles: {
    h1:'font-size:24px;line-height:1.6;font-weight:800;margin:36px 0 18px;color:#c0392b;text-align:center;',h2:'font-size:20px;line-height:1.6;font-weight:700;margin:32px 0 16px;color:#c0392b;text-align:center;border-bottom:2px solid #c0392b;padding-bottom:8px;display:inline-block;',h3:'font-size:17px;line-height:1.6;font-weight:700;margin:28px 0 12px;color:#c0392b;',h4:'font-size:15px;line-height:1.6;font-weight:700;margin:22px 0 10px;color:#a93226;',h5:'font-size:14px;line-height:1.6;font-weight:700;margin:18px 0 8px;color:#a93226;',h6:'font-size:13px;line-height:1.6;font-weight:700;margin:14px 0 8px;color:#a93226;',p:'font-size:15px;line-height:2.0;margin:14px 0;color:#3b2e2a;text-align:justify;letter-spacing:.3px;',strong:'color:#c0392b;font-weight:700;',blockquote:'margin:18px 0;padding:14px 18px;border-left:4px solid #c0392b;background:#fef5f0;color:#7a2e1f;font-size:14px;line-height:1.9;border-radius:0 8px 8px 0;',ul:'margin:14px 0;padding-left:22px;line-height:2.0;color:#3b2e2a;font-size:15px;',ol:'margin:14px 0;padding-left:22px;line-height:2.0;color:#3b2e2a;font-size:15px;',li:'margin:8px 0;',a:'color:#c0392b;text-decoration:none;border-bottom:1px solid #e8a89a;',img:'max-width:100%;display:block;margin:20px auto;border-radius:8px;',pre:'background:#f7ede0;border:1px solid #ecdcc8;border-radius:10px;padding:14px;overflow:auto;line-height:1.7;font-size:12px;',code:'background:#f7ede0;padding:2px 6px;border-radius:4px;font-size:90%;font-family:Menlo,Consolas,monospace;color:#a93226;',table:'border-collapse:collapse;width:100%;margin:14px 0;font-size:13px;',th:'border:1px solid #ecdcc8;padding:10px;background:#f7ede0;text-align:left;color:#7a2e1f;font-weight:700;',td:'border:1px solid #ecdcc8;padding:10px;',hr:'border:none;border-top:2px solid #c0392b;margin:28px 0;width:40%;margin-left:auto;margin-right:auto;'
  }},
  amber: { section: 'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;word-break:break-word;color:#2c2c2c;', styles: {
    h1:'font-size:20px;line-height:1.6;font-weight:800;margin:40px 0 28px;color:#fff;text-align:center;background:#c8722a;border-radius:8px;padding:10px 28px;display:inline-block;width:auto;',h2:'font-size:18px;line-height:1.6;font-weight:800;margin:36px 0 24px;color:#fff;text-align:center;background:#c8722a;border-radius:8px;padding:8px 24px;display:inline-block;width:auto;',h3:'font-size:16px;line-height:1.6;font-weight:700;margin:30px 0 18px;color:#c8722a;font-weight:700;',h4:'font-size:15px;line-height:1.6;font-weight:700;margin:24px 0 14px;color:#c8722a;',h5:'font-size:14px;line-height:1.6;font-weight:700;margin:20px 0 12px;color:#c8722a;',h6:'font-size:13px;line-height:1.6;font-weight:700;margin:16px 0 10px;color:#c8722a;',p:'font-size:15px;line-height:2.0;margin:18px 0;color:#2c2c2c;text-align:justify;letter-spacing:.2px;',strong:'color:#c8722a;font-weight:700;',blockquote:'margin:20px 0;padding:14px 18px;border-left:4px solid #c8722a;background:#fdf5ec;color:#7a4010;font-size:14px;line-height:1.95;border-radius:0 8px 8px 0;',ul:'margin:16px 0;padding-left:22px;line-height:2.0;color:#2c2c2c;font-size:15px;',ol:'margin:16px 0;padding-left:8px;line-height:2.0;color:#2c2c2c;font-size:15px;list-style:none;',li:'margin:10px 0;',a:'color:#c8722a;text-decoration:none;border-bottom:1px solid #e8b07a;',img:'max-width:100%;display:block;margin:24px auto;border-radius:8px;',pre:'background:#fdf5ec;border:1px solid #f0d5b0;border-radius:8px;padding:14px;overflow:auto;line-height:1.65;font-size:12px;',code:'background:#faebd7;padding:2px 6px;border-radius:4px;font-size:90%;font-family:Menlo,Consolas,monospace;color:#a05a20;',table:'border-collapse:collapse;width:100%;margin:16px 0;font-size:13px;',th:'border:1px solid #f0d5b0;padding:10px;background:#fdf0e0;text-align:left;color:#7a4010;',td:'border:1px solid #f0d5b0;padding:10px;',hr:'border:none;border-top:1px solid #f0d5b0;margin:28px 0;'
  }}
};


/** 主题顺序与中文名，与 MarkNice 下拉框一致 */
export const themeList: { key: string; label: string; swatch: string }[] = [
  { key: 'claude', label: '暖陶米白', swatch: '#d97757' },
  { key: 'minimal', label: '极简留白', swatch: '#111827' },
  { key: 'night', label: '暗夜深色', swatch: '#0f1220' },
  { key: 'simple', label: '简洁蓝', swatch: '#3e7bfa' },
  { key: 'elegant', label: '优雅棕', swatch: '#b08968' },
  { key: 'vivid', label: '活力红', swatch: '#f1665d' },
  { key: 'amber', label: '琥珀橙', swatch: '#c8722a' },
  { key: 'green', label: '清新绿', swatch: '#7abf45' },
  { key: 'health', label: '健康绿', swatch: '#0f8f67' },
  { key: 'magazine', label: '杂志红', swatch: '#c23a3a' },
  { key: 'retro', label: '复古纸', swatch: '#8b6a35' },
  { key: 'ocean', label: '海盐青', swatch: '#0e9594' },
  { key: 'tech', label: '科技蓝', swatch: '#1456c5' },
  { key: 'newspaper', label: '报刊体', swatch: '#555555' },
  { key: 'warmred', label: '暖阳红', swatch: '#c0392b' }
]

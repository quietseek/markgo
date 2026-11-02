/**
 * Mermaid 主题：仿 PlantUML `skin rose` 配色（浅黄底 #FEFECE、玫红描边 #A80036、黄色便签 #FBFB77、投影）。
 * 基于 base 主题（唯一可完整自定义的内置主题）；base 主题会用 khroma 推导派生色，所有颜色必须写成十六进制。
 * rose 只有浅色版本，深色模式按同样的色相调暗；复制 / 导出 / 发布统一用浅色。
 */

/** 分类色：饼图、git 分支等需要区分多个系列的图表，取自 PlantUML 类图图标等配色 */
const PALETTE_LIGHT = ['#ADD1B2', '#EB937F', '#B4A7E5', '#A9DCDF', '#FBFB77', '#E2A0B2', '#FEFECE', '#C9C9C9', '#D8B56F', '#9DB8D9', '#CFA0A0', '#A9C79A']
const PALETTE_DARK = ['#5E7D63', '#A0604F', '#6D6299', '#5A8C8F', '#9A9A3E', '#9A5E70', '#6E6C4E', '#6A6A6A', '#8C7340', '#5C7899', '#8E5F5F', '#64825A']

function indexed(prefix: string, colors: string[], start = 0) {
  return Object.fromEntries(colors.map((c, i) => [`${prefix}${i + start}`, c]))
}

const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif'

function colors(dark: boolean) {
  return dark
    ? {
        bg: '#1b1c1f',
        node: '#3a3826',
        node2: '#33321f',
        border: '#d0587e',
        text: '#ece9d8',
        line: '#d0587e',
        cluster: '#202125',
        clusterBorder: '#8a8c93',
        groupHead: '#2c2e33',
        note: '#4a4720',
        noteText: '#f2eeb8',
        activation: '#26282c',
        done: '#34363b',
        doneBorder: '#6f7279',
        crit: '#5a2433',
        grid: '#33353b',
        shadow: 'rgba(0, 0, 0, 0.45)',
        palette: PALETTE_DARK
      }
    : {
        bg: '#FFFFFF',
        node: '#FEFECE',
        node2: '#FEFECE',
        border: '#A80036',
        text: '#000000',
        line: '#A80036',
        cluster: '#FFFFFF',
        clusterBorder: '#000000',
        groupHead: '#EEEEEE',
        note: '#FBFB77',
        noteText: '#000000',
        activation: '#FFFFFF',
        done: '#EEEEEE',
        doneBorder: '#9A9A9A',
        crit: '#F7C6D1',
        grid: '#E4E4E4',
        shadow: 'rgba(0, 0, 0, 0.22)',
        palette: PALETTE_LIGHT
      }
}

function variables(dark: boolean): Record<string, string | number | boolean> {
  const c = colors(dark)
  return {
    darkMode: dark,
    background: c.bg,
    fontFamily: FONT,
    fontSize: '14px',

    // 通用（流程图、类图、状态图、ER 图等由此派生）
    primaryColor: c.node,
    primaryBorderColor: c.border,
    primaryTextColor: c.text,
    secondaryColor: c.node2,
    secondaryBorderColor: c.border,
    secondaryTextColor: c.text,
    tertiaryColor: c.cluster,
    tertiaryBorderColor: c.clusterBorder,
    tertiaryTextColor: c.text,
    lineColor: c.line,
    arrowheadColor: c.line,
    textColor: c.text,
    titleColor: c.text,
    mainBkg: c.node,
    nodeBorder: c.border,
    nodeTextColor: c.text,
    clusterBkg: c.cluster,
    clusterBorder: c.clusterBorder,
    edgeLabelBackground: c.bg,
    labelBackgroundColor: c.bg,
    noteBkgColor: c.note,
    noteBorderColor: c.border,
    noteTextColor: c.noteText,
    specialStateColor: c.text,
    innerEndBackground: c.text,
    attributeBackgroundColorOdd: c.bg,
    attributeBackgroundColorEven: c.node,

    // 时序图：参与者浅黄、生命线与箭头玫红、分组框黑边灰标签
    actorBkg: c.node,
    actorBorder: c.border,
    actorTextColor: c.text,
    actorLineColor: c.border,
    signalColor: c.line,
    signalTextColor: c.text,
    labelBoxBkgColor: c.groupHead,
    labelBoxBorderColor: c.clusterBorder,
    labelTextColor: c.text,
    loopTextColor: c.text,
    activationBkgColor: c.activation,
    activationBorderColor: c.border,
    sequenceNumberColor: dark ? c.bg : '#FFFFFF',

    // 甘特图
    sectionBkgColor: c.node,
    altSectionBkgColor: c.bg,
    sectionBkgColor2: c.node,
    taskBkgColor: c.node,
    taskBorderColor: c.border,
    taskTextColor: c.text,
    taskTextLightColor: c.text,
    taskTextDarkColor: c.text,
    taskTextOutsideColor: c.text,
    activeTaskBkgColor: c.note,
    activeTaskBorderColor: c.border,
    doneTaskBkgColor: c.done,
    doneTaskBorderColor: c.doneBorder,
    critBkgColor: c.crit,
    critBorderColor: c.border,
    gridColor: c.grid,
    todayLineColor: c.line,

    // 饼图
    ...indexed('pie', c.palette, 1),
    pieStrokeColor: c.border,
    pieStrokeWidth: '1px',
    pieOuterStrokeColor: c.border,
    pieOuterStrokeWidth: '1px',
    pieOpacity: '1',
    pieTitleTextColor: c.text,
    pieSectionTextColor: c.text,
    pieLegendTextColor: c.text,

    // 思维导图 / 时间线 / 旅程图：和 PlantUML 思维导图一样，所有节点同色
    ...indexed('cScale', c.palette.map(() => c.node)),
    ...indexed('cScaleLabel', c.palette.map(() => c.text)),
    ...indexed('cScalePeer', c.palette.map(() => c.border)),
    scaleLabelColor: c.text,

    // git 图
    ...indexed('git', c.palette.slice(0, 8)),
    ...indexed('gitBranchLabel', c.palette.slice(0, 8).map(() => c.text)),
    commitLabelColor: c.text,
    commitLabelBackground: c.node,
    tagLabelColor: c.text,
    tagLabelBackground: c.node,
    tagLabelBorder: c.border
  }
}

/** themeVariables 管不到的细节：投影、直角、线宽、连线标签底色 */
function css(dark: boolean): string {
  const c = colors(dark)
  const shadow = `drop-shadow(3px 3px 2px ${c.shadow})`
  return `
    .node rect, .node polygon, .node circle, .node ellipse, .node path { stroke-width: 1.2px; }
    .node > rect, .node > polygon, .node > circle, .node > ellipse, .node > path, .node .basic.label-container,
    rect.actor, .note, .task, .statediagram-state rect.basic, g.classGroup rect, .er.entityBox,
    .mindmap-node .node-bkg, .section-root circle { filter: ${shadow}; }
    .cluster rect { rx: 0; ry: 0; stroke-width: 1px; }
    .flowchart-link, .edgePath .path, .transition, .relation { stroke-width: 1.2px; }
    .edgeLabel, .edgeLabel rect, .labelBkg { background-color: ${c.bg}; fill: ${c.bg}; opacity: 1; }
    rect.actor { stroke-width: 1.5px; }
    .actor-line { stroke-dasharray: 5 5; }
    .note { stroke-width: 1px; }
    .labelBox { stroke-width: 1px; }
    .loopLine { stroke-width: 1px; stroke: ${c.clusterBorder}; }
    .messageLine0, .messageLine1 { stroke-width: 1.2px; }
    .task { stroke-width: 1px; }
    .grid .tick line { stroke: ${c.grid}; opacity: 1; }
    .grid path { stroke-width: 0; }
    .statediagram-state rect.basic { rx: 10px; ry: 10px; }
    [class*="section-edge"] { stroke: ${c.line}; stroke-width: 1.5px; }
    .mindmap-node .node-bkg, .section-root circle, .section--1 circle { fill: ${c.node}; stroke: ${c.border}; stroke-width: 1.2px; }
    .section-root text, .section--1 text { fill: ${c.text}; }
  `
}

export function mermaidThemeConfig(dark: boolean) {
  return { theme: 'base' as const, themeVariables: variables(dark), themeCSS: css(dark), fontFamily: FONT }
}

import type { SiteConfigInput } from '../../src/types/config';

/**
 * 内容仓库的站点配置。
 *
 * 主题会用 src/config/define.ts 里的 defineSiteConfig() 校验并补全默认值，
 * 因此这里只写需要覆盖的字段即可；字段说明见主题仓库 docs/configuration.md。
 *
 * 类型来自主题仓库的 src/types/config.ts，使用 import type 只参与 TypeScript
 * 检查，编译/擦除后没有运行时依赖，所以单独 clone 的内容仓库仍能被读取。
 * 用 SiteConfigInput（输入类型，字段可省略）而不是解析后的 SiteConfig。
 *
 * 这份文件属于内容仓库，不要从主题的 src/config/site.ts 直接复制 import。
 */
const siteConfig = {
  title: 'Daybook · 内容仓库',
  subtitle: '把内容放在另一个仓库里。',
  description: 'Daybook 的独立内容仓库示例：日记、文章、独立页面与关于页都放在这里。',
  url: 'https://daybook.test.ksable.top',
  author: 'kissablecho',
  lang: 'zh_CN',
  timezone: 'Asia/Shanghai',
  since: 2024,
  theme: 'system',
  pagination: { daily: 8, post: 8 },
  comments: { enabled: false },
  seo: { ogImage: '/og-default.png' },
  sitemap: { enabled: true },
  robots: { enabled: true },
  copyright: { enabled: true, yearFrom: 2024 },
} satisfies SiteConfigInput;

export default siteConfig;

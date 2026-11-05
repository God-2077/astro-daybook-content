import type { LinksConfigInput } from '../../src/types/config';

/**
 * 友链页配置。
 *
 * 主题会调用 defineLinksConfig() 校验；groups 可以是空数组。
 * 类型来自主题仓库的 src/types/config.ts；import type 运行时会擦除。
 */
const linksConfig = {
  groups: [
    {
      name: '示例分组',
      description: '把这里换成你自己的友链。',
      links: [{ name: 'Astro', url: 'https://astro.build', description: '本站使用的框架。' }],
    },
  ],
} satisfies LinksConfigInput;

export default linksConfig;
